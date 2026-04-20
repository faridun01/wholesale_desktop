import { Router } from 'express';
import prisma from '../db/prisma.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { getAccessContext, getScopedWarehouseId } from '../utils/access.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { commonReportsQuerySchema, transactionsQuerySchema } from '../schemas/reports.schemas.js';
import {
  buildCancelledInvoiceWhere,
  buildCreatedAtRange,
  buildInventoryWhere,
  buildInvoiceLineReportRows,
} from './reports.helpers.js';

const router = Router();
const MONEY_EPSILON = 0.0001;

function getRemainingQuantity(item: any) {
  return Math.max(0, Number(item?.quantity || 0) - Number(item?.returnedQty || 0));
}

function getInvoiceSubtotal(items: any[]) {
  return items.reduce((sum, item) => sum + Number(item.sellingPrice || 0) * Number(item.quantity || 0), 0);
}

function getRemainingSubtotal(items: any[]) {
  return items.reduce((sum, item) => sum + Number(item.sellingPrice || 0) * getRemainingQuantity(item), 0);
}

function getLineNetRevenue(invoice: any, item: any) {
  const remainingQty = getRemainingQuantity(item);
  if (remainingQty <= 0) return 0;

  const remainingSubtotal = getRemainingSubtotal(invoice.items || []);
  const lineRemainingSubtotal = Number(item.sellingPrice || 0) * remainingQty;
  const invoiceNetAmount = Number(invoice.netAmount || 0);

  if (remainingSubtotal <= MONEY_EPSILON) {
    return lineRemainingSubtotal;
  }

  if (invoiceNetAmount <= MONEY_EPSILON) {
    return lineRemainingSubtotal;
  }

  return (lineRemainingSubtotal / remainingSubtotal) * invoiceNetAmount;
}

function getLineCost(item: any) {
  const originalQty = Number(item?.quantity || 0);
  const remainingQty = getRemainingQuantity(item);
  if (remainingQty <= 0) return 0;

  const allocatedCost = Array.isArray(item.saleAllocations)
    ? item.saleAllocations.reduce((sum: number, alloc: any) => sum + Number(alloc.batch?.costPrice || 0) * Number(alloc.quantity || 0), 0)
    : 0;

  if (allocatedCost > MONEY_EPSILON) {
    if (originalQty > MONEY_EPSILON && remainingQty < originalQty) {
      return allocatedCost * (remainingQty / originalQty);
    }
    return allocatedCost;
  }

  const averageCost = Number(item.costPrice || 0);
  return averageCost * remainingQty;
}

router.use(authenticate);

router.get('/analytics', authorize(['ADMIN']), validateRequest({ query: commonReportsQuerySchema }), async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const isAdmin = access.isAdmin;
    const warehouseId = getScopedWarehouseId(access, req.query.warehouse_id);
    const { start, end } = req.query;
    const whereClause = buildCancelledInvoiceWhere({ warehouseId, start, end });

    const [invoices, products, customers, warehouses, batches, writeoffTransactions, expenses] = await Promise.all([
      prisma.invoice.findMany({
        where: whereClause,
        select: {
          netAmount: true,
          paidAmount: true,
          warehouseId: true,
          createdAt: true,
          customer: {
            select: {
              id: true,
              name: true,
            },
          },
          user: {
            select: {
              id: true,
              username: true,
            },
          },
          items: {
            select: {
              quantity: true,
              returnedQty: true,
              sellingPrice: true,
              costPrice: true,
              product: {
                select: {
                  id: true,
                  name: true,
                },
              },
              saleAllocations: {
                select: {
                  quantity: true,
                  batch: {
                    select: {
                      costPrice: true,
                    },
                  },
                },
              },
            },
          },
          warehouse: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.product.count({ where: { active: true, warehouseId: warehouseId ?? undefined } }),
      prisma.customer.count({ where: { active: true, city: access.isAdmin ? undefined : (access.city ?? '__no_city__') } }),
      prisma.warehouse.findMany({ where: access.isAdmin ? { active: true } : { active: true, id: access.warehouseId ?? -1, city: access.city ?? undefined } }),
      prisma.productBatch.findMany({
        where: {
          remainingQuantity: { gt: 0 },
          warehouseId: warehouseId ?? undefined
        }
      }),
      prisma.inventoryTransaction.findMany({
        where: buildInventoryWhere({
          type: 'adjustment',
          warehouseId,
          start,
          end,
          additional: { qtyChange: { lt: 0 } },
        }),
        select: {
          qtyChange: true,
          costAtTime: true,
          reason: true,
          user: {
            select: {
              id: true,
              username: true,
            },
          },
          warehouse: {
            select: {
              id: true,
              name: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.expense.findMany({
        where: {
          warehouseId: warehouseId ?? undefined,
          expenseDate: (start || end) ? buildCreatedAtRange({ start, end }) : undefined,
        },
        select: {
          amount: true,
          category: true,
        },
      }),
    ]);

    let totalRevenue = 0;
    let totalProfit = 0;
    let totalCost = 0;
    let totalExpenses = 0;
    const totalSalesCount = invoices.length;
    let totalDebts = 0;

    for (const expense of expenses) {
      totalExpenses += Number(expense.amount || 0);
    }

    const monthlyData: any = {};
    const warehousePerformance: any = {};
    const productPerformance: Record<string, { id: number; name: string; quantity: number; revenue: number; profit: number }> = {};
    const staffPerformance: Record<string, { id: number; name: string; invoices: number; revenue: number; profit: number }> = {};
    const customerPerformance: Record<string, { id: number; name: string; invoices: number; revenue: number; debt: number }> = {};

    for (const inv of invoices) {
      const month = inv.createdAt.toLocaleString('ru-RU', { month: 'short' });
      if (!monthlyData[month]) {
        monthlyData[month] = { name: month, sales: 0, profit: 0 };
      }

      const netAmount = Number(inv.netAmount);
      const paidAmount = Number(inv.paidAmount);

      totalRevenue += netAmount;
      const invoiceDebt = Math.max(0, netAmount - paidAmount);
      totalDebts += invoiceDebt;
      monthlyData[month].sales += netAmount;

      if (!warehousePerformance[inv.warehouseId]) {
        warehousePerformance[inv.warehouseId] = { name: inv.warehouse.name, sales: 0, profit: 0 };
      }
      warehousePerformance[inv.warehouseId].sales += netAmount;

      const staffKey = String(inv.user?.id || 0);
      if (!staffPerformance[staffKey]) {
        staffPerformance[staffKey] = {
          id: Number(inv.user?.id || 0),
          name: inv.user?.username || 'Неизвестно',
          invoices: 0,
          revenue: 0,
          profit: 0,
        };
      }
      staffPerformance[staffKey].invoices += 1;
      staffPerformance[staffKey].revenue += netAmount;

      const customerKey = String(inv.customer?.id || 0);
      if (!customerPerformance[customerKey]) {
        customerPerformance[customerKey] = {
          id: Number(inv.customer?.id || 0),
          name: inv.customer?.name || 'Без клиента',
          invoices: 0,
          revenue: 0,
          debt: 0,
        };
      }
      customerPerformance[customerKey].invoices += 1;
      customerPerformance[customerKey].revenue += netAmount;
      customerPerformance[customerKey].debt += invoiceDebt;

      for (const item of inv.items) {
        const lineRevenue = getLineNetRevenue(inv, item);
        const lineCost = getLineCost(item);
        const lineProfit = lineRevenue - lineCost;
        const quantity = getRemainingQuantity(item);
        const productKey = String(item.product?.id || 0);

        totalCost += lineCost;
        if (isAdmin) {
          totalProfit += lineProfit;
          monthlyData[month].profit += lineProfit;
          warehousePerformance[inv.warehouseId].profit += lineProfit;
          staffPerformance[staffKey].profit += lineProfit;
        }

        if (!productPerformance[productKey]) {
          productPerformance[productKey] = {
            id: Number(item.product?.id || 0),
            name: item.product?.name || 'Без названия',
            quantity: 0,
            revenue: 0,
            profit: 0,
          };
        }

        productPerformance[productKey].quantity += quantity;
        productPerformance[productKey].revenue += lineRevenue;
        productPerformance[productKey].profit += lineProfit;
      }
    }

    const stockValuation = batches.reduce((sum: number, b: any) => sum + (Number(b.costPrice) * b.remainingQuantity), 0);
    const writeoffByReason: Record<string, { name: string; quantity: number; value: number; operations: number }> = {};
    const writeoffByStaff: Record<string, { id: number; name: string; quantity: number; value: number; operations: number }> = {};
    const writeoffByProduct: Record<string, { id: number; name: string; quantity: number; value: number; operations: number }> = {};
    const writeoffByWarehouse: Record<string, { id: number; name: string; quantity: number; value: number; operations: number }> = {};

    for (const transaction of writeoffTransactions) {
      const quantity = Math.abs(Number(transaction.qtyChange || 0));
      const value = quantity * Number(transaction.costAtTime || 0);
      const normalizedReason = String(transaction.reason || '').replace(/^.*?:\s*/i, '').trim() || 'Списание';
      const reasonKey = normalizedReason.toLowerCase();
      const staffKey = String(transaction.user?.id || 0);
      const productKey = String(transaction.product?.id || 0);

      if (!writeoffByReason[reasonKey]) {
        writeoffByReason[reasonKey] = { name: normalizedReason, quantity: 0, value: 0, operations: 0 };
      }
      writeoffByReason[reasonKey].quantity += quantity;
      writeoffByReason[reasonKey].value += value;
      writeoffByReason[reasonKey].operations += 1;

      if (!writeoffByStaff[staffKey]) {
        writeoffByStaff[staffKey] = {
          id: Number(transaction.user?.id || 0),
          name: transaction.user?.username || 'Неизвестно',
          quantity: 0,
          value: 0,
          operations: 0,
        };
      }
      writeoffByStaff[staffKey].quantity += quantity;
      writeoffByStaff[staffKey].value += value;
      writeoffByStaff[staffKey].operations += 1;

      if (!writeoffByProduct[productKey]) {
        writeoffByProduct[productKey] = {
          id: Number(transaction.product?.id || 0),
          name: transaction.product?.name || 'Без названия',
          quantity: 0,
          value: 0,
          operations: 0,
        };
      }
      writeoffByProduct[productKey].quantity += quantity;
      writeoffByProduct[productKey].value += value;
      writeoffByProduct[productKey].operations += 1;

      const warehouseKey = String(transaction.warehouse?.id || 0);
      if (!writeoffByWarehouse[warehouseKey]) {
        writeoffByWarehouse[warehouseKey] = {
          id: Number(transaction.warehouse?.id || 0),
          name: transaction.warehouse?.name || 'Без склада',
          quantity: 0,
          value: 0,
          operations: 0,
        };
      }
      writeoffByWarehouse[warehouseKey].quantity += quantity;
      writeoffByWarehouse[warehouseKey].value += value;
      writeoffByWarehouse[warehouseKey].operations += 1;
    }

    res.json({
      summary: {
        totalRevenue,
        totalProfit: isAdmin ? totalProfit : null,
        totalCost: isAdmin ? totalCost : null,
        totalExpenses: isAdmin ? totalExpenses : null,
        totalSalesCount,
        totalCustomers: customers,
        totalProducts: products,
        totalDebts,
        stockValuation: isAdmin ? stockValuation : null,
        margin: isAdmin ? (totalRevenue > 0 ? ((totalProfit - totalExpenses) / totalRevenue) * 100 : 0) : null,
        netProfit: isAdmin ? (totalProfit - totalExpenses) : null,
      },
      chartData: Object.values(monthlyData),
      warehousePerformance: Object.values(warehousePerformance),
      productPerformance: Object.values(productPerformance)
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 20),
      staffPerformance: Object.values(staffPerformance)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 20),
      customerPerformance: Object.values(customerPerformance)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 20),
      customerDebts: Object.values(customerPerformance)
        .filter((item) => item.debt > MONEY_EPSILON)
        .sort((a, b) => b.debt - a.debt)
        .slice(0, 20),
      writeoffReasons: Object.values(writeoffByReason)
        .sort((a, b) => b.value - a.value)
        .slice(0, 20),
      writeoffByStaff: Object.values(writeoffByStaff)
        .sort((a, b) => b.value - a.value)
        .slice(0, 20),
      writeoffByProduct: Object.values(writeoffByProduct)
        .sort((a, b) => b.value - a.value)
        .slice(0, 20),
      writeoffByWarehouse: Object.values(writeoffByWarehouse)
        .sort((a, b) => b.value - a.value)
        .slice(0, 20),
    });
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
      select: {
        id: true,
        createdAt: true,
        discount: true,
        netAmount: true,
        customer: { select: { name: true } },
        warehouse: { select: { name: true } },
        items: {
          select: {
            quantity: true,
            returnedQty: true,
            sellingPrice: true,
            costPrice: true,
            product: { select: { name: true, unit: true } },
            saleAllocations: {
              select: {
                quantity: true,
                batch: { select: { costPrice: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const report = buildInvoiceLineReportRows({
      invoices,
      getRemainingQuantity,
      getLineNetRevenue,
      getLineCost,
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
    if (!access.isAdmin) {
      return res.status(403).json({ error: '?????? ????????. ?????? ??? ???????????????.' });
    }

    const warehouseId = getScopedWarehouseId(access, req.query.warehouse_id);
    const { start, end } = req.query;
    const where = buildCancelledInvoiceWhere({ warehouseId, start, end });

    const invoices = await prisma.invoice.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        discount: true,
        netAmount: true,
        customer: { select: { name: true } },
        warehouse: { select: { name: true } },
        items: {
          select: {
            quantity: true,
            returnedQty: true,
            sellingPrice: true,
            costPrice: true,
            product: { select: { name: true, unit: true } },
            saleAllocations: {
              select: {
                quantity: true,
                batch: { select: { costPrice: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const report = buildInvoiceLineReportRows({
      invoices,
      getRemainingQuantity,
      getLineNetRevenue,
      getLineCost,
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
      include: {
        product: true,
        warehouse: true,
        user: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const report = transactions
      .map((t: any) => ({
        return_id: t.referenceId || t.id,
        date: t.createdAt.toISOString().split('T')[0],
        warehouse_name: t.warehouse?.name || '',
        staff_name: t.user?.username || '',
        product_name: t.product.name,
        unit: t.product.unit || '',
        quantity: Math.abs(t.qtyChange),
        selling_price: Number(t.sellingAtTime || 0),
        total_value: Math.abs(t.qtyChange) * Number(t.sellingAtTime || 0),
        reason: t.reason,
      }))
      .filter((row) => !/^Invoice #\d+ Cancelled$/i.test(String(row.reason || '').trim()));

    res.json(report);
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
      type: 'adjustment',
      warehouseId,
      start,
      end,
      additional: {
        qtyChange: { lt: 0 },
        sellingAtTime: { not: null },
      },
    });

    const transactions = await prisma.inventoryTransaction.findMany({
      where,
      include: {
        product: true,
        warehouse: true,
        user: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const transactionIds = transactions.map((transaction: any) => Number(transaction.id)).filter((id: number) => Number.isFinite(id) && id > 0);
    const returnTransactions = transactionIds.length
      ? await prisma.inventoryTransaction.findMany({
          where: {
            type: 'adjustment',
            qtyChange: { gt: 0 },
            referenceId: { in: transactionIds },
          },
          select: {
            referenceId: true,
            qtyChange: true,
          },
        })
      : [];

    const report = transactions.map((t: any) => {
      const returnedQty = returnTransactions
        .filter(
          (candidate: any) =>
            Number(candidate.referenceId || 0) === Number(t.id) &&
            Number(candidate.qtyChange || 0) > 0
        )
        .reduce((sum: number, candidate: any) => sum + Number(candidate.qtyChange || 0), 0);

      const originalQty = Math.abs(Number(t.qtyChange || 0));

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
        status:
          returnedQty <= 0
            ? 'writeoff'
            : returnedQty < originalQty
              ? 'partial_return'
              : 'full_return',
      };
    }).filter((row) => row.status !== 'full_return');

    res.json(report);
  } catch (error) {
    next(error);
  }
});

router.get('/transactions', validateRequest({ query: transactionsQuerySchema }), async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    if (!access.isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { productId, type, limit = 50 } = req.query;
    const warehouseId = getScopedWarehouseId(access, req.query.warehouseId);
    const transactions = await prisma.inventoryTransaction.findMany({
      where: {
        productId: productId ? Number(productId) : undefined,
        warehouseId: warehouseId ?? undefined,
        type: type as string || undefined,
      },
      include: {
        product: true,
        warehouse: true,
        user: true,
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
    });
    res.json(transactions);
  } catch (error) {
    next(error);
  }
});

export default router;
