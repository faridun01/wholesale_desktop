import { Router } from 'express';
import prisma from '../db/prisma.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { getAccessContext, getScopedWarehouseId } from '../utils/access.js';
import {
  buildDashboardWhere,
  buildDashboardWindows,
  computeInventoryValue,
  countUniqueProductsByName,
  filterAndSortLowStock,
  getInvoiceDebt,
  getPeriodRevenue,
  safePercentChange,
} from './dashboard.helpers.js';

const router = Router();

router.get('/summary', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    if (!access.isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const windows = buildDashboardWindows(new Date());

    // Get user from request (assuming auth middleware is present)
    // For now, we'll get all stats, but in a real app, we'd filter by role.
    const isAdmin = access.isAdmin;
    const selectedWarehouseId = getScopedWarehouseId(access, req.query.warehouseId);
    const { invoiceWhere, productWhere, lowStockProductWhere, customerWhere, warehouseWhere } = buildDashboardWhere({
      isAdmin,
      selectedWarehouseId,
      accessWarehouseId: access.warehouseId,
      accessCity: access.city,
    });

    const [
      salesToday,
      totalProductsRaw,
      inventoryBatches,
      totalCustomers,
      totalWarehouses,
      totalOrders,
      lowStockRaw,
      recentSales,
      allInvoices,
      reminders,
      currentMonthInvoices,
      previousMonthInvoices,
      currentMonthCustomers,
      previousMonthCustomers,
      currentMonthProductsRaw,
      previousMonthProductsRaw,
    ] = await Promise.all([
      prisma.invoice.aggregate({
        where: { ...invoiceWhere, createdAt: { gte: windows.today } },
        _sum: { netAmount: true },
      }),
      prisma.product.findMany({
        where: productWhere,
        select: { id: true, name: true, createdAt: true },
      }),
      prisma.productBatch.findMany({
        where: {
          warehouseId: selectedWarehouseId ?? (isAdmin ? undefined : (access.warehouseId ?? -1)),
          remainingQuantity: { gt: 0 },
        },
        select: {
          remainingQuantity: true,
          costPrice: true,
        },
      }),
      prisma.customer.count({ where: customerWhere }),
      prisma.warehouse.count({ where: warehouseWhere }),
      prisma.invoice.count({ where: invoiceWhere }),
      prisma.product.findMany({
        where: lowStockProductWhere,
        select: {
          id: true,
          name: true,
          stock: true,
          unit: true,
          baseUnitName: true,
          packagings: {
            where: { active: true },
            select: {
              id: true,
              packageName: true,
              baseUnitName: true,
              unitsPerPackage: true,
              isDefault: true,
            },
          },
          warehouseId: true,
          warehouse: {
            select: {
              id: true,
              name: true,
              city: true,
            },
          },
        },
      }),
      prisma.invoice.findMany({
        where: invoiceWhere,
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          createdAt: true,
          netAmount: true,
          status: true,
          customer: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.invoice.findMany({
        where: invoiceWhere,
        select: {
          id: true,
          createdAt: true,
          netAmount: true,
          paidAmount: true,
          items: {
            select: {
              productId: true,
              quantity: true,
              returnedQty: true,
              sellingPrice: true,
              costPrice: true,
            },
          },
        },
      }),
      prisma.reminder.findMany({
        where: { userId: req.user!.id, isCompleted: false },
        orderBy: { dueDate: 'asc' },
        take: 5
      }),
      prisma.invoice.findMany({
        where: {
          ...invoiceWhere,
          createdAt: { gte: windows.monthStart, lt: windows.nextMonthStart },
        },
        select: { netAmount: true },
      }),
      prisma.invoice.findMany({
        where: {
          ...invoiceWhere,
          createdAt: { gte: windows.prevMonthStart, lt: windows.monthStart },
        },
        select: { netAmount: true },
      }),
      prisma.customer.count({
        where: {
          ...customerWhere,
          createdAt: { gte: windows.monthStart, lt: windows.nextMonthStart },
        },
      }),
      prisma.customer.count({
        where: {
          ...customerWhere,
          createdAt: { gte: windows.prevMonthStart, lt: windows.monthStart },
        },
      }),
      prisma.product.findMany({
        where: {
          ...productWhere,
          createdAt: { gte: windows.monthStart, lt: windows.nextMonthStart },
        },
        select: { name: true },
      }),
      prisma.product.findMany({
        where: {
          ...productWhere,
          createdAt: { gte: windows.prevMonthStart, lt: windows.monthStart },
        },
        select: { name: true },
      }),
    ]);

    const totalProducts = selectedWarehouseId
      ? totalProductsRaw.length
      : countUniqueProductsByName(totalProductsRaw as Array<{ name: string }>);

    const inventoryValue = computeInventoryValue(inventoryBatches);

    const currentMonthProducts = selectedWarehouseId
      ? currentMonthProductsRaw.length
      : countUniqueProductsByName(currentMonthProductsRaw as Array<{ name: string }>);

    const lowStock = filterAndSortLowStock(lowStockRaw as any[]);

    const previousMonthProducts = selectedWarehouseId
      ? previousMonthProductsRaw.length
      : countUniqueProductsByName(previousMonthProductsRaw as Array<{ name: string }>);

    // Calculate total profit and debts
    let totalProfit = 0;
    let totalDebts = 0;
    let totalRevenue = 0;

    for (const inv of allInvoices) {
      totalRevenue += Number(inv.netAmount || 0);
      totalDebts += getInvoiceDebt(Number(inv.netAmount || 0), Number(inv.paidAmount || 0));
      
      if (isAdmin) {
        for (const item of inv.items) {
          const quantitySold = Number(item.quantity) - Number(item.returnedQty);
          totalProfit += (Number(item.sellingPrice) - Number(item.costPrice)) * quantitySold;
        }
      }
    }

    // Calculate top products
    const productSales: any = {};
    for (const inv of allInvoices) {
      for (const item of inv.items) {
        productSales[item.productId] = (productSales[item.productId] || 0) + item.quantity;
      }
    }

    const topProductIds = Object.keys(productSales)
      .sort((a, b) => productSales[b] - productSales[a])
      .slice(0, 5)
      .map(Number);

    const topProductsRaw = await prisma.product.findMany({
      where: { id: { in: topProductIds }, warehouseId: isAdmin ? undefined : (access.warehouseId ?? -1) },
      select: {
        id: true,
        name: true,
        stock: true,
        unit: true,
        category: {
          select: {
            name: true,
          },
        },
      }
    });

    const topProducts = topProductsRaw.map((p: any) => ({
      ...p,
      totalSold: productSales[p.id]
    })).sort((a: any, b: any) => b.totalSold - a.totalSold);

    const currentRevenue = currentMonthInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.netAmount || 0), 0);
    const previousRevenue = previousMonthInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.netAmount || 0), 0);
    const revenueChange = safePercentChange(currentRevenue, previousRevenue);
    const ordersChange = safePercentChange(currentMonthInvoices.length, previousMonthInvoices.length);
    const customersChange = safePercentChange(currentMonthCustomers, previousMonthCustomers);
    const productsChange = safePercentChange(currentMonthProducts, previousMonthProducts);
    const periodRevenue = {
      week: {
        current: getPeriodRevenue(allInvoices, windows.weekStart, windows.tomorrowStart),
        previous: getPeriodRevenue(allInvoices, windows.prevWeekStart, windows.weekStart),
      },
      month: {
        current: getPeriodRevenue(allInvoices, windows.monthStart, windows.nextMonthStart),
        previous: getPeriodRevenue(allInvoices, windows.prevMonthStart, windows.monthStart),
      },
      quarter: {
        current: getPeriodRevenue(allInvoices, windows.quarterStart, windows.nextQuarterStart),
        previous: getPeriodRevenue(allInvoices, windows.prevQuarterStart, windows.quarterStart),
      },
      year: {
        current: getPeriodRevenue(allInvoices, windows.yearStart, windows.nextYearStart),
        previous: getPeriodRevenue(allInvoices, windows.prevYearStart, windows.yearStart),
      },
      today: {
        current: getPeriodRevenue(allInvoices, windows.todayStart, windows.tomorrowStart),
        previous: getPeriodRevenue(allInvoices, windows.yesterdayStart, windows.todayStart),
      },
    };

    res.json({
      todaySales: Number(salesToday._sum.netAmount || 0),
      totalProducts,
      totalCustomers,
      totalWarehouses,
      totalOrders,
      selectedWarehouseId,
      totalRevenue,
      inventoryValue,
      totalProfit: isAdmin ? totalProfit : null,
      totalDebts,
      lowStock,
      recentSales,
      overviewSales: allInvoices.map((invoice: any) => ({
        id: invoice.id,
        createdAt: invoice.createdAt,
        netAmount: invoice.netAmount,
      })),
      topProducts,
      reminders: reminders || [],
      metricChanges: {
        revenue: revenueChange,
        orders: ordersChange,
        customers: customersChange,
        products: productsChange,
      },
      overviewChanges: {
        week: safePercentChange(periodRevenue.week.current, periodRevenue.week.previous),
        month: safePercentChange(periodRevenue.month.current, periodRevenue.month.previous),
        quarter: safePercentChange(periodRevenue.quarter.current, periodRevenue.quarter.previous),
        year: safePercentChange(periodRevenue.year.current, periodRevenue.year.previous),
        today: safePercentChange(periodRevenue.today.current, periodRevenue.today.previous),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
