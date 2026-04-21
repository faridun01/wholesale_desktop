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
