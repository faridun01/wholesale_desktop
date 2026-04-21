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

    // 1. Add Invoices (Debits)
    invoices.forEach(inv => {
      const originalNetAmount = Number(inv.netAmount || 0) + Number(inv.returnedAmount || 0);
      events.push({
        type: 'invoice',
        id: inv.id,
        date: inv.createdAt,
        amount: originalNetAmount,
        side: 'debit',
        warehouse: inv.warehouse?.name || 'Основной склад',
        description: `📦 Продажа (Накладная №${inv.id})`,
        // Paid amount and status for the Dossier Tab UI
        paidAmount: Number(inv.paidAmount || 0),
        status: (Number(inv.returnedAmount) > 0 && Number(inv.netAmount) <= 0.01) ? 'Возврат' : 
                (Number(inv.paidAmount) >= Number(inv.netAmount) - 0.01 ? 'Оплачено' : 
                (Number(inv.paidAmount) > 0.01 ? 'Частично' : 'Долг'))
      });
    });

    // 2. Add Payments (Credits)
    payments.forEach(p => {
      events.push({
        type: 'payment',
        id: p.id,
        date: p.createdAt,
        amount: Number(p.amount || 0),
        side: 'credit',
        description: `💸 Оплата (${p.method})${p.invoiceId ? ` по накл. №${p.invoiceId}` : ' (Аванс)'}`
      });
    });

    // 3. Add Returns (Credits)
    returns.forEach(r => {
      events.push({
        type: 'return',
        id: r.id,
        date: r.createdAt,
        amount: Number(r.totalValue || 0),
        side: 'credit',
        description: `↩️ Возврат по накл. №${r.invoiceId} (${r.reason || 'б/п'})`
      });
    });

    // 4. Sort all events chronologically for Saldo calculation
    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 5. Calculate Running Balance (Saldo)
    let runningBalance = 0;
    events.forEach(ev => {
      if (ev.side === 'debit') {
        runningBalance += ev.amount;
      } else {
        runningBalance -= ev.amount;
      }
      ev.runningBalance = runningBalance;
    });

    // Final summary calculation
    const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.netAmount || 0), 0);
    const totalPaidGlobal = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalReturns = returns.reduce((sum, r) => sum + Number(r.totalValue || 0), 0);

    // Sort by date descending for the UI display (most recent first)
    const sortedEvents = [...events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json({
      history: sortedEvents,
      summary: {
        totalRevenue,
        totalPaid: totalPaidGlobal,
        totalReturns,
        balance: totalRevenue - totalPaidGlobal - totalReturns,
        invoiceCount: invoices.length
      }
    });
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
