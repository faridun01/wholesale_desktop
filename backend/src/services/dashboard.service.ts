import prisma from '../db/prisma.js';
import {
  buildDashboardWhere,
  buildDashboardWindows,
  computeInventoryValue,
  countUniqueProductsByName,
  filterAndSortLowStock,
  getInvoiceDebt,
  getPeriodRevenue,
  safePercentChange,
} from '../routes/dashboard.helpers.js';

export class DashboardService {
  public static async getSummary(access: any, params: { warehouseId?: number, userId: number }) {
    const windows = buildDashboardWindows(new Date());
    const isAdmin = access.isAdmin;
    const selectedWarehouseId = params.warehouseId;

    const { invoiceWhere, productWhere, lowStockProductWhere, customerWhere, warehouseWhere } = buildDashboardWhere({
      isAdmin,
      selectedWarehouseId: selectedWarehouseId ?? null,
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
      expensesAggRaw,
      writeoffsAggRaw,
      writeoffsRaw,
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
          warehouseId: selectedWarehouseId || (isAdmin ? undefined : (access.warehouseId ?? -1)),
          remainingQuantity: { gt: 0 },
        },
        select: { remainingQuantity: true, costPrice: true },
      }),
      prisma.customer.count({ where: customerWhere }),
      prisma.warehouse.count({ where: warehouseWhere }),
      prisma.invoice.count({ where: invoiceWhere }),
      prisma.product.findMany({
        where: lowStockProductWhere,
        select: {
          id: true, name: true, stock: true, unit: true, baseUnitName: true,
          packagings: { where: { active: true }, select: { id: true, packageName: true, unitsPerPackage: true } },
          warehouse: { select: { id: true, name: true, city: true } },
        },
      }),
      prisma.invoice.findMany({
        where: invoiceWhere,
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { customer: { select: { name: true } } },
      }),
      prisma.invoice.findMany({
        where: invoiceWhere,
        select: {
          id: true, createdAt: true, netAmount: true, paidAmount: true,
          items: { select: { productId: true, quantity: true, returnedQty: true, sellingPrice: true, costPrice: true } },
        },
      }),
      prisma.reminder.findMany({
        where: { userId: params.userId, isCompleted: false },
        orderBy: { dueDate: 'asc' },
        take: 5
      }),
      // Trends calls...
      prisma.invoice.findMany({ where: { ...invoiceWhere, createdAt: { gte: windows.monthStart, lt: windows.nextMonthStart } }, select: { netAmount: true } }),
      prisma.invoice.findMany({ where: { ...invoiceWhere, createdAt: { gte: windows.prevMonthStart, lt: windows.monthStart } }, select: { netAmount: true } }),
      prisma.customer.count({ where: { ...customerWhere, createdAt: { gte: windows.monthStart, lt: windows.nextMonthStart } } }),
      prisma.customer.count({ where: { ...customerWhere, createdAt: { gte: windows.prevMonthStart, lt: windows.monthStart } } }),
      prisma.product.findMany({ where: { ...productWhere, createdAt: { gte: windows.monthStart, lt: windows.nextMonthStart } }, select: { name: true } }),
      prisma.product.findMany({ where: { ...productWhere, createdAt: { gte: windows.prevMonthStart, lt: windows.monthStart } }, select: { name: true } }),
      // Expenses and write-offs for profit adjustment
      prisma.expense.aggregate({
        where: { warehouseId: selectedWarehouseId ?? (isAdmin ? undefined : (access.warehouseId ?? -1)) },
        _sum: { amount: true }
      }),
      prisma.inventoryTransaction.aggregate({
        where: { 
          type: 'adjustment', 
          qtyChange: { lt: 0 },
          warehouseId: selectedWarehouseId ?? (isAdmin ? undefined : (access.warehouseId ?? -1))
        },
        _sum: { costAtTime: true, qtyChange: true }
      }),
      // We also need the actual total writeoff value, which is SUM(costAtTime * abs(qtyChange))
      // Since prisma aggregate can't do multiply, we'll fetch them if needed or use a raw query.
      // But for simplicity, we can fetch all writeoff transactions or use average cost.
      // Let's fetch the specific adjustment transactions to calculate exact loss.
      prisma.inventoryTransaction.findMany({
        where: { 
          type: 'adjustment', 
          qtyChange: { lt: 0 },
          warehouseId: selectedWarehouseId ?? (isAdmin ? undefined : (access.warehouseId ?? -1))
        },
        select: { qtyChange: true, costAtTime: true }
      })
    ]);

    // Data Processing Logic
    const totalProducts = selectedWarehouseId ? totalProductsRaw.length : countUniqueProductsByName(totalProductsRaw as any);
    const inventoryValue = computeInventoryValue(inventoryBatches);
    const lowStock = filterAndSortLowStock(lowStockRaw as any[]);

    let totalProfit = 0;
    let totalDebts = 0;
    let totalRevenue = 0;
    const productSales: any = {};

    for (const inv of allInvoices) {
      totalRevenue += Number(inv.netAmount || 0);
      totalDebts += getInvoiceDebt(Number(inv.netAmount || 0), Number(inv.paidAmount || 0));
      for (const item of (inv as any).items) {
        if (isAdmin) {
          totalProfit += (Number(item.sellingPrice) - (Number(item.costPrice) || 0)) * (Number(item.quantity) - Number(item.returnedQty || 0));
        }
        productSales[item.productId] = (productSales[item.productId] || 0) + Number(item.quantity);
      }
    }

    if (isAdmin) {
      const expenses = Number((expensesAggRaw as any)?._sum?.amount || 0);
      const writeoffLoss = (writeoffsRaw as any[]).reduce((sum, t) => sum + (Math.abs(t.qtyChange) * Number(t.costAtTime || 0)), 0);
      totalProfit -= (expenses + writeoffLoss);
    }

    const topProductIds = Object.keys(productSales).sort((a,b) => productSales[b] - productSales[a]).slice(0, 5).map(Number);
    const topProductsRaw = await prisma.product.findMany({
      where: { id: { in: topProductIds } },
      include: { category: { select: { name: true } } }
    });
    const topProducts = topProductsRaw.map(p => ({ ...p, totalSold: productSales[p.id] })).sort((a,b) => b.totalSold - a.totalSold);

    const currentRevenue = currentMonthInvoices.reduce((sum, i) => sum + Number(i.netAmount || 0), 0);
    const previousRevenue = previousMonthInvoices.reduce((sum, i) => sum + Number(i.netAmount || 0), 0);

    return {
      todaySales: Number(salesToday._sum.netAmount || 0),
      totalProducts,
      totalCustomers,
      totalWarehouses,
      totalOrders,
      totalRevenue,
      inventoryValue,
      totalProfit: isAdmin ? totalProfit : null,
      totalDebts,
      lowStock,
      recentSales: recentSales.map((inv: any) => ({
        ...inv,
        customer_name: inv.customer?.name || '---'
      })),
      overviewSales: allInvoices.map((inv: any) => ({ id: inv.id, createdAt: inv.createdAt, netAmount: inv.netAmount })),
      topProducts,
      reminders,
      metricChanges: {
        revenue: safePercentChange(currentRevenue, previousRevenue),
        orders: safePercentChange(currentMonthInvoices.length, previousMonthInvoices.length),
        customers: safePercentChange(currentMonthCustomers, previousMonthCustomers),
        products: safePercentChange(
           selectedWarehouseId ? currentMonthProductsRaw.length : countUniqueProductsByName(currentMonthProductsRaw as any),
           selectedWarehouseId ? previousMonthProductsRaw.length : countUniqueProductsByName(previousMonthProductsRaw as any)
        ),
      },
      overviewChanges: {
        week: safePercentChange(getPeriodRevenue(allInvoices, windows.weekStart, windows.tomorrowStart), getPeriodRevenue(allInvoices, windows.prevWeekStart, windows.weekStart)),
        month: safePercentChange(getPeriodRevenue(allInvoices, windows.monthStart, windows.nextMonthStart), getPeriodRevenue(allInvoices, windows.prevMonthStart, windows.monthStart)),
        today: safePercentChange(getPeriodRevenue(allInvoices, windows.todayStart, windows.tomorrowStart), getPeriodRevenue(allInvoices, windows.yesterdayStart, windows.todayStart)),
      }
    };
  }
}
