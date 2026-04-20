import { Router } from 'express';
import prisma from '../db/prisma.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { getAccessContext } from '../utils/access.js';
import { maskInvoiceFinancials } from '../utils/customerVisibility.js';
import { DEFAULT_CUSTOMER_NAME, getCanonicalDefaultCustomer, isDefaultCustomerName, mergeDuplicateCustomers } from '../utils/defaultCustomer.js';
import { parsePaginationQuery, setPaginationHeaders } from '../utils/pagination.js';

const router = Router();
const PAYMENT_EPSILON = 0.01;
const normalizeCustomerName = (value: string | null | undefined) => String(value || '').trim().toLowerCase();

const normalizeOptionalString = (value: unknown) => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const buildCustomerPayload = (body: any, access: any) => {
  const customerType = String(body?.customerType || 'individual').trim().toLowerCase() === 'company' ? 'company' : 'individual';
  const companyName = normalizeOptionalString(body?.companyName);
  const contactName = normalizeOptionalString(body?.contactName);
  const fallbackName = normalizeOptionalString(body?.name);
  const name = customerType === 'company'
    ? companyName || contactName || fallbackName || ''
    : contactName || fallbackName || '';

  return {
    customerType,
    name,
    customerCategory: normalizeOptionalString(body?.customerCategory),
    companyName,
    contactName,
    phone: normalizeOptionalString(body?.phone),
    country: normalizeOptionalString(body?.country),
    region: normalizeOptionalString(body?.region),
    city: access.isAdmin ? normalizeOptionalString(body?.city) : normalizeOptionalString(access.city),
    address: normalizeOptionalString(body?.address),
    notes: normalizeOptionalString(body?.notes),
  };
};

const findCustomerByNormalizedName = async (name: string, excludeCustomerId?: number) => {
  const normalizedName = normalizeCustomerName(name);
  if (!normalizedName) {
    return null;
  }

  const customers = await prisma.customer.findMany({
    where: {
      name: {
        equals: String(name || '').trim(),

      },
    },
    select: { id: true, name: true },
  });

  return (
    customers.find((customer: { id: number; name: string }) =>
      customer.id !== excludeCustomerId && normalizeCustomerName(customer.name) === normalizedName,
    ) || null
  );
};

const getInvoiceBalance = (invoice: { netAmount: number; paidAmount: number }) => {
  return Number(invoice.netAmount || 0) - Number(invoice.paidAmount || 0);
};

const getCustomerSegment = (params: {
  totalInvoiced: number;
  invoiceCount: number;
  averageInvoice: number;
}) => {
  const { totalInvoiced, invoiceCount, averageInvoice } = params;

  if (totalInvoiced >= 10000 || invoiceCount >= 20 || averageInvoice >= 1500) {
    return 'VIP';
  }

  if (totalInvoiced >= 5000 || invoiceCount >= 10 || averageInvoice >= 700) {
    return 'Постоянный';
  }

  if (invoiceCount >= 2 || totalInvoiced >= 1000) {
    return 'Обычный';
  }

  return 'Новый';
};

const mapCustomerWithTotals = (customer: any) => {
  const invoices = Array.isArray(customer.invoices) ? customer.invoices : [];
  const totalInvoiced = invoices.reduce((sum: number, invoice: any) => sum + Number(invoice.netAmount || 0), 0);
  const totalPaid = invoices.reduce(
    (sum: number, invoice: any) => sum + Number(invoice.paidAmount || 0),
    0,
  );
  const balance = invoices.reduce((sum: number, invoice: any) => sum + getInvoiceBalance(invoice), 0);
  const paidInvoices = invoices.filter((invoice: any) => getInvoiceBalance(invoice) <= PAYMENT_EPSILON);
  const partialInvoices = invoices.filter((invoice: any) => {
    const invoicePaidAmount = Math.max(0, Number(invoice.paidAmount || 0));
    const invoiceBalance = getInvoiceBalance(invoice);
    return invoicePaidAmount > PAYMENT_EPSILON && invoiceBalance > PAYMENT_EPSILON;
  });
  const unpaidInvoices = invoices.filter((invoice: any) => {
    const invoicePaidAmount = Math.max(0, Number(invoice.paidAmount || 0));
    const invoiceBalance = getInvoiceBalance(invoice);
    return invoicePaidAmount <= PAYMENT_EPSILON && invoiceBalance > PAYMENT_EPSILON;
  });
  const paidInvoicedTotal = paidInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.netAmount || 0), 0);
  const paidCollectedTotal = paidInvoices.reduce(
    (sum: number, invoice: any) => sum + Number(invoice.paidAmount || 0),
    0,
  );
  const partialInvoicedTotal = partialInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.netAmount || 0), 0);
  const partialCollectedTotal = partialInvoices.reduce(
    (sum: number, invoice: any) => sum + Number(invoice.paidAmount || 0),
    0,
  );
  const unpaidInvoicedTotal = unpaidInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.netAmount || 0), 0);
  const paidInvoiceCount = invoices.filter((invoice: any) => getInvoiceBalance(invoice) <= PAYMENT_EPSILON).length;
  const partialInvoiceCount = partialInvoices.length;
  const unpaidInvoiceCount = unpaidInvoices.length;
  const invoiceCount = invoices.length;
  const averageInvoice = invoiceCount > 0 ? totalInvoiced / invoiceCount : 0;
  const customerSegment = getCustomerSegment({
    totalInvoiced,
    invoiceCount,
    averageInvoice,
  });
  const lastPurchaseAt = invoices.reduce((latest: string | null, invoice: any) => {
    const current = invoice?.createdAt ? new Date(invoice.createdAt).toISOString() : null;
    if (!current) {
      return latest;
    }
    if (!latest) {
      return current;
    }
    return new Date(current).getTime() > new Date(latest).getTime() ? current : latest;
  }, null);
  const warehouseNames = Array.from(
    new Set(
      invoices
        .map((invoice: any) => String(invoice?.warehouse?.name || '').trim())
        .filter(Boolean),
    ),
  );

  return {
    ...customer,
    total_invoiced: totalInvoiced,
    total_paid: totalPaid,
    balance,
    invoice_count: invoiceCount,
    paid_invoice_count: paidInvoiceCount,
    partial_invoice_count: partialInvoiceCount,
    unpaid_invoice_count: unpaidInvoiceCount,
    paid_invoiced_total: paidInvoicedTotal,
    paid_collected_total: paidCollectedTotal,
    partial_invoiced_total: partialInvoicedTotal,
    partial_collected_total: partialCollectedTotal,
    unpaid_invoiced_total: unpaidInvoicedTotal,
    average_invoice: averageInvoice,
    customer_segment: customerSegment,
    last_purchase_at: lastPurchaseAt,
    warehouse_names: warehouseNames,
  };
};

const getCustomerAccess = async (
  access: Awaited<ReturnType<typeof getAccessContext>>,
  customerId: number,
  options?: { requireOwnership?: boolean },
) => {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, createdByUserId: true },
  });

  if (!customer) {
    return { customer: null, allowed: false };
  }

  if (access.isAdmin) {
    return { customer, allowed: true };
  }

  if (!options?.requireOwnership) {
    return { customer, allowed: true };
  }

  return {
    customer,
    allowed: customer.createdByUserId === access.userId,
  };
};

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const defaultCustomer = await mergeDuplicateCustomers(prisma, req.user?.id || null);
    const { page, limit, skip } = parsePaginationQuery(req.query, { defaultLimit: 500, maxLimit: 1000 });

    const baseWhere: any = {
      OR: [
        { active: true },
        { invoices: { some: {} } },
        { payments: { some: {} } },
        { returns: { some: {} } },
      ],
    };

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where: baseWhere,
        include: {
          invoices: {
            where: { cancelled: false },
            select: {
              netAmount: true,
              paidAmount: true,
              createdAt: true,
              warehouse: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.customer.count({ where: baseWhere }),
    ]);

    setPaginationHeaders(res, { page, limit, total });

    const mappedCustomers = customers.map(mapCustomerWithTotals);
    mappedCustomers.sort((a: any, b: any) => {
      if (a.id === defaultCustomer?.id) return -1;
      if (b.id === defaultCustomer?.id) return 1;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    const customersToReturn = mappedCustomers
      .filter((customer: any) => customer.id !== defaultCustomer?.id)
      .map((customer: any) => {
        if (access.isAdmin) {
          return customer;
        }

        return {
          ...customer,
          total_invoiced: 0,
          total_paid: 0,
          balance: 0,
          average_invoice: 0,
        };
      });

    res.json(customersToReturn);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    await mergeDuplicateCustomers(prisma, req.user?.id || null);
    const payload = buildCustomerPayload(req.body, access);
    const customerName = payload.name;
    if (!customerName) {
      return res.status(400).json({ error: 'Название клиента обязательно' });
    }

    if (isDefaultCustomerName(req.body?.name)) {
      const defaultCustomer = await getCanonicalDefaultCustomer(prisma, req.user?.id || null);
      return res.json(defaultCustomer);
    }

    const duplicateCustomer = await findCustomerByNormalizedName(customerName);
    if (duplicateCustomer) {
      return res.status(400).json({ error: `Клиент с названием "${customerName}" уже существует` });
    }

    const customer = await prisma.customer.create({
      data: {
        ...payload,
        createdByUserId: req.user?.id || null,
      },
    });

    res.status(201).json(customer);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    await mergeDuplicateCustomers(prisma, req.user?.id || null);
    const customerId = Number(req.params.id);
    const payload = buildCustomerPayload(req.body, access);
    const customerName = payload.name;
    const { customer: current, allowed } = await getCustomerAccess(access, customerId, { requireOwnership: true });
    if (!current) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!customerName) {
      return res.status(400).json({ error: 'Название клиента обязательно' });
    }

    if (isDefaultCustomerName(req.body?.name)) {
      const defaultCustomer = await getCanonicalDefaultCustomer(prisma, req.user?.id || null);
      if (defaultCustomer.id !== customerId) {
        return res.status(400).json({ error: `Клиент "${DEFAULT_CUSTOMER_NAME}" уже существует` });
      }
    }

    const duplicateCustomer = await findCustomerByNormalizedName(customerName, customerId);
    if (duplicateCustomer) {
      return res.status(400).json({ error: `Клиент с названием "${customerName}" уже существует` });
    }

    const customer = await prisma.customer.update({
      where: { id: customerId },
      data: payload,
    });
    res.json(customer);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const customerId = Number(req.params.id);
    const { customer: current, allowed } = await getCustomerAccess(access, customerId, { requireOwnership: true });
    if (!current) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: { active: false },
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/invoices', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const customerId = Number(req.params.id);
    const { page, limit, skip } = parsePaginationQuery(req.query, { defaultLimit: 300, maxLimit: 1000 });
    const { customer, allowed } = await getCustomerAccess(access, customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const where = {
      customerId,
      cancelled: false,
      warehouseId: access.isAdmin ? undefined : (access.warehouseId ?? -1),
      userId: access.isAdmin ? undefined : (access.userId ?? -1),
    };

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          items: { include: { product: true } },
          payments: {
            include: { user: true },
            orderBy: { createdAt: 'desc' },
          },
          returns: {
            include: { user: true },
            orderBy: { createdAt: 'desc' },
          },
          warehouse: true,
          user: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.invoice.count({ where }),
    ]);

    setPaginationHeaders(res, { page, limit, total });

    if (access.isAdmin) {
      return res.json(invoices);
    }

    res.json(invoices.map(maskInvoiceFinancials));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/payments', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const customerId = Number(req.params.id);
    const { page, limit, skip } = parsePaginationQuery(req.query, { defaultLimit: 300, maxLimit: 1000 });
    const { customer, allowed } = await getCustomerAccess(access, customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const where = {
      customerId,
      invoice: access.isAdmin ? undefined : { warehouseId: access.warehouseId ?? -1, userId: access.userId ?? -1 },
    };

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          user: true,
          invoice: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.payment.count({ where }),
    ]);

    setPaginationHeaders(res, { page, limit, total });

    res.json(
      payments.map((p: any) => ({
        ...p,
        amount: access.isAdmin ? p.amount : 0,
        staff_name: p.user.username,
      })),
    );
  } catch (error) {
    next(error);
  }
});

router.get('/:id/returns', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const customerId = Number(req.params.id);
    const { page, limit, skip } = parsePaginationQuery(req.query, { defaultLimit: 300, maxLimit: 1000 });
    const { customer, allowed } = await getCustomerAccess(access, customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const where = {
      customerId,
      invoice: access.isAdmin ? undefined : { warehouseId: access.warehouseId ?? -1, userId: access.userId ?? -1 },
    };

    const [returns, total] = await Promise.all([
      prisma.return.findMany({
        where,
        include: {
          user: true,
          invoice: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.return.count({ where }),
    ]);

    setPaginationHeaders(res, { page, limit, total });

    res.json(
      returns.map((r: any) => ({
        ...r,
        totalValue: access.isAdmin ? r.totalValue : 0,
        staff_name: r.user.username,
      })),
    );
  } catch (error) {
    next(error);
  }
});

router.get('/:id/history', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const customerId = Number(req.params.id);
    const { page, limit, skip } = parsePaginationQuery(req.query, { defaultLimit: 300, maxLimit: 1000 });
    const { customer, allowed } = await getCustomerAccess(access, customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const where = {
      customerId,
      cancelled: false,
      warehouseId: access.isAdmin ? undefined : (access.warehouseId ?? -1),
      userId: access.isAdmin ? undefined : (access.userId ?? -1),
    };

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          items: { include: { product: true } },
          payments: {
            include: { user: true },
            orderBy: { createdAt: 'desc' },
          },
          returns: {
            include: { user: true },
            orderBy: { createdAt: 'desc' },
          },
          warehouse: true,
          user: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.invoice.count({ where }),
    ]);

    setPaginationHeaders(res, { page, limit, total });

    const history = invoices.map((invoice: any) => ({
      ...invoice,
      invoiceBalance: getInvoiceBalance(invoice),
      paymentEvents: invoice.payments.map((payment: any) => ({
        id: payment.id,
        amount: payment.amount,
        method: payment.method,
        createdAt: payment.createdAt,
        staff_name: payment.user.username,
      })),
      returnEvents: invoice.returns.map((itemReturn: any) => ({
        id: itemReturn.id,
        totalValue: itemReturn.totalValue,
        reason: itemReturn.reason,
        createdAt: itemReturn.createdAt,
        staff_name: itemReturn.user.username,
      })),
    }));

    res.json(access.isAdmin ? history : history.map(maskInvoiceFinancials));
  } catch (error) {
    next(error);
  }
});

export default router;
