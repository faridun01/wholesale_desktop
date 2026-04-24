import { Router } from 'express';
import prisma from '../db/prisma.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { getAccessContext, getScopedWarehouseId } from '../utils/access.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { commonReportsQuerySchema, transactionsQuerySchema } from '../schemas/reports.schemas.js';
import { ReportService } from '../services/report.service.js';
import {
  buildCancelledInvoiceWhere,
  buildInventoryWhere,
  buildInvoiceLineReportRows,
} from './reports.helpers.js';

const router = Router();

// Re-importing helpers for inline use if needed, though they should ideally be in service
const getRemainingQuantity = (item: any) => Math.max(0, Number(item?.quantity || 0) - Number(item?.returnedQty || 0));
const getInvoiceLineHelpers = () => ({
  getRemainingQuantity,
  getLineNetRevenue: (inv: any, item: any) => {
    // This is a duplication of service logic but needed for the helper-based reports for now
    const remainingQty = getRemainingQuantity(item);
    if (remainingQty <= 0) return 0;
    const remainingSubtotal = (inv.items || []).reduce((sum: number, i: any) => sum + Number(i.sellingPrice || 0) * getRemainingQuantity(i), 0);
    const lineRemainingSubtotal = Number(item.sellingPrice || 0) * remainingQty;
    const invoiceNetAmount = Number(inv.netAmount || 0);
    if (remainingSubtotal <= 0.0001 || invoiceNetAmount <= 0.0001) return lineRemainingSubtotal;
    return (lineRemainingSubtotal / remainingSubtotal) * invoiceNetAmount;
  },
  getLineCost: (item: any) => {
    const originalQty = Number(item?.quantity || 0);
    const remainingQty = getRemainingQuantity(item);
    if (remainingQty <= 0) return 0;
    const allocatedCost = Array.isArray(item.saleAllocations)
      ? item.saleAllocations.reduce((sum: number, alloc: any) => sum + Number(alloc.batch?.costPrice || 0) * Number(alloc.quantity || 0), 0)
      : 0;
    if (allocatedCost > 0.0001) {
      return (originalQty > 0.0001 && remainingQty < originalQty) ? (allocatedCost * (remainingQty / originalQty)) : allocatedCost;
    }
    return Number(item.costPrice || 0) * remainingQty;
  }
});

router.use(authenticate);

router.get('/analytics', authorize(['ADMIN']), validateRequest({ query: commonReportsQuerySchema }), async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const report = await ReportService.getAnalytics(access, req.query);
    res.json(report);
  } catch (error) {
    next(error);
  }
});

router.get('/sales', authorize(['ADMIN']), validateRequest({ query: commonReportsQuerySchema }), async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const warehouseId = getScopedWarehouseId(access, req.query.warehouse_id);
    const { start, end } = req.query;
    const where = buildCancelledInvoiceWhere({ warehouseId, start, end });

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        warehouse: { select: { name: true } },
        items: {
          include: {
            product: { select: { name: true, unit: true } },
            saleAllocations: { include: { batch: { select: { costPrice: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const helpers = getInvoiceLineHelpers();
    const report = buildInvoiceLineReportRows({
      invoices,
      ...helpers,
      netSalesKey: 'total_sales',
    });

    res.json(report);
  } catch (error) {
    next(error);
  }
});

router.get('/profit', validateRequest({ query: commonReportsQuerySchema }), async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    if (!access.isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const warehouseId = getScopedWarehouseId(access, req.query.warehouse_id);
    const { start, end } = req.query;
    const where = buildCancelledInvoiceWhere({ warehouseId, start, end });

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        warehouse: { select: { name: true } },
        items: {
          include: {
            product: { select: { name: true, unit: true } },
            saleAllocations: { include: { batch: { select: { costPrice: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const helpers = getInvoiceLineHelpers();
    const report = buildInvoiceLineReportRows({
      invoices,
      ...helpers,
      netSalesKey: 'net_sales',
    });

    res.json(report);
  } catch (error) {
    next(error);
  }
});

router.get('/returns', authorize(['ADMIN']), validateRequest({ query: commonReportsQuerySchema }), async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const warehouseId = getScopedWarehouseId(access, req.query.warehouse_id);
    const { start, end } = req.query;
    const where = buildInventoryWhere({ type: 'return', warehouseId, start, end });

    const transactions = await prisma.inventoryTransaction.findMany({
      where,
      include: { product: true, warehouse: true, user: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json(transactions.map((t: any) => ({
      return_id: t.referenceId || t.id,
      date: t.createdAt.toISOString().split('T')[0],
      warehouse_name: t.warehouse?.name || '',
      staff_name: t.user?.username || '',
      product_name: t.product?.name || 'Удаленный товар',
      unit: t.product?.unit || '',
      quantity: Math.abs(t.qtyChange),
      selling_price: Number(t.sellingAtTime || 0),
      total_value: Math.abs(t.qtyChange) * Number(t.sellingAtTime || 0),
      reason: t.reason,
    })).filter(row => !/^Invoice #\d+ Cancelled$/i.test(row.reason || '')));
  } catch (error) {
    next(error);
  }
});

router.get('/writeoffs', authorize(['ADMIN', 'MANAGER']), validateRequest({ query: commonReportsQuerySchema }), async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const warehouseId = getScopedWarehouseId(access, req.query.warehouse_id);
    const { start, end } = req.query;
    const where = buildInventoryWhere({
      type: 'adjustment', warehouseId, start, end,
      additional: { qtyChange: { lt: 0 } },
    });

    const transactions = await prisma.inventoryTransaction.findMany({
      where,
      include: { product: true, warehouse: true, user: true },
      orderBy: { createdAt: 'desc' },
    });

    const report = await Promise.all(transactions.map(async (t: any) => {
      const returnedQty = await prisma.inventoryTransaction.aggregate({
        where: { type: 'adjustment', qtyChange: { gt: 0 }, referenceId: t.id },
        _sum: { qtyChange: true }
      }).then(r => r._sum.qtyChange || 0);

      const originalQty = Math.abs(t.qtyChange);
      return {
        transaction_id: t.id,
        date: t.createdAt.toISOString().split('T')[0],
        warehouse_name: t.warehouse?.name || '',
        staff_name: t.user?.username || '',
        product_name: t.product?.name || '',
        unit: t.product?.unit || '',
        quantity: originalQty,
        returned_qty: returnedQty,
        cost_price: Number(t.costAtTime || 0),
        total_value: originalQty * Number(t.costAtTime || 0),
        reason: String(t.reason || '').replace(/^.*?:\s*/i, '').trim() || 'Write-off',
        can_return: originalQty > returnedQty,
        can_delete: returnedQty <= 0,
        status: returnedQty <= 0 ? 'writeoff' : (returnedQty < originalQty ? 'partial_return' : 'full_return'),
      };
    }));

    res.json(report.filter(row => row.status !== 'full_return'));
  } catch (error) {
    next(error);
  }
});

router.get('/transactions', authorize(['ADMIN']), validateRequest({ query: transactionsQuerySchema }), async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const { productId, type, limit = 50 } = req.query;
    const warehouseId = getScopedWarehouseId(access, req.query.warehouseId);
    
    const transactions = await prisma.inventoryTransaction.findMany({
      where: {
        productId: productId ? Number(productId) : undefined,
        warehouseId: warehouseId || undefined,
        type: type as string || undefined,
      },
      include: { product: true, warehouse: true, user: true },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
    });
    res.json(transactions);
  } catch (error) {
    next(error);
  }
});

export default router;
