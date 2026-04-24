import { Router } from 'express';
import prisma from '../db/prisma.js';
import { InvoiceService } from '../services/invoice.service.js';
import { AuthRequest } from '../middlewares/auth.middleware.js';
import { ensureWarehouseAccess, getAccessContext, getScopedWarehouseId, ensureAdminAccess } from '../utils/access.js';
import { getCanonicalDefaultCustomer } from '../utils/defaultCustomer.js';
import { parsePaginationQuery, setPaginationHeaders } from '../utils/pagination.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';

const router = Router();

/**
 * Utility to verify invoice ownership and warehouse access
 */
async function verifyInvoiceAccess(access: any, invoiceId: number, options?: { requireOwnership?: boolean }) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { warehouseId: true, userId: true, cancelled: true }
  });
  
  if (!invoice) throw new NotFoundError('Накладная не найдена');
  
  const isOwner = Number(invoice.userId) === Number(access.userId);
  const hasWarehouseAccess = ensureWarehouseAccess(access, invoice.warehouseId);

  if (!access.isAdmin) {
    if (!hasWarehouseAccess) throw new ForbiddenError('Forbidden');
    if (options?.requireOwnership && !isOwner) {
      throw new ForbiddenError('Можно редактировать только свои накладные');
    }
  }

  return invoice;
}

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const warehouseId = getScopedWarehouseId(access, req.query.warehouseId);
    const pagination = parsePaginationQuery(req.query, { defaultLimit: 500, maxLimit: 1000 });

    const { invoices, total } = await InvoiceService.getInvoices(access, {
      warehouseId: warehouseId || undefined,
      pagination,
    });

    setPaginationHeaders(res, { ...pagination, total });
    res.json(invoices);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const invoiceId = Number(req.params.id);
    
    await verifyInvoiceAccess(access, invoiceId);

    const invoice = await InvoiceService.getInvoiceDetails(invoiceId);
    res.json(invoice);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const userId = req.user!.id;
    const warehouseId = access.isAdmin ? Number(req.body.warehouseId) : access.warehouseId;
    
    if (!warehouseId) throw new ValidationError('Склад обязателен');

    const requestedCustomerId = Number(req.body.customerId);
    const customerId = (Number.isFinite(requestedCustomerId) && requestedCustomerId > 0)
      ? requestedCustomerId
      : (await getCanonicalDefaultCustomer(prisma, userId)).id;

    const invoice = await InvoiceService.createInvoice({
      ...req.body,
      customerId,
      userId,
      warehouseId,
    });
    res.status(201).json(invoice);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const invoiceId = Number(req.params.id);
    
    const invoiceMeta = await verifyInvoiceAccess(access, invoiceId, { requireOwnership: true });

    const requestedCustomerId = Number(req.body.customerId);
    const customerId = (Number.isFinite(requestedCustomerId) && requestedCustomerId > 0)
      ? requestedCustomerId
      : (await getCanonicalDefaultCustomer(prisma, req.user?.id || null)).id;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, active: true },
    });
    if (!customer || !customer.active) throw new ValidationError('Клиент не найден или неактивен');

    const hasItemsUpdate = Array.isArray(req.body.items);
    const invoice = hasItemsUpdate
      ? await InvoiceService.updateInvoice(invoiceId, {
          customerId,
          userId: req.user!.id,
          isAdmin: access.isAdmin,
          items: req.body.items,
          discount: req.body.discount !== undefined ? Number(req.body.discount) : undefined,
        })
      : await InvoiceService.reassignCustomer(invoiceId, customerId);
    
    res.json(invoice);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/cancel', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const invoiceId = Number(req.params.id);
    
    ensureAdminAccess(access);
    await verifyInvoiceAccess(access, invoiceId);

    const result = await InvoiceService.cancelInvoice(invoiceId, req.user!.id, { force: true });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/return', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const invoiceId = Number(req.params.id);
    
    await verifyInvoiceAccess(access, invoiceId);

    const result = await InvoiceService.returnItems(invoiceId, {
      ...req.body,
      userId: req.user!.id,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const invoiceId = Number(req.params.id);

    ensureAdminAccess(access);
    const invoice = await verifyInvoiceAccess(access, invoiceId);

    if (!invoice.cancelled) {
      await InvoiceService.cancelInvoice(invoiceId, req.user!.id, { force: true });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
