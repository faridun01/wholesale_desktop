import prisma from '../db/prisma.js';
import { 
  buildCancelledInvoiceWhere, 
  buildInventoryWhere, 
  buildCreatedAtRange, 
  buildInvoiceLineReportRows 
} from '../routes/reports.helpers.js';

export class ReportService {
  private static MONEY_EPSILON = 0.0001;

  private static getRemainingQuantity(item: any) {
    return Math.max(0, Number(item?.quantity || 0) - Number(item?.returnedQty || 0));
  }

  private static getRemainingSubtotal(items: any[]) {
    return items.reduce((sum, item) => sum + Number(item.sellingPrice || 0) * this.getRemainingQuantity(item), 0);
  }

  private static getLineNetRevenue(invoice: any, item: any) {
    const remainingQty = this.getRemainingQuantity(item);
    if (remainingQty <= 0) return 0;

    const remainingSubtotal = this.getRemainingSubtotal(invoice.items || []);
    const lineRemainingSubtotal = Number(item.sellingPrice || 0) * remainingQty;
    const invoiceNetAmount = Number(invoice.netAmount || 0);

    if (remainingSubtotal <= this.MONEY_EPSILON || invoiceNetAmount <= this.MONEY_EPSILON) {
      return lineRemainingSubtotal;
    }

    return (lineRemainingSubtotal / remainingSubtotal) * invoiceNetAmount;
  }

  private static getLineCost(item: any) {
    const originalQty = Number(item?.quantity || 0);
    const remainingQty = this.getRemainingQuantity(item);
    if (remainingQty <= 0) return 0;

    const allocatedCost = Array.isArray(item.saleAllocations)
      ? item.saleAllocations.reduce((sum: number, alloc: any) => sum + Number(alloc.batch?.costPrice || 0) * Number(alloc.quantity || 0), 0)
      : 0;

    if (allocatedCost > this.MONEY_EPSILON) {
      if (originalQty > this.MONEY_EPSILON && remainingQty < originalQty) {
        return allocatedCost * (remainingQty / originalQty);
      }
      return allocatedCost;
    }

    const averageCost = Number(item.costPrice || 0);
    return averageCost * remainingQty;
  }

  public static async getAnalytics(access: any, query: any) {
    const warehouseId = query.warehouse_id;
    const { start, end } = query;
    const whereClause = buildCancelledInvoiceWhere({ warehouseId, start, end });

    const [invoices, productsCount, customersCount, warehouses, batches, writeoffTransactions, expenses] = await Promise.all([
      prisma.invoice.findMany({
        where: whereClause,
        include: {
          customer: { select: { id: true, name: true } },
          user: { select: { id: true, username: true } },
          items: {
            include: {
              product: { select: { id: true, name: true } },
              saleAllocations: { include: { batch: { select: { costPrice: true } } } }
            }
          },
          warehouse: { select: { name: true } },
        },
      }),
      prisma.product.count({ where: { active: true, warehouseId: warehouseId ?? undefined } }),
      prisma.customer.count({ where: { active: true, city: access.isAdmin ? undefined : (access.city ?? '__no_city__') } }),
      prisma.warehouse.findMany({ where: access.isAdmin ? { active: true } : { active: true, id: access.warehouseId ?? -1, city: access.city ?? undefined } }),
      prisma.productBatch.findMany({ where: { remainingQuantity: { gt: 0 }, warehouseId: warehouseId ?? undefined } }),
      prisma.inventoryTransaction.findMany({
        where: buildInventoryWhere({ type: 'adjustment', warehouseId, start, end, additional: { qtyChange: { lt: 0 } } }),
        include: {
          user: { select: { id: true, username: true } },
          warehouse: { select: { id: true, name: true } },
          product: { select: { id: true, name: true } },
        }
      }),
      prisma.expense.findMany({
        where: { warehouseId: warehouseId ?? undefined, expenseDate: (start || end) ? buildCreatedAtRange({ start, end }) : undefined },
        select: { amount: true, category: true }
      }),
    ]);

    let totalRevenue = 0;
    let totalProfit = 0;
    let totalCost = 0;
    let totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    let totalDebts = 0;

    const monthlyData: any = {};
    const warehousePerf: any = {};
    const productPerf: Record<string, any> = {};
    const staffPerf: Record<string, any> = {};
    const customerPerf: Record<string, any> = {};

    for (const inv of invoices) {
      const month = inv.createdAt.toLocaleString('ru-RU', { month: 'short' });
      if (!monthlyData[month]) monthlyData[month] = { name: month, sales: 0, profit: 0 };

      const netAmount = Number(inv.netAmount || 0);
      const paidAmount = Number(inv.paidAmount || 0);
      totalRevenue += netAmount;
      const invoiceDebt = Math.max(0, netAmount - paidAmount);
      totalDebts += invoiceDebt;
      monthlyData[month].sales += netAmount;

      if (!warehousePerf[inv.warehouseId]) warehousePerf[inv.warehouseId] = { name: inv.warehouse.name, sales: 0, profit: 0 };
      warehousePerf[inv.warehouseId].sales += netAmount;

      const staffKey = String(inv.user?.id || 0);
      if (!staffPerf[staffKey]) staffPerf[staffKey] = { id: Number(inv.user?.id || 0), name: inv.user?.username || '?', invoices: 0, revenue: 0, profit: 0 };
      staffPerf[staffKey].invoices++;
      staffPerf[staffKey].revenue += netAmount;

      const customerKey = String(inv.customer?.id || 0);
      if (!customerPerf[customerKey]) customerPerf[customerKey] = { id: Number(inv.customer?.id || 0), name: inv.customer?.name || '?', invoices: 0, revenue: 0, debt: 0 };
      customerPerf[customerKey].invoices++;
      customerPerf[customerKey].revenue += netAmount;
      customerPerf[customerKey].debt += invoiceDebt;

      for (const item of inv.items) {
        const lineRev = this.getLineNetRevenue(inv, item);
        const lineCost = this.getLineCost(item);
        const lineProfit = lineRev - lineCost;
        const qty = this.getRemainingQuantity(item);
        const prodKey = String(item.product?.id || 0);

        totalCost += lineCost;
        if (access.isAdmin) {
          totalProfit += lineProfit;
          monthlyData[month].profit += lineProfit;
          warehousePerf[inv.warehouseId].profit += lineProfit;
          staffPerf[staffKey].profit += lineProfit;
        }

        if (!productPerf[prodKey]) productPerf[prodKey] = { id: Number(item.product?.id || 0), name: item.product?.name || '?', quantity: 0, revenue: 0, profit: 0 };
        productPerf[prodKey].quantity += qty;
        productPerf[prodKey].revenue += lineRev;
        productPerf[prodKey].profit += lineProfit;
      }
    }

    const stockValuation = batches.reduce((sum, b) => sum + (Number(b.costPrice) * Number(b.remainingQuantity)), 0);

    // Process Write-offs
    const writeoffByReason: any = {};
    for (const t of writeoffTransactions) {
      const qty = Math.abs(Number(t.qtyChange || 0));
      const val = qty * Number(t.costAtTime || 0);
      const reason = String(t.reason || '').replace(/^.*?:\s*/i, '').trim() || 'Списание';
      const key = reason.toLowerCase();
      if (!writeoffByReason[key]) writeoffByReason[key] = { name: reason, quantity: 0, value: 0, operations: 0 };
      writeoffByReason[key].quantity += qty;
      writeoffByReason[key].value += val;
      writeoffByReason[key].operations++;
    }

    return {
      summary: {
        totalRevenue,
        totalProfit: access.isAdmin ? totalProfit : null,
        totalCost: access.isAdmin ? totalCost : null,
        totalExpenses: access.isAdmin ? totalExpenses : null,
        totalSalesCount: invoices.length,
        totalCustomers: customersCount,
        totalProducts: productsCount,
        totalDebts,
        stockValuation: access.isAdmin ? stockValuation : null,
        margin: access.isAdmin ? (totalRevenue > 0 ? ((totalProfit - totalExpenses) / totalRevenue) * 100 : 0) : null,
        netProfit: access.isAdmin ? (totalProfit - totalExpenses) : null,
      },
      chartData: Object.values(monthlyData),
      warehousePerformance: Object.values(warehousePerf),
      productPerformance: Object.values(productPerf).sort((a: any, b: any) => b.profit - a.profit).slice(0, 20),
      staffPerformance: Object.values(staffPerf).sort((a: any, b: any) => b.revenue - a.revenue).slice(0, 20),
      customerPerformance: Object.values(customerPerf).sort((a: any, b: any) => b.revenue - a.revenue).slice(0, 20),
      customerDebts: Object.values(customerPerf).filter((i: any) => i.debt > this.MONEY_EPSILON).sort((a: any, b: any) => b.debt - a.debt).slice(0, 20),
      writeoffReasons: Object.values(writeoffByReason).sort((a: any, b: any) => b.value - a.value).slice(0, 20)
    };
  }
}
