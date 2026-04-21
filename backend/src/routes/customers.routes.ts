import { Router } from 'express';
import prisma from '../db/prisma.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { getAccessContext } from '../utils/access.js';
import { maskInvoiceFinancials } from '../utils/customerVisibility.js';
import { getCanonicalDefaultCustomer, isDefaultCustomerName } from '../utils/defaultCustomer.js';
import { parsePaginationQuery, setPaginationHeaders } from '../utils/pagination.js';
import { CustomerService } from '../services/customer.service.js';

const router = Router();

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const pagination = parsePaginationQuery(req.query, { defaultLimit: 500, maxLimit: 1000 });

    const { customers, total } = await CustomerService.getCustomers(access, pagination);

    setPaginationHeaders(res, { ...pagination, total });
    res.json(customers);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const userId = req.user?.id || 1;
    const customer = await CustomerService.createCustomer(userId, req.body, access);
    res.status(201).json(customer);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const customerId = Number(req.params.id);
    const userId = req.user?.id || 1;
    const customer = await CustomerService.updateCustomer(customerId, userId, req.body, access);
    res.json(customer);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const customerId = Number(req.params.id);
    
    await CustomerService.getCustomerAccess(access, customerId, { requireOwnership: true });

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
    const pagination = parsePaginationQuery(req.query, { defaultLimit: 300, maxLimit: 1000 });
    
    await CustomerService.getCustomerAccess(access, customerId);

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
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.invoice.count({ where }),
    ]);

    setPaginationHeaders(res, { ...pagination, total });

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
    const pagination = parsePaginationQuery(req.query, { defaultLimit: 300, maxLimit: 1000 });
    
    await CustomerService.getCustomerAccess(access, customerId);

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
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.payment.count({ where }),
    ]);

    setPaginationHeaders(res, { ...pagination, total });

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
    const pagination = parsePaginationQuery(req.query, { defaultLimit: 300, maxLimit: 1000 });
    
    await CustomerService.getCustomerAccess(access, customerId);

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
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.return.count({ where }),
    ]);

    setPaginationHeaders(res, { ...pagination, total });

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

router.get('/:id/reconciliation', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const customerId = Number(req.params.id);
    
    await CustomerService.getCustomerAccess(access, customerId);

    const where = {
      customerId,
      cancelled: false,
      warehouseId: access.isAdmin ? undefined : (access.warehouseId ?? -1),
      userId: access.isAdmin ? undefined : (access.userId ?? -1),
    };

    const [invoices, payments, returns] = await Promise.all([
      prisma.invoice.findMany({
        where: { customerId, cancelled: false },
        select: { 
          id: true, 
          netAmount: true, 
          paidAmount: true,
          returnedAmount: true,
          createdAt: true,
          warehouse: { select: { name: true } }
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.payment.findMany({
        where: { customerId },
        select: { 
          id: true, 
          amount: true, 
          createdAt: true, 
          method: true, 
          invoiceId: true,
          invoice: { select: { warehouse: { select: { name: true } } } }
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.return.findMany({
        where: { customerId },
        select: { 
          id: true, 
          totalValue: true, 
          createdAt: true, 
          invoiceId: true, 
          reason: true,
          invoice: { select: { warehouse: { select: { name: true } } } }
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Transform into a flat chronological list of events for the ledger
    const events: any[] = [];

    invoices.forEach(inv => {
      events.push({
        type: 'invoice',
        id: inv.id,
        date: inv.createdAt,
        amount: Number(inv.netAmount) + Number(inv.returnedAmount || 0),
        paidAmount: Number(inv.paidAmount || 0),
        side: 'debit',
        warehouse: inv.warehouse?.name || 'Основной склад',
        description: `Накладная №${inv.id}`
      });
    });

    console.log(`[DEBUG] Found ${invoices.length} invoices for customer ${customerId}`);
    if (invoices.length > 0) {
      console.log(`[DEBUG] First invoice paidAmount: ${invoices[0].paidAmount} (${typeof invoices[0].paidAmount})`);
    }

    payments.forEach(p => {
      events.push({
        type: 'payment',
        id: p.id,
        date: p.createdAt,
        amount: p.amount,
        side: 'credit',
        warehouse: p.invoice?.warehouse?.name || 'Касса',
        description: p.invoiceId ? `Оплата по накл. №${p.invoiceId}` : 'Оплата'
      });
    });

    returns.forEach(r => {
      events.push({
        type: 'return',
        id: r.id,
        date: r.createdAt,
        amount: r.totalValue,
        side: 'credit',
        warehouse: r.invoice?.warehouse?.name || 'Основной склад',
        description: `Возврат по накл. №${r.invoiceId}`
      });
    });

    // Sort by date then by type priority then by ID
    const typePriority: Record<string, number> = { invoice: 1, payment: 2, return: 3 };
    events.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      
      const pA = typePriority[a.type] || 99;
      const pB = typePriority[b.type] || 99;
      if (pA !== pB) return pA - pB;
      
      return a.id - b.id;
    });

    // Calculate running balance with logging
    let runningBalance = 0;
    const historyWithBalance = events.map((e, index) => {
      const prevBalance = runningBalance;
      if (e.side === 'debit') {
        runningBalance += e.amount;
      } else {
        runningBalance -= e.amount;
      }
      
      console.log(`[LEDGER DEBUG] Row ${index + 1}: ${e.type} #${e.id} | Amount: ${e.amount} | ${prevBalance} -> ${runningBalance}`);
      
      return { ...e, runningBalance };
    });

    res.json(historyWithBalance);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/history', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const customerId = Number(req.params.id);
    const pagination = parsePaginationQuery(req.query, { defaultLimit: 300, maxLimit: 1000 });
    
    await CustomerService.getCustomerAccess(access, customerId);

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
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.invoice.count({ where }),
    ]);

    setPaginationHeaders(res, { ...pagination, total });

    const history = invoices.map((invoice: any) => ({
      ...invoice,
      invoiceBalance: CustomerService.getInvoiceBalance(invoice),
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
