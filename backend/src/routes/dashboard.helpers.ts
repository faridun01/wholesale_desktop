import { DEFAULT_CUSTOMER_NAME } from '../utils/defaultCustomer.js';

const LOW_STOCK_THRESHOLD = 5;
const LOW_STOCK_PACKAGE_THRESHOLD = 4;
const PAYMENT_EPSILON = 0.01;

export const safePercentChange = (current: number, previous: number) => {
  if (previous === 0 && current === 0) return 0;
  if (previous === 0) return 100;
  return ((current - previous) / previous) * 100;
};

export const getInvoiceDebt = (netAmount: number, paidAmount: number) => {
  const balance = Number(netAmount || 0) - Number(paidAmount || 0);
  return balance > PAYMENT_EPSILON ? balance : 0;
};

export const getDefaultPackaging = (
  packagings: Array<{ isDefault?: boolean; unitsPerPackage?: number; packageName?: string }>
) => packagings.find((entry) => Boolean(entry?.isDefault)) || packagings[0] || null;

export const getPeriodRevenue = (
  invoices: Array<{ createdAt: Date; netAmount: number | string | { toString(): string } }>,
  start: Date,
  end: Date
) =>
  invoices.reduce((sum, invoice) => {
    const createdAt = new Date(invoice.createdAt);
    if (createdAt >= start && createdAt < end) {
      return sum + Number(invoice.netAmount || 0);
    }
    return sum;
  }, 0);

export const normalizeProductKey = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export const countUniqueProductsByName = (products: Array<{ name: string }>) =>
  new Set(products.map((product) => normalizeProductKey(product.name))).size;

export const computeInventoryValue = (
  batches: Array<{
    remainingQuantity?: number | string | { toString(): string };
    costPrice?: number | string | { toString(): string };
  }>
) =>
  batches.reduce((sum, batch) => {
    return sum + Number(batch.remainingQuantity || 0) * Number(batch.costPrice || 0);
  }, 0);

export const filterAndSortLowStock = (lowStockRaw: any[]) =>
  lowStockRaw
    .filter((product: any) => {
      const stockUnits = Math.max(0, Number(product?.stock || 0));
      const packagings = Array.isArray(product?.packagings) ? product.packagings : [];
      const defaultPackaging = getDefaultPackaging(packagings);
      const unitsPerPackage = Number(defaultPackaging?.unitsPerPackage || 0);

      if (defaultPackaging && unitsPerPackage > 0) {
        const packageCount = stockUnits / unitsPerPackage;
        return stockUnits <= LOW_STOCK_THRESHOLD || packageCount < LOW_STOCK_PACKAGE_THRESHOLD;
      }

      return stockUnits <= LOW_STOCK_THRESHOLD;
    })
    .sort((a: any, b: any) => {
      const stockDiff = Number(a?.stock || 0) - Number(b?.stock || 0);
      if (stockDiff !== 0) {
        return stockDiff;
      }

      return String(a?.name || '').localeCompare(String(b?.name || ''), 'ru');
    });

export const buildDashboardWindows = (today: Date) => {
  const date = new Date(today);
  date.setHours(0, 0, 0, 0);

  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const prevMonthStart = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const nextMonthStart = new Date(date.getFullYear(), date.getMonth() + 1, 1);

  const todayStart = new Date(date);
  const tomorrowStart = new Date(date);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const yesterdayStart = new Date(date);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(date);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const quarterStart = new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
  const prevQuarterStart = new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3 - 3, 1);
  const nextQuarterStart = new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3 + 3, 1);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const nextYearStart = new Date(date.getFullYear() + 1, 0, 1);
  const prevYearStart = new Date(date.getFullYear() - 1, 0, 1);

  return {
    today: date,
    monthStart,
    prevMonthStart,
    nextMonthStart,
    todayStart,
    tomorrowStart,
    yesterdayStart,
    weekStart,
    prevWeekStart,
    quarterStart,
    prevQuarterStart,
    nextQuarterStart,
    yearStart,
    nextYearStart,
    prevYearStart,
  };
};

export const buildDashboardWhere = (options: {
  isAdmin: boolean;
  selectedWarehouseId: number | null;
  accessWarehouseId: number | null;
  accessCity: string | null;
}) => {
  const invoiceWhere = {
    cancelled: false,
    warehouseId: options.selectedWarehouseId ?? (options.isAdmin ? undefined : (options.accessWarehouseId ?? -1)),
  };

  const productWhere = {
    active: true,
    warehouseId: options.selectedWarehouseId ?? (options.isAdmin ? undefined : (options.accessWarehouseId ?? -1)),
  };

  const lowStockProductWhere = {
    active: true,
    warehouseId: options.isAdmin ? undefined : (options.accessWarehouseId ?? -1),
  };

  const customerWhere = {
    active: true,
    city: options.isAdmin ? undefined : (options.accessCity ?? '__no_city__'),
    NOT: {
      name: {
        equals: DEFAULT_CUSTOMER_NAME,

      },
    },
  };

  const warehouseWhere = options.isAdmin
    ? { active: true }
    : { active: true, id: options.accessWarehouseId ?? -1, city: options.accessCity ?? undefined };

  return {
    invoiceWhere,
    productWhere,
    lowStockProductWhere,
    customerWhere,
    warehouseWhere,
  };
};
