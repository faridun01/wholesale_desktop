type DateRangeInput = {
  start?: unknown;
  end?: unknown;
};

type InvoiceRow = {
  id: number;
  createdAt: Date;
  discount?: number | null;
  customer?: { name?: string | null } | null;
  warehouse?: { name?: string | null } | null;
  items: any[];
};

type BuildRowsOptions = {
  invoices: InvoiceRow[];
  getRemainingQuantity: (item: any) => number;
  getLineNetRevenue: (invoice: any, item: any) => number;
  getLineCost: (item: any) => number;
  netSalesKey: 'total_sales' | 'net_sales';
};

export const buildCreatedAtRange = ({ start, end }: DateRangeInput) => {
  const parseDate = (val: any, endOfDay = false) => {
    if (!val || val === 'null' || val === 'undefined') return undefined;
    const dateStr = String(val);
    // If it's a simple YYYY-MM-DD, handle it as local start/end
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return new Date(dateStr + (endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'));
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return undefined;
    if (endOfDay) {
        d.setHours(23, 59, 59, 999);
    }
    return d;
  };

  return {
    gte: parseDate(start),
    lte: parseDate(end, true),
  };
};

export const buildCancelledInvoiceWhere = (options: {
  warehouseId: number | null;
  start?: unknown;
  end?: unknown;
}) => {
  const where: any = {
    cancelled: false,
    createdAt: buildCreatedAtRange(options),
  };

  if (options.warehouseId) {
    where.warehouseId = options.warehouseId;
  }

  return where;
};

export const buildInventoryWhere = (options: {
  type: string;
  warehouseId: number | null;
  start?: unknown;
  end?: unknown;
  additional?: Record<string, unknown>;
}) => {
  const where: any = {
    type: options.type,
    createdAt: buildCreatedAtRange(options),
    ...(options.additional || {}),
  };

  if (options.warehouseId) {
    where.warehouseId = options.warehouseId;
  }

  return where;
};

export const buildInvoiceLineReportRows = ({
  invoices,
  getRemainingQuantity,
  getLineNetRevenue,
  getLineCost,
  netSalesKey,
}: BuildRowsOptions) =>
  invoices.flatMap((inv) =>
    inv.items
      .map((item: any) => {
        const quantity = getRemainingQuantity(item);
        if (quantity <= 0) return null;

        const revenue = getLineNetRevenue(inv, item);
        const cost = getLineCost(item);

        return {
          invoice_id: inv.id,
          date: inv.createdAt.toISOString().split('T')[0],
          warehouse_name: inv.warehouse?.name || '',
          customer_name: inv.customer?.name || '',
          product_name: item.product.name,
          unit: item.product.unit || '',
          quantity,
          selling_price: Number(item.sellingPrice),
          gross_sales: Number(item.sellingPrice) * quantity,
          discount_percent: Number(inv.discount || 0),
          [netSalesKey]: revenue,
          cost_price: quantity > 0 ? cost / quantity : 0,
          profit: revenue - cost,
        };
      })
      .filter(Boolean)
  );

