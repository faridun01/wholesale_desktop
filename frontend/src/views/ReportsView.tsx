import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, BarChart3, FileSpreadsheet, Target, TrendingUp, Warehouse, X } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../api/client';
import { deleteWriteOffTransactionPermanently, returnWriteOffTransaction } from '../api/products.api';
import { getWarehouses } from '../api/warehouses.api';
import { formatCount, formatMoney, formatPercent, toFixedNumber } from '../utils/format';
import { formatProductName } from '../utils/productName';
import { getCurrentUser } from '../utils/userAccess';
import ChartSkeleton from '../components/charts/ChartSkeleton';
import PaginationControls from '../components/common/PaginationControls';

const ReportsCharts = React.lazy(() => import('../components/charts/ReportsCharts'));

interface ReportsViewProps {
  warehouseId?: number | null;
}

type ReportType = 'sales' | 'profit' | 'returns' | 'writeoffs';

type ReportRow = {
  date: string;
  transaction_id?: number;
  invoice_id?: number;
  return_id?: number;
  warehouse_name?: string;
  customer_name?: string;
  staff_name?: string;
  product_name: string;
  unit?: string;
  quantity: number;
  selling_price?: number;
  cost_price?: number;
  gross_sales?: number;
  discount_percent?: number;
  net_sales?: number;
  total_sales?: number;
  total_value?: number;
  profit?: number;
  reason?: string;
  returned_qty?: number;
  can_return?: boolean;
  can_delete?: boolean;
  status?: 'writeoff' | 'partial_return' | 'full_return';
};

type ProductProfitInsight = {
  name: string;
  quantity: number;
  revenue: number;
  profit: number;
  margin: number;
  profitPerUnit: number;
  revenuePerUnit: number;
  quantityShare: number;
  profitShare: number;
  efficiencyScore: number;
  inefficiencyReason: string | null;
};

const PIE_COLORS = ['#5b8def', '#7c6cf2', '#f3cb5d', '#5ec98f', '#ef6fae'];

function csvCell(value: unknown) {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

function buildCsv(rows: unknown[][]) {
  return ['sep=;', ...rows.map((row) => row.map(csvCell).join(';'))].join('\r\n');
}

function normalizeSheetName(value: string) {
  return String(value || 'Лист')
    .replace(/[\\/*?:[\]]/g, ' ')
    .trim()
    .slice(0, 31) || 'Лист';
}

function normalizeDisplayBaseUnit(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'шт';
  if (['пачка', 'пачки', 'пачек', 'шт', 'штук', 'штука', 'штуки', 'pcs', 'piece', 'pieces'].includes(normalized)) {
    return 'шт';
  }
  return normalized;
}

function applyTotalRowStyle(
  XLSX: typeof import('xlsx'),
  worksheet: import('xlsx').WorkSheet,
  rowIndex: number,
  columnCount: number
) {
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
    const cell = worksheet[cellAddress];
    if (!cell) {
      continue;
    }

    cell.s = {
      ...(cell.s || {}),
      font: {
        ...(cell.s?.font || {}),
        bold: true,
      },
      fill: {
        patternType: 'solid',
        fgColor: { rgb: 'E5E7EB' },
      },
      border: {
        top: { style: 'thin', color: { rgb: 'CBD5E1' } },
        bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
      },
    };
  }
}

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthRange(year: number, monthIndex: number) {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);

  return {
    start: formatDateInputValue(start),
    end: formatDateInputValue(end),
  };
}

function getReportMonthKey(startDate: string) {
  return startDate.slice(0, 7);
}

const reportMeta: Record<
  ReportType,
  {
    title: string;
    description: string;
    chartTitle: string;
    pieTitle: string;
    accent: string;
    soft: string;
    border: string;
    badge: string;
    text: string;
  }
> = {
  sales: {
    title: 'Продажи',
    description: 'Динамика выручки и товары, которые продавались чаще всего.',
    chartTitle: 'Динамика продаж',
    pieTitle: 'Топ товаров',
    accent: '#5b8def',
    soft: 'bg-sky-50',
    border: 'border-sky-100',
    badge: 'bg-sky-100',
    text: 'text-sky-700',
  },
  profit: {
    title: 'Прибыль',
    description: 'Маржинальность продаж и вклад товаров в общую прибыль.',
    chartTitle: 'Динамика прибыли',
    pieTitle: 'Топ по прибыли',
    accent: '#5ec98f',
    soft: 'bg-emerald-50',
    border: 'border-emerald-100',
    badge: 'bg-emerald-100',
    text: 'text-emerald-700',
  },
  returns: {
    title: 'Возвраты',
    description: 'Возвраты по товарам и причины, которые требуют внимания.',
    chartTitle: 'Возвраты по датам',
    pieTitle: 'Частые позиции',
    accent: '#ef6fae',
    soft: 'bg-rose-50',
    border: 'border-rose-100',
    badge: 'bg-rose-100',
    text: 'text-rose-700',
  },
  writeoffs: {
    title: 'Списания',
    description: 'Складские списания по товарам, причинам и сотрудникам за выбранный период.',
    chartTitle: 'Списания по датам',
    pieTitle: 'Топ списываемых товаров',
    accent: '#f59e0b',
    soft: 'bg-amber-50',
    border: 'border-amber-100',
    badge: 'bg-amber-100',
    text: 'text-amber-700',
  },
};

function Panel({
  title,
  children,
  className = '',
  headerActions,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode;
}) {
  return (
    <section className={`overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ${className}`.trim()}>
      {title && (
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {headerActions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function ReportsView({ warehouseId: initialWarehouseId = null }: ReportsViewProps) {
  const detailPageSize = 15;
  const today = new Date();
  const [searchParams, setSearchParams] = useSearchParams();
  const [reportType, setReportType] = useState<ReportType>(() => {
    const requestedType = String(searchParams.get('type') || '').trim().toLowerCase();
    return requestedType === 'profit' || requestedType === 'returns' || requestedType === 'writeoffs'
      ? (requestedType as ReportType)
      : 'sales';
  });
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(initialWarehouseId?.toString() || '');
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState(() => getMonthRange(today.getFullYear(), today.getMonth()));
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [detailPage, setDetailPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [returnWriteoffRow, setReturnWriteoffRow] = useState<ReportRow | null>(null);
  const [returnWriteoffQuantity, setReturnWriteoffQuantity] = useState('1');
  const [returnWriteoffReason, setReturnWriteoffReason] = useState('ошибка ввода');
  const [deleteWriteoffRow, setDeleteWriteoffRow] = useState<ReportRow | null>(null);
  const [isSubmittingWriteoffAction, setIsSubmittingWriteoffAction] = useState(false);

  const user = React.useMemo(() => getCurrentUser(), []);
  const isAdmin = user.role === 'admin' || user.role === 'ADMIN' || user.role === 'MANAGER';
  const currentMeta = reportMeta[reportType];
  const detailTotalPages = Math.max(1, Math.ceil(reportData.length / detailPageSize));
  const paginatedDetailRows = reportData.slice((detailPage - 1) * detailPageSize, detailPage * detailPageSize);
  const selectedWarehouseName =
    warehouses.find((warehouse) => String(warehouse.id) === selectedWarehouseId)?.name || 'Все склады';

  const loadReport = async () => {
    const warehouseQuery = selectedWarehouseId ? `&warehouse_id=${selectedWarehouseId}` : '';

    try {
      const res = await client.get(
        `/reports/${reportType}?start=${dateRange.start}&end=${dateRange.end}${warehouseQuery}`
      );
      setReportData(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      toast.error('Ошибка при загрузке отчёта');
    }
  };

  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const data = await getWarehouses();
        setWarehouses(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      }
    };

    fetchWarehouses();
  }, []);

  useEffect(() => {
    if (!isAdmin && reportType === 'profit') {
      setReportType('sales');
      return;
    }

    void loadReport();
  }, [dateRange, isAdmin, reportType, selectedWarehouseId]);

  useEffect(() => {
    const requestedType = String(searchParams.get('type') || '').trim().toLowerCase();
    if (!requestedType) {
      return;
    }

    if (
      (requestedType === 'sales' || requestedType === 'profit' || requestedType === 'returns' || requestedType === 'writeoffs') &&
      !(requestedType === 'profit' && !isAdmin)
    ) {
      setReportType(requestedType as ReportType);
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('type');
    setSearchParams(nextParams, { replace: true });
  }, [isAdmin, searchParams, setSearchParams]);

  useEffect(() => {
    setDetailPage(1);
  }, [dateRange, reportType, selectedWarehouseId]);

  useEffect(() => {
    if (detailPage > detailTotalPages) {
      setDetailPage(detailTotalPages);
    }
  }, [detailPage, detailTotalPages]);

  const handleMonthChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const [year, month] = event.target.value.split('-');
    setDateRange(getMonthRange(Number(year), Number(month) - 1));
  };

  const chartData = useMemo(() => {
    const grouped = reportData.reduce((acc: Array<{ date: string; value: number }>, row) => {
      const existing = acc.find((item) => item.date === row.date);
      const value =
        reportType === 'sales'
          ? Number(row.total_sales || 0)
          : reportType === 'profit'
            ? Number(row.profit || 0)
            : reportType === 'returns'
              ? Number(row.quantity || 0)
              : Number(row.total_value || 0);

      if (existing) {
        existing.value += value;
      } else {
        acc.push({ date: row.date, value });
      }

      return acc;
    }, []);

    return grouped;
  }, [reportData, reportType]);

  const pieData = useMemo(() => {
    return reportData
      .reduce((acc: Array<{ name: string; value: number }>, row) => {
        const existing = acc.find((item) => item.name === row.product_name);
        const value =
          reportType === 'sales'
            ? Number(row.total_sales || 0)
            : reportType === 'profit'
              ? Number(row.profit || 0)
              : reportType === 'returns'
                ? Number(row.quantity || 0)
                : Number(row.total_value || 0);

        if (existing) {
          existing.value += value;
        } else {
          acc.push({ name: formatProductName(row.product_name), value });
        }

        return acc;
      }, [])
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [reportData, reportType]);

  const summary = useMemo(() => {
    const totalQuantity = reportData.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const totalValue = reportData.reduce((sum, row) => {
      if (reportType === 'sales') {
        return sum + Number(row.total_sales || 0);
      }

      if (reportType === 'profit') {
        return sum + Number(row.profit || 0);
      }

      if (reportType === 'writeoffs') {
        return sum + Number(row.total_value || 0);
      }

      return sum + Number(row.quantity || 0);
    }, 0);

    return {
      rows: reportData.length,
      totalQuantity,
      totalValue,
    };
  }, [reportData, reportType]);

  const summaryCards = [
    {
      label: 'Тип отчёта',
      value: currentMeta.title,
      meta: dateRange.start,
      tone: currentMeta,
    },
    {
      label: 'Строк в отчёте',
      value: String(summary.rows),
      meta: dateRange.end,
      tone: reportMeta.sales,
    },
    {
      label: reportType === 'returns' ? 'Всего возвратов' : 'Сумма периода',
      value: reportType === 'returns' ? formatCount(summary.totalQuantity) : formatMoney(summary.totalValue),
      meta: `${summary.totalQuantity} шт`,
      tone: reportType === 'returns' ? reportMeta.returns : reportType === 'profit' ? reportMeta.profit : reportType === 'writeoffs' ? reportMeta.writeoffs : reportMeta.sales,
    },
  ];

  const getWriteoffStatusLabel = (status?: ReportRow['status']) => {
    if (status === 'partial_return') return 'Частично возвращено';
    if (status === 'full_return') return 'Полностью возвращено';
    return 'Списание';
  };

  const getWriteoffStatusClassName = (status?: ReportRow['status']) =>
    status === 'partial_return'
      ? 'bg-amber-50 text-amber-700'
      : status === 'full_return'
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-rose-50 text-rose-700';

  const openReturnWriteoffModal = (row: ReportRow) => {
    const availableQuantity = Math.max(0, Number(row.quantity || 0) - Number(row.returned_qty || 0));
    setReturnWriteoffRow(row);
    setReturnWriteoffQuantity(String(availableQuantity > 0 ? availableQuantity : 1));
    setReturnWriteoffReason('ошибка ввода');
  };

  const closeReturnWriteoffModal = () => {
    setReturnWriteoffRow(null);
    setReturnWriteoffQuantity('1');
    setReturnWriteoffReason('ошибка ввода');
  };

  const submitReturnWriteoffFromReport = async () => {
    if (!returnWriteoffRow) {
      return;
    }

    const transactionId = Number(returnWriteoffRow.transaction_id || 0);
    const availableQuantity = Math.max(0, Number(returnWriteoffRow.quantity || 0) - Number(returnWriteoffRow.returned_qty || 0));
    const quantity = Number(returnWriteoffQuantity || 0);

    if (!transactionId) {
      return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > availableQuantity) {
      toast.error(`Введите корректное количество от 1 до ${availableQuantity}`);
      return;
    }

    try {
      setIsSubmittingWriteoffAction(true);
      await returnWriteOffTransaction(transactionId, {
        quantity,
        reason: String(returnWriteoffReason || '').trim() || 'ошибка ввода',
      });
      setReportData((prev) =>
        prev.flatMap((row) => {
          if (Number(row.transaction_id || 0) !== transactionId) {
            return [row];
          }

          const nextReturnedQty = Number(row.returned_qty || 0) + quantity;
          const originalQty = Number(row.quantity || 0);

          if (nextReturnedQty >= originalQty) {
            return [];
          }

          return [{
            ...row,
            returned_qty: nextReturnedQty,
            can_return: nextReturnedQty < originalQty,
            can_delete: false,
            status: 'partial_return' as const,
          }];
        })
      );
      await loadReport();
      closeReturnWriteoffModal();
      toast.success('Списание возвращено на склад');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Не удалось вернуть списание');
    } finally {
      setIsSubmittingWriteoffAction(false);
    }
  };

  const openDeleteWriteoffModal = (row: ReportRow) => {
    setDeleteWriteoffRow(row);
  };

  const closeDeleteWriteoffModal = () => {
    setDeleteWriteoffRow(null);
  };

  const submitDeleteWriteoffFromReport = async () => {
    const transactionId = Number(deleteWriteoffRow?.transaction_id || 0);
    if (!transactionId) {
      return;
    }

    try {
      setIsSubmittingWriteoffAction(true);
      await deleteWriteOffTransactionPermanently(transactionId);
      setReportData((prev) => prev.filter((row) => Number(row.transaction_id || 0) !== transactionId));
      await loadReport();
      closeDeleteWriteoffModal();
      toast.success('Списание удалено навсегда');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Не удалось удалить списание');
    } finally {
      setIsSubmittingWriteoffAction(false);
    }
  };

  const productProfitData = useMemo(() => {
    if (reportType !== 'profit') {
      return [];
    }

    return reportData
      .reduce((acc: Array<{ name: string; quantity: number; revenue: number; profit: number }>, row) => {
        const existing = acc.find((item) => item.name === row.product_name);
        const quantity = Number(row.quantity || 0);
        const revenue = Number(row.net_sales || 0);
        const profit = Number(row.profit || 0);

        if (existing) {
          existing.quantity += quantity;
          existing.revenue += revenue;
          existing.profit += profit;
        } else {
          acc.push({
            name: formatProductName(row.product_name),
            quantity,
            revenue,
            profit,
          });
        }

        return acc;
      }, [])
      .sort((a, b) => b.profit - a.profit);
  }, [reportData, reportType]);
  const productProfitAnalytics = useMemo(() => {
    if (reportType !== 'profit' || !productProfitData.length) {
      return null;
    }

    const totalQuantity = productProfitData.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const totalRevenue = productProfitData.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
    const totalProfit = productProfitData.reduce((sum, row) => sum + Number(row.profit || 0), 0);
    const averageQuantity = totalQuantity / Math.max(productProfitData.length, 1);
    const averageRevenue = totalRevenue / Math.max(productProfitData.length, 1);
    const averageProfit = totalProfit / Math.max(productProfitData.length, 1);

    const insights = productProfitData.map<ProductProfitInsight>((row) => {
      const quantity = Number(row.quantity || 0);
      const revenue = Number(row.revenue || 0);
      const profit = Number(row.profit || 0);
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      const profitPerUnit = quantity > 0 ? profit / quantity : 0;
      const revenuePerUnit = quantity > 0 ? revenue / quantity : 0;
      const quantityShare = totalQuantity > 0 ? (quantity / totalQuantity) * 100 : 0;
      const profitShare = totalProfit > 0 ? (profit / totalProfit) * 100 : 0;
      const normalizedMargin = Math.max(0, Math.min(margin, 100));
      const efficiencyScore = quantityShare * 0.35 + Math.max(0, profitShare) * 0.45 + normalizedMargin * 0.2;

      let inefficiencyReason: string | null = null;
      if (profit <= 0) {
        inefficiencyReason = 'Убыточный товар: продажи есть, но прибыль не формируется.';
      } else if (margin < 8 && quantity >= averageQuantity) {
        inefficiencyReason = 'Продаётся часто, но маржа слишком низкая для такого оборота.';
      } else if (quantityShare > profitShare * 1.8 && quantity >= averageQuantity) {
        inefficiencyReason = 'Объём продаж высокий, но вклад в прибыль заметно ниже доли продаж.';
      } else if (revenue >= averageRevenue && profit < averageProfit * 0.5) {
        inefficiencyReason = 'Выручка нормальная, но чистый доход остаётся слабым.';
      }

      return {
        name: row.name,
        quantity,
        revenue,
        profit,
        margin,
        profitPerUnit,
        revenuePerUnit,
        quantityShare,
        profitShare,
        efficiencyScore,
        inefficiencyReason,
      };
    });

    const topByQuantity = [...insights].sort((a, b) => b.quantity - a.quantity).slice(0, 8);
    const topByProfit = [...insights].sort((a, b) => b.profit - a.profit).slice(0, 8);
    const topByMargin = [...insights]
      .filter((row) => row.revenue > 0 && row.profit > 0)
      .sort((a, b) => {
        if (b.margin === a.margin) {
          return b.profit - a.profit;
        }
        return b.margin - a.margin;
      })
      .slice(0, 8);
    const topByEfficiency = [...insights].sort((a, b) => b.efficiencyScore - a.efficiencyScore).slice(0, 8);
    const inefficient = [...insights]
      .filter((row) => row.inefficiencyReason)
      .sort((a, b) => {
        if (a.profit <= 0 && b.profit > 0) return -1;
        if (b.profit <= 0 && a.profit > 0) return 1;
        return a.margin - b.margin;
      })
      .slice(0, 8);

    const weightedMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const demandLeader = topByQuantity[0] || null;
    const profitLeader = topByProfit[0] || null;
    const marginLeader = topByMargin[0] || null;

    return {
      totalQuantity,
      totalRevenue,
      totalProfit,
      weightedMargin,
      averageQuantity,
      averageRevenue,
      averageProfit,
      demandLeader,
      profitLeader,
      marginLeader,
      topByQuantity,
      topByProfit,
      topByMargin,
      topByEfficiency,
      inefficient,
    };
  }, [productProfitData, reportType]);
  const writeoffAnalytics = useMemo(() => {
    if (reportType !== 'writeoffs' || !reportData.length) {
      return null;
    }

    const totalQuantity = reportData.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const totalValue = reportData.reduce((sum, row) => sum + Number(row.total_value || 0), 0);

    const aggregateRows = (getKey: (row: ReportRow) => string, getLabel?: (row: ReportRow) => string) =>
      reportData
        .reduce((acc: Array<{ name: string; quantity: number; value: number; count: number }>, row) => {
          const key = getKey(row);
          const existing = acc.find((item) => item.name === key);
          const quantity = Number(row.quantity || 0);
          const value = Number(row.total_value || 0);

          if (existing) {
            existing.quantity += quantity;
            existing.value += value;
            existing.count += 1;
          } else {
            acc.push({
              name: getLabel ? getLabel(row) : key,
              quantity,
              value,
              count: 1,
            });
          }

          return acc;
        }, [])
        .sort((a, b) => b.value - a.value);

    const topProducts = aggregateRows(
      (row) => formatProductName(row.product_name),
      (row) => formatProductName(row.product_name),
    ).slice(0, 10);
    const topReasons = aggregateRows(
      (row) => String(row.reason || 'Без причины').trim() || 'Без причины',
    ).slice(0, 10);
    const topStaff = aggregateRows(
      (row) => String(row.staff_name || 'Не указан').trim() || 'Не указан',
    ).slice(0, 10);
    const topWarehouses = aggregateRows(
      (row) => String(row.warehouse_name || 'Без склада').trim() || 'Без склада',
    ).slice(0, 10);

    return {
      totalQuantity,
      totalValue,
      topProducts,
      topReasons,
      topStaff,
      topWarehouses,
      mainProduct: topProducts[0] || null,
      mainReason: topReasons[0] || null,
      mainStaff: topStaff[0] || null,
      mainWarehouse: topWarehouses[0] || null,
    };
  }, [reportData, reportType]);

  const buildReportRows = (rows: ReportRow[]) => {
    const detailHeaders =
      reportType === 'sales'
        ? ['Дата', 'Накладная', 'Склад', 'Клиент', 'Товар', 'Ед.', 'Кол-во', 'Себестоимость за 1 шт', 'Цена продажи за 1 шт', 'Прибыль за 1 шт', 'Выручка', 'Общая прибыль']
        : reportType === 'profit'
          ? ['Дата', 'Накладная', 'Склад', 'Клиент', 'Товар', 'Ед.', 'Кол-во', 'Себестоимость за 1 шт', 'Цена продажи за 1 шт', 'Прибыль за 1 шт', 'Чистая выручка', 'Общая прибыль']
          : reportType === 'returns'
            ? ['Дата', 'Возврат', 'Склад', 'Сотрудник', 'Товар', 'Ед.', 'Кол-во', 'Цена продажи', 'Сумма возврата', 'Причина']
            : ['Дата', 'Склад', 'Сотрудник', 'Товар', 'Ед.', 'Кол-во', 'Себестоимость', 'Сумма списания', 'Причина'];

    const detailRows = rows.map((row) => {
      if (reportType === 'sales') {
        const quantity = Number(row.quantity || 0);
        const totalProfit = Number(row.profit || 0);
        const profitPerUnit = quantity > 0 ? totalProfit / quantity : 0;

        return [
          new Date(row.date).toLocaleDateString('ru-RU'),
          row.invoice_id ? '#' + row.invoice_id : '',
          row.warehouse_name || '',
          row.customer_name || '',
          formatProductName(row.product_name),
          normalizeDisplayBaseUnit(row.unit),
          formatCount(row.quantity),
          toFixedNumber(row.cost_price || 0),
          toFixedNumber(row.selling_price || 0),
          toFixedNumber(profitPerUnit),
          toFixedNumber(row.total_sales || 0),
          toFixedNumber(totalProfit),
        ];
      }

      if (reportType === 'profit') {
        const quantity = Number(row.quantity || 0);
        const totalProfit = Number(row.profit || 0);
        const profitPerUnit = quantity > 0 ? totalProfit / quantity : 0;

        return [
          new Date(row.date).toLocaleDateString('ru-RU'),
          row.invoice_id ? '#' + row.invoice_id : '',
          row.warehouse_name || '',
          row.customer_name || '',
          formatProductName(row.product_name),
          normalizeDisplayBaseUnit(row.unit),
          formatCount(row.quantity),
          toFixedNumber(row.cost_price || 0),
          toFixedNumber(row.selling_price || 0),
          toFixedNumber(profitPerUnit),
          toFixedNumber(row.net_sales || 0),
          toFixedNumber(totalProfit),
        ];
      }

      if (reportType === 'writeoffs') {
        return [
          new Date(row.date).toLocaleDateString('ru-RU'),
          row.warehouse_name || '',
          row.staff_name || '',
          formatProductName(row.product_name),
          normalizeDisplayBaseUnit(row.unit),
          formatCount(row.quantity),
          toFixedNumber(row.cost_price || 0),
          toFixedNumber(row.total_value || 0),
          row.reason || '',
        ];
      }

      return [
        new Date(row.date).toLocaleDateString('ru-RU'),
        row.return_id ? '#' + row.return_id : '',
        row.warehouse_name || '',
        row.staff_name || '',
        formatProductName(row.product_name),
        normalizeDisplayBaseUnit(row.unit),
        formatCount(row.quantity),
        toFixedNumber(row.selling_price || 0),
        toFixedNumber(row.total_value || 0),
        row.reason || '',
      ];
    });

    return { detailHeaders, detailRows };
  };

  const buildSummaryRows = (rows: ReportRow[], warehouseName: string) => {
    const totalQuantity = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const totalValue = rows.reduce((sum, row) => {
      if (reportType === 'sales') {
        return sum + Number(row.total_sales || 0);
      }

      if (reportType === 'profit') {
        return sum + Number(row.profit || 0);
      }

      if (reportType === 'writeoffs') {
        return sum + Number(row.total_value || 0);
      }

      return sum + Number(row.quantity || 0);
    }, 0);
    const totalProfit = rows.reduce((sum, row) => sum + Number(row.profit || 0), 0);

    const baseRows = [
      ['Отчёт', currentMeta.title],
      ['Период с', dateRange.start],
      ['Период по', dateRange.end],
      ['Склад', warehouseName],
      ['Строк в отчёте', String(rows.length)],
      ['Общее количество', formatCount(totalQuantity)],
      ['Сумма периода', reportType === 'returns' ? formatCount(totalQuantity) : toFixedNumber(totalValue)],
    ];

    if (reportType === 'sales' || reportType === 'profit') {
      baseRows.push(['Общая прибыль', toFixedNumber(totalProfit)]);
    }

    return baseRows;
  };

  const buildDetailTotalRow = (rows: ReportRow[]) => {
    const totalRevenue = rows.reduce((sum, row) => {
      if (reportType === 'sales') {
        return sum + Number(row.total_sales || 0);
      }

      if (reportType === 'profit') {
        return sum + Number(row.net_sales || 0);
      }

      return sum + Number(row.total_value || 0);
    }, 0);
    const totalProfit = rows.reduce((sum, row) => sum + Number(row.profit || 0), 0);

    if (reportType === 'sales' || reportType === 'profit') {
      return [
        'ИТОГО',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        toFixedNumber(totalRevenue),
        toFixedNumber(totalProfit),
      ];
    }

    if (reportType === 'writeoffs') {
      return [
        'ИТОГО',
        '',
        '',
        '',
        '',
        '',
        '',
        toFixedNumber(totalRevenue),
        '',
      ];
    }

    return [
      'ИТОГО',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      toFixedNumber(totalRevenue),
      '',
    ];
  };

  const buildProductProfitTotalRow = (rows: Array<{ name: string; quantity: number; revenue: number; profit: number }>) => [
    'ИТОГО',
    formatCount(rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0)),
    toFixedNumber(rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0)),
    toFixedNumber(rows.reduce((sum, row) => sum + Number(row.profit || 0), 0)),
  ];

  const exportToExcel = async () => {
    const XLSX = await import('xlsx');
    const summaryRows = buildSummaryRows(reportData, selectedWarehouseName);
    const { detailHeaders, detailRows } = buildReportRows(reportData);
    const workbook = XLSX.utils.book_new();

    const overallRows: unknown[][] = [
      ...summaryRows,
      [],
      detailHeaders,
      ...detailRows,
      buildDetailTotalRow(reportData),
    ];
    const overallDetailTotalRowIndex = overallRows.length - 1;

    if (reportType === 'profit' && productProfitData.length) {
      overallRows.push(
        [],
        ['Прибыль по товарам'],
        ['Товар', 'Количество', 'Чистая выручка', 'Прибыль'],
        ...productProfitData.map((row) => [row.name, formatCount(row.quantity), toFixedNumber(row.revenue), toFixedNumber(row.profit)]),
        buildProductProfitTotalRow(productProfitData)
      );
    }

    const overallSheet = XLSX.utils.aoa_to_sheet(overallRows);
    applyTotalRowStyle(XLSX, overallSheet, overallDetailTotalRowIndex, detailHeaders.length);
    if (reportType === 'profit' && productProfitData.length) {
      applyTotalRowStyle(XLSX, overallSheet, overallRows.length - 1, 4);
    }
    XLSX.utils.book_append_sheet(workbook, overallSheet, normalizeSheetName('Общий отчёт'));

    const groupedByWarehouse = reportData.reduce((acc, row) => {
      const key = row.warehouse_name || 'Без склада';
      if (!acc.has(key)) {
        acc.set(key, []);
      }
      acc.get(key)!.push(row);
      return acc;
    }, new Map<string, ReportRow[]>());

    groupedByWarehouse.forEach((rows, name) => {
      const warehouseSummaryRows = buildSummaryRows(rows, name);
      const { detailRows: warehouseDetailRows } = buildReportRows(rows);
      const sheetRows: unknown[][] = [
        ...warehouseSummaryRows,
        [],
        detailHeaders,
        ...warehouseDetailRows,
        buildDetailTotalRow(rows),
      ];
      const warehouseDetailTotalRowIndex = sheetRows.length - 1;

      if (reportType === 'profit' && productProfitData.length) {
        const warehouseProfitData = rows
          .reduce((acc: Array<{ name: string; quantity: number; revenue: number; profit: number }>, row) => {
            const existing = acc.find((item) => item.name === row.product_name);
            const quantity = Number(row.quantity || 0);
            const revenue = Number(row.net_sales || 0);
            const profit = Number(row.profit || 0);

            if (existing) {
              existing.quantity += quantity;
              existing.revenue += revenue;
              existing.profit += profit;
            } else {
              acc.push({ name: formatProductName(row.product_name), quantity, revenue, profit });
            }

            return acc;
          }, [])
          .sort((a, b) => b.profit - a.profit);

        if (warehouseProfitData.length) {
          sheetRows.push(
            [],
            ['Прибыль по товарам'],
            ['Товар', 'Количество', 'Чистая выручка', 'Прибыль'],
            ...warehouseProfitData.map((row) => [
              row.name,
              formatCount(row.quantity),
              toFixedNumber(row.revenue),
              toFixedNumber(row.profit),
            ]),
            buildProductProfitTotalRow(warehouseProfitData)
          );
        }
      }

      const warehouseSheet = XLSX.utils.aoa_to_sheet(sheetRows);
      applyTotalRowStyle(XLSX, warehouseSheet, warehouseDetailTotalRowIndex, detailHeaders.length);
      if (reportType === 'profit') {
        const hasWarehouseProfitBlock = sheetRows.some(
          (row) => Array.isArray(row) && row[0] === 'ИТОГО' && row.length === 4
        );
        if (hasWarehouseProfitBlock) {
          applyTotalRowStyle(XLSX, warehouseSheet, sheetRows.length - 1, 4);
        }
      }
      XLSX.utils.book_append_sheet(workbook, warehouseSheet, normalizeSheetName(name));
    });

    const downloadedAt = formatDateInputValue(new Date());
    const reportMonth = getReportMonthKey(dateRange.start);
    XLSX.writeFile(workbook, `otchet_${reportType}_${reportMonth}_skachano_${downloadedAt}.xlsx`);
  };

  const handleExportReport = async () => {
    if (!reportData.length) {
      toast.error('Сначала загрузите данные отчёта');
      return;
    }
    try {
      setIsExporting(true);
      await exportToExcel();
    } catch (err) {
      console.error(err);
      toast.error('Не удалось скачать отчёт');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="app-page-shell">
      <div className="w-full space-y-6">
      <section className={`app-surface p-5 ${currentMeta.border}`}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-medium tracking-tight text-slate-900">Отчёты</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-500">{currentMeta.description}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={handleExportReport}
              disabled={isExporting}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileSpreadsheet size={16} />
              <span>{isExporting ? 'Скачивание...' : 'Excel'}</span>
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:flex-nowrap xl:items-center xl:justify-between">
          <div className={`grid min-w-0 flex-1 gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm ${isAdmin ? 'grid-cols-4' : 'grid-cols-3'}`}>
            <button
              onClick={() => {
                setReportType('sales');
              }}
              className={`w-full rounded-xl px-2.5 py-2 text-center text-[13px] font-medium transition-all ${reportType === 'sales' ? 'bg-sky-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Продажи
            </button>
            {isAdmin && (
              <button
                onClick={() => {
                  setReportType('profit');
                }}
                className={`w-full rounded-xl px-2.5 py-2 text-center text-[13px] font-medium transition-all ${reportType === 'profit' ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                Прибыль
              </button>
            )}
            <button
              onClick={() => {
                setReportType('returns');
              }}
              className={`w-full rounded-xl px-2.5 py-2 text-center text-[13px] font-medium transition-all ${reportType === 'returns' ? 'bg-rose-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Возвраты
            </button>
            <button
              onClick={() => {
                setReportType('writeoffs');
              }}
              className={`w-full rounded-xl px-2.5 py-2 text-center text-[13px] font-medium transition-all ${reportType === 'writeoffs' ? 'bg-amber-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Списания
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap xl:justify-end">
            <div className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
              <Warehouse size={15} className="text-slate-400" />
              <select
                value={selectedWarehouseId}
                onChange={(event) => setSelectedWarehouseId(event.target.value)}
                className="appearance-none bg-transparent text-[13px] text-slate-700 outline-none"
              >
                <option value="">Все склады</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
              <span className="text-[13px] text-slate-400">Месяц</span>
              <input
                type="month"
                value={dateRange.start.slice(0, 7)}
                onChange={handleMonthChange}
                className="bg-transparent text-[13px] text-slate-700 outline-none"
              />
            </div>

            <div className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
              <input
                type="date"
                value={dateRange.start}
                readOnly
                className="bg-transparent text-[13px] text-slate-700 outline-none"
              />
              <span className="text-slate-300">→</span>
              <input
                type="date"
                value={dateRange.end}
                readOnly
                className="bg-transparent text-[13px] text-slate-700 outline-none"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {summaryCards.map((card) => (
            <section
              key={card.label}
              className={`rounded-3xl border bg-white p-5 shadow-sm ${card.tone.border} ${card.tone.soft}`}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-500">{card.label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{card.value}</p>
                </div>
                <div className={`rounded-2xl px-3 py-2 text-sm ${card.tone.badge} ${card.tone.text}`}>{card.meta}</div>
              </div>
            </section>
          ))}
        </div>
      </section>

      {reportType !== 'writeoffs' && reportType !== 'returns' && (
        <React.Suspense
          fallback={
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_360px]">
              <ChartSkeleton variant="bar" heightClassName="h-[392px]" />
              <ChartSkeleton variant="pie" heightClassName="h-[392px]" />
            </section>
          }
        >
          <ReportsCharts
            chartData={chartData}
            pieData={pieData}
            reportType={reportType}
            currentMeta={currentMeta}
            pieColors={PIE_COLORS}
            panel={Panel}
          />
        </React.Suspense>
      )}

      <Panel
        title="Детализация"
        headerActions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportReport}
              disabled={isExporting}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExporting ? 'Скачивание...' : 'Excel'}
            </button>
          </div>
        }
      >
        <div className="max-h-160 overflow-auto -mx-5">
          <table className="min-w-180 w-full text-left">
            <thead className="bg-slate-50 text-sm text-slate-500">
              <tr>
                <th className="px-5 py-3">Дата</th>
                <th className="px-5 py-3">Товар</th>
                <th className="px-5 py-3">Кол-во</th>
                {reportType === 'sales' && (
                  <>
                    <th className="px-5 py-3">Цена прод.</th>
                    <th className="px-5 py-3">Итого</th>
                  </>
                )}
                {reportType === 'profit' && (
                  <>
                    <th className="px-5 py-3">Цена прод.</th>
                    <th className="px-5 py-3">Себест.</th>
                    <th className="px-5 py-3">Прибыль</th>
                  </>
                )}
                {reportType === 'returns' && <th className="px-5 py-3">Причина</th>}
                {reportType === 'writeoffs' && (
                  <>
                    <th className="px-5 py-3">Сумма</th>
                    <th className="px-5 py-3">Статус</th>
                    <th className="px-5 py-3">Причина</th>
                    <th className="px-5 py-3">Сотрудник</th>
                    <th className="px-5 py-3">Склад</th>
                    <th className="px-5 py-3">Себест.</th>
                    <th className="px-5 py-3 text-right">Действия</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedDetailRows.map((row, index) => (
                <tr key={`${row.date}-${row.product_name}-${index}`} className="text-sm text-slate-700">
                  <td className="px-5 py-4">{new Date(row.date).toLocaleDateString('ru-RU')}</td>
                  <td className="px-5 py-4 text-slate-900">{formatProductName(row.product_name)}</td>
                  <td className="px-5 py-4">{row.quantity}</td>
                  {reportType === 'sales' && (
                    <>
                      <td className="px-5 py-4">{toFixedNumber(row.selling_price || 0)}</td>
                      <td className="px-5 py-4 text-sky-700">{formatMoney(row.total_sales || 0)}</td>
                    </>
                  )}
                  {reportType === 'profit' && (
                    <>
                      <td className="px-5 py-4">{toFixedNumber(row.selling_price || 0)}</td>
                      <td className="px-5 py-4">{toFixedNumber(row.cost_price || 0)}</td>
                      <td className="px-5 py-4 text-emerald-700">{formatMoney(row.profit || 0)}</td>
                    </>
                  )}
                  {reportType === 'returns' && <td className="px-5 py-4 italic text-rose-600">{row.reason || '-'}</td>}
                  {reportType === 'writeoffs' && (
                    <>
                      <td className="px-5 py-4 text-amber-700">{formatMoney(row.total_value || 0)}</td>
                      <td className="px-5 py-4">
                        <span className={`rounded-lg px-2 py-1 text-[11px] font-bold ${getWriteoffStatusClassName(row.status)}`}>
                          {getWriteoffStatusLabel(row.status)}
                        </span>
                        {Number(row.returned_qty || 0) > 0 && (
                          <div className="mt-1 text-[11px] font-semibold text-emerald-700">Возвращено: {Number(row.returned_qty || 0)}</div>
                        )}
                      </td>
                      <td className="px-5 py-4 italic text-amber-700">{row.reason || '-'}</td>
                      <td className="px-5 py-4">{row.staff_name || '-'}</td>
                      <td className="px-5 py-4">{row.warehouse_name || '-'}</td>
                      <td className="px-5 py-4">{toFixedNumber(row.cost_price || 0)}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {row.can_return ? (
                            <button
                              type="button"
                              onClick={() => openReturnWriteoffModal(row)}
                              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
                            >
                              Возврат
                            </button>
                          ) : null}
                          {row.can_delete ? (
                            <button
                              type="button"
                              onClick={() => openDeleteWriteoffModal(row)}
                              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700 transition-colors hover:bg-rose-100"
                            >
                              Удалить
                            </button>
                          ) : null}
                          {!row.can_return && !row.can_delete ? <span className="text-xs text-slate-300">-</span> : null}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}

              {!reportData.length && (
                <tr>
                  <td
                    colSpan={reportType === 'profit' ? 6 : reportType === 'sales' ? 5 : reportType === 'returns' ? 4 : 10}
                    className="px-5 py-16 text-center text-sm text-slate-400"
                  >
                    Нет данных за выбранный период
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {reportData.length > detailPageSize && (
          <PaginationControls
            currentPage={detailPage}
            totalPages={detailTotalPages}
            totalItems={reportData.length}
            pageSize={detailPageSize}
            onPageChange={setDetailPage}
            className="border-t-0"
          />
        )}
      </Panel>

      {returnWriteoffRow && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 p-2 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={closeReturnWriteoffModal}
        >
          <div
            className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Возврат списания в склад</h3>
                <p className="mt-1 text-sm text-slate-500">{formatProductName(returnWriteoffRow.product_name)}</p>
              </div>
              <button
                type="button"
                onClick={closeReturnWriteoffModal}
                className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Доступно к возврату: {Math.max(0, Number(returnWriteoffRow.quantity || 0) - Number(returnWriteoffRow.returned_qty || 0))}
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-700">Количество</label>
                <input
                  type="number"
                  min="1"
                  value={returnWriteoffQuantity}
                  onChange={(event) => setReturnWriteoffQuantity(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                />
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-700">Причина возврата</label>
                <input
                  type="text"
                  value={returnWriteoffReason}
                  onChange={(event) => setReturnWriteoffReason(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                  placeholder="Напр: ошибка ввода"
                />
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeReturnWriteoffModal}
                className="rounded-2xl px-5 py-3 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void submitReturnWriteoffFromReport()}
                disabled={isSubmittingWriteoffAction}
                className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-xl shadow-emerald-600/20 transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmittingWriteoffAction ? 'Сохранение...' : 'Вернуть в склад'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteWriteoffRow && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 p-2 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={closeDeleteWriteoffModal}
        >
          <div
            className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Удалить списание</h3>
                <p className="mt-1 text-sm text-slate-500">{formatProductName(deleteWriteoffRow.product_name)}</p>
              </div>
              <button
                type="button"
                onClick={closeDeleteWriteoffModal}
                className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 px-5 py-5">
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
                Удаление необратимо. Остаток и приход будут восстановлены, но запись списания вернуть потом нельзя.
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Количество: {Number(deleteWriteoffRow.quantity || 0)} • Склад: {deleteWriteoffRow.warehouse_name || '-'}
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeleteWriteoffModal}
                className="rounded-2xl px-5 py-3 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void submitDeleteWriteoffFromReport()}
                disabled={isSubmittingWriteoffAction}
                className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-bold text-white shadow-xl shadow-rose-600/20 transition-all hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmittingWriteoffAction ? 'Удаление...' : 'Удалить навсегда'}
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}

function ProfitAnalyticsModal({
  isOpen,
  analytics,
  selectedWarehouseName,
  dateRangeLabel,
  inline = false,
}: {
  isOpen: boolean;
  analytics: {
    totalQuantity: number;
    totalRevenue: number;
    totalProfit: number;
    weightedMargin: number;
    demandLeader: ProductProfitInsight | null;
    profitLeader: ProductProfitInsight | null;
    marginLeader: ProductProfitInsight | null;
    topByQuantity: ProductProfitInsight[];
    topByProfit: ProductProfitInsight[];
    topByMargin: ProductProfitInsight[];
    topByEfficiency: ProductProfitInsight[];
    inefficient: ProductProfitInsight[];
  };
  selectedWarehouseName: string;
  dateRangeLabel: string;
  inline?: boolean;
}) {
  const [activeSection, setActiveSection] = useState<
    'leaders' | 'quantity' | 'profit' | 'margin' | 'efficiency' | 'inefficient'
  >('leaders');

  useEffect(() => {
    if (!isOpen || inline) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inline, isOpen]);

  if (!isOpen) {
    return null;
  }

  const content = (
      <div
        className={`flex flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.22)] ${inline ? '' : 'max-h-[92vh] w-full max-w-7xl'}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50/90 px-5 py-4 backdrop-blur">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              <TrendingUp size={14} />
              Превью аналитики
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Эффективность товаров по прибыли</h2>
            <p className="text-sm text-slate-500">
              {selectedWarehouseName} · {dateRangeLabel}
            </p>
          </div>
          {!inline && (
            <div className="rounded-2xl p-2 text-slate-400">
              <X size={20} />
            </div>
          )}
        </div>

        <div className="space-y-6 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          <section className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-slate-900">Общая информация</h3>
              <p className="text-sm text-slate-500">
                Здесь показана сводка по периоду. Ниже выберите раздел и откройте только ту часть аналитики, которую хотите посмотреть.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <AnalyticsMetricCard
                icon={<BarChart3 size={18} />}
                label="Продано единиц"
                value={formatCount(analytics.totalQuantity)}
                hint="Общий объём проданных товаров за период"
                tone="sky"
              />
              <AnalyticsMetricCard
                icon={<TrendingUp size={18} />}
                label="Чистая выручка"
                value={formatMoney(analytics.totalRevenue)}
                hint="Доход после скидок по выбранному периоду"
                tone="emerald"
              />
              <AnalyticsMetricCard
                icon={<Target size={18} />}
                label="Общая прибыль"
                value={formatMoney(analytics.totalProfit)}
                hint="Итоговая прибыль по всем проданным товарам"
                tone="emerald"
              />
              <AnalyticsMetricCard
                icon={<Target size={18} />}
                label="Средняя рентабельность"
                value={formatPercent(analytics.weightedMargin, 1)}
                hint="Прибыль как доля от чистой выручки"
                tone="violet"
              />
            </div>
          </section>

          <section className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-slate-900">Меню аналитики</h3>
              <p className="text-sm text-slate-500">
                Нажмите на нужный раздел: лидеры, количество продаж, доход, рентабельность, эффективность или слабые товары.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <AnalyticsMenuButton active={activeSection === 'leaders'} onClick={() => setActiveSection('leaders')} label="Лидеры" />
              <AnalyticsMenuButton active={activeSection === 'quantity'} onClick={() => setActiveSection('quantity')} label="По количеству" />
              <AnalyticsMenuButton active={activeSection === 'profit'} onClick={() => setActiveSection('profit')} label="По доходу" />
              <AnalyticsMenuButton active={activeSection === 'margin'} onClick={() => setActiveSection('margin')} label="По рентабельности" />
              <AnalyticsMenuButton active={activeSection === 'efficiency'} onClick={() => setActiveSection('efficiency')} label="По эффективности" />
              <AnalyticsMenuButton active={activeSection === 'inefficient'} onClick={() => setActiveSection('inefficient')} label="Неэффективные" />
            </div>
          </section>

          {activeSection === 'leaders' && (
            <div className="grid gap-3 xl:grid-cols-3">
              <AnalyticsLeaderCard
                title="Чаще всего продаётся"
                description="Лидер по количеству продаж"
                row={analytics.demandLeader}
                tone="sky"
                metricLabel="Доля продаж"
                metricValue={analytics.demandLeader ? formatPercent(analytics.demandLeader.quantityShare, 1) : '-'}
              />
              <AnalyticsLeaderCard
                title="Приносит больше дохода"
                description="Лидер по абсолютной прибыли"
                row={analytics.profitLeader}
                tone="emerald"
                metricLabel="Доля прибыли"
                metricValue={analytics.profitLeader ? formatPercent(analytics.profitLeader.profitShare, 1) : '-'}
              />
              <AnalyticsLeaderCard
                title="Самый рентабельный"
                description="Лидер по рентабельности продаж"
                row={analytics.marginLeader}
                tone="violet"
                metricLabel="Рентабельность"
                metricValue={analytics.marginLeader ? formatPercent(analytics.marginLeader.margin, 1) : '-'}
              />
            </div>
          )}

          {activeSection === 'quantity' && (
            <AnalyticsTableCard
              title="Что продаётся чаще"
              subtitle="Товары с самым высоким количеством продаж"
              rows={analytics.topByQuantity}
              metricLabel="Количество"
              metricValue={(row) => formatCount(row.quantity)}
              tone="sky"
            />
          )}

          {activeSection === 'profit' && (
            <AnalyticsTableCard
              title="Что приносит больше дохода"
              subtitle="Товары с максимальной прибылью"
              rows={analytics.topByProfit}
              metricLabel="Прибыль"
              metricValue={(row) => formatMoney(row.profit)}
              tone="emerald"
            />
          )}

          {activeSection === 'margin' && (
            <AnalyticsTableCard
              title="Рентабельные товары"
              subtitle="Лучшие позиции по маржинальности"
              rows={analytics.topByMargin}
              metricLabel="Рентабельность"
              metricValue={(row) => formatPercent(row.margin, 1)}
              tone="violet"
            />
          )}

          {activeSection === 'efficiency' && (
            <AnalyticsTableCard
              title="Самые эффективные"
              subtitle="Баланс спроса, прибыли и маржи"
              rows={analytics.topByEfficiency}
              metricLabel="Эффективность"
              metricValue={(row) => formatPercent(row.efficiencyScore, 1)}
              tone="slate"
            />
          )}

          {activeSection === 'inefficient' && (
            <section className="overflow-hidden rounded-3xl border border-rose-100 bg-rose-50/70">
              <div className="border-b border-rose-100 px-5 py-4">
                <div className="flex items-center gap-2 text-rose-700">
                  <AlertTriangle size={18} />
                  <h3 className="text-lg font-semibold">Неэффективные товары</h3>
                </div>
                <p className="mt-1 text-sm text-rose-600">
                  Здесь видно товары, которые занимают продажи, но дают слабую прибыль или работают в минус.
                </p>
              </div>

              <div className="space-y-3 p-4 sm:p-5">
                {analytics.inefficient.length ? (
                  analytics.inefficient.map((row) => (
                    <article key={`inefficient-${row.name}`} className="rounded-2xl border border-rose-100 bg-white px-4 py-3 shadow-sm">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900">{row.name}</h4>
                          <p className="mt-1 text-sm text-slate-500">{row.inefficiencyReason}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm md:min-w-[320px]">
                          <AnalyticsMiniStat label="Продано" value={formatCount(row.quantity)} />
                          <AnalyticsMiniStat label="Прибыль" value={formatMoney(row.profit)} />
                          <AnalyticsMiniStat label="Рентабельность" value={formatPercent(row.margin, 1)} />
                          <AnalyticsMiniStat label="Прибыль / шт" value={formatMoney(row.profitPerUnit)} />
                        </div>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-rose-200 bg-white px-4 py-10 text-center text-sm text-rose-500">
                    За выбранный период явных неэффективных товаров не найдено.
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
  );

  if (inline) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 p-2 backdrop-blur-sm sm:items-center sm:p-4">
      {content}
    </div>
  );
}

function AnalyticsMenuButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-2.5 text-sm font-medium transition ${
        active
          ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );
}

function WriteoffAnalyticsModal({
  isOpen,
  analytics,
  selectedWarehouseName,
  dateRangeLabel,
  inline = false,
}: {
  isOpen: boolean;
  analytics: {
    totalQuantity: number;
    totalValue: number;
    topProducts: Array<{ name: string; quantity: number; value: number; count: number }>;
    topReasons: Array<{ name: string; quantity: number; value: number; count: number }>;
    topStaff: Array<{ name: string; quantity: number; value: number; count: number }>;
    topWarehouses: Array<{ name: string; quantity: number; value: number; count: number }>;
    mainProduct: { name: string; quantity: number; value: number; count: number } | null;
    mainReason: { name: string; quantity: number; value: number; count: number } | null;
    mainStaff: { name: string; quantity: number; value: number; count: number } | null;
    mainWarehouse: { name: string; quantity: number; value: number; count: number } | null;
  };
  selectedWarehouseName: string;
  dateRangeLabel: string;
  inline?: boolean;
}) {
  const [activeSection, setActiveSection] = useState<'leaders' | 'products' | 'reasons' | 'staff' | 'warehouses'>('leaders');

  useEffect(() => {
    if (!isOpen || inline) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inline, isOpen]);

  if (!isOpen) {
    return null;
  }

  const content = (
      <div
        className={`flex flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.22)] ${inline ? '' : 'max-h-[92vh] w-full max-w-6xl'}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50/90 px-5 py-4 backdrop-blur">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
              <AlertTriangle size={14} />
              Аналитика списаний
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Разбор списаний</h2>
            <p className="text-sm text-slate-500">
              {selectedWarehouseName} · {dateRangeLabel}
            </p>
          </div>
          {!inline && (
            <div className="rounded-2xl p-2 text-slate-400">
              <X size={20} />
            </div>
          )}
        </div>

        <div className="space-y-6 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          <section className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-slate-900">Общая информация</h3>
              <p className="text-sm text-slate-500">
                Сводка по объёму и сумме списаний за выбранный период.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <AnalyticsMetricCard
                icon={<BarChart3 size={18} />}
                label="Списано единиц"
                value={formatCount(analytics.totalQuantity)}
                hint="Общий объём списанного товара"
                tone="sky"
              />
              <AnalyticsMetricCard
                icon={<AlertTriangle size={18} />}
                label="Сумма списания"
                value={formatMoney(analytics.totalValue)}
                hint="Общая стоимость списанных позиций"
                tone="violet"
              />
              <AnalyticsMetricCard
                icon={<Target size={18} />}
                label="Главный товар"
                value={analytics.mainProduct?.name || '-'}
                hint={analytics.mainProduct ? `Списано: ${formatCount(analytics.mainProduct.quantity)}` : 'Нет данных'}
                tone="emerald"
              />
              <AnalyticsMetricCard
                icon={<Target size={18} />}
                label="Главная причина"
                value={analytics.mainReason?.name || '-'}
                hint={analytics.mainReason ? `Операций: ${formatCount(analytics.mainReason.count)}` : 'Нет данных'}
                tone="violet"
              />
            </div>
          </section>

          <section className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-slate-900">Меню аналитики</h3>
              <p className="text-sm text-slate-500">
                Выберите нужный разрез: лидеры, товары, причины, сотрудники или склады.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <AnalyticsMenuButton active={activeSection === 'leaders'} onClick={() => setActiveSection('leaders')} label="Лидеры" />
              <AnalyticsMenuButton active={activeSection === 'products'} onClick={() => setActiveSection('products')} label="Товары" />
              <AnalyticsMenuButton active={activeSection === 'reasons'} onClick={() => setActiveSection('reasons')} label="Причины" />
              <AnalyticsMenuButton active={activeSection === 'staff'} onClick={() => setActiveSection('staff')} label="Сотрудники" />
              <AnalyticsMenuButton active={activeSection === 'warehouses'} onClick={() => setActiveSection('warehouses')} label="Склады" />
            </div>
          </section>

          {activeSection === 'leaders' && (
            <div className="grid gap-3 xl:grid-cols-3">
              <WriteoffLeaderCard
                title="Чаще всего списывают"
                description="Товар с самым большим объёмом списания"
                row={analytics.mainProduct}
              />
              <WriteoffLeaderCard
                title="Основная причина"
                description="Причина, которая даёт самую большую сумму списаний"
                row={analytics.mainReason}
              />
              <WriteoffLeaderCard
                title="Главный источник"
                description="Сотрудник с самой большой суммой списаний"
                row={analytics.mainStaff}
              />
            </div>
          )}

          {activeSection === 'products' && (
            <WriteoffAnalyticsTableCard
              title="Списания по товарам"
              subtitle="Какие товары списываются больше всего"
              rows={analytics.topProducts}
            />
          )}

          {activeSection === 'reasons' && (
            <WriteoffAnalyticsTableCard
              title="Списания по причинам"
              subtitle="Почему чаще всего происходит списание"
              rows={analytics.topReasons}
            />
          )}

          {activeSection === 'staff' && (
            <WriteoffAnalyticsTableCard
              title="Списания по сотрудникам"
              subtitle="Кто чаще оформляет списания"
              rows={analytics.topStaff}
            />
          )}

          {activeSection === 'warehouses' && (
            <WriteoffAnalyticsTableCard
              title="Списания по складам"
              subtitle="На каких складах больше всего потерь"
              rows={analytics.topWarehouses}
            />
          )}
        </div>
      </div>
  );

  if (inline) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 p-2 backdrop-blur-sm sm:items-center sm:p-4">
      {content}
    </div>
  );
}

function WriteoffLeaderCard({
  title,
  description,
  row,
}: {
  title: string;
  description: string;
  row: { name: string; quantity: number; value: number; count: number } | null;
}) {
  return (
    <section className="rounded-3xl border border-amber-100 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      {row ? (
        <div className="mt-4 space-y-2">
          <h4 className="text-base font-semibold text-slate-900">{row.name}</h4>
          <div className="grid gap-2 text-sm text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <span>Количество</span>
              <span className="font-medium text-slate-900">{formatCount(row.quantity)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Сумма</span>
              <span className="font-medium text-slate-900">{formatMoney(row.value)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Операций</span>
              <span className="font-medium text-slate-900">{formatCount(row.count)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
          Нет данных для анализа
        </div>
      )}
    </section>
  );
}

function WriteoffAnalyticsTableCard({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: Array<{ name: string; quantity: number; value: number; count: number }>;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-amber-100 bg-amber-50/60">
      <div className="border-b border-white/70 px-5 py-4">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>

      <div className="max-h-[360px] overflow-auto px-3 py-3 sm:px-4">
        <div className="space-y-2">
          {rows.length ? (
            rows.map((row, index) => (
              <article key={`${title}-${row.name}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/80 bg-white px-3 py-3 shadow-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{row.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Кол-во: {formatCount(row.quantity)} · Операций: {formatCount(row.count)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Сумма</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{formatMoney(row.value)}</p>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
              Нет данных для отображения
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function AnalyticsMetricCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: 'sky' | 'emerald' | 'violet';
}) {
  const toneClass =
    tone === 'sky'
      ? 'border-sky-100 bg-sky-50 text-sky-700'
      : tone === 'emerald'
        ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
        : 'border-violet-100 bg-violet-50 text-violet-700';

  return (
    <section className={`rounded-3xl border px-4 py-4 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="rounded-2xl bg-white/80 p-2.5 shadow-sm">{icon}</div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{label}</p>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{hint}</p>
    </section>
  );
}

function AnalyticsLeaderCard({
  title,
  description,
  row,
  metricLabel,
  metricValue,
  tone,
}: {
  title: string;
  description: string;
  row: ProductProfitInsight | null;
  metricLabel: string;
  metricValue: string;
  tone: 'sky' | 'emerald' | 'violet';
}) {
  const toneClass =
    tone === 'sky'
      ? 'border-sky-100 bg-sky-50'
      : tone === 'emerald'
        ? 'border-emerald-100 bg-emerald-50'
        : 'border-violet-100 bg-violet-50';

  return (
    <section className={`rounded-3xl border p-4 ${toneClass}`}>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      {row ? (
        <div className="mt-4 space-y-2">
          <h4 className="text-base font-semibold text-slate-900">{row.name}</h4>
          <div className="grid gap-2 text-sm text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <span>Продано</span>
              <span className="font-medium text-slate-900">{formatCount(row.quantity)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Чистая выручка</span>
              <span className="font-medium text-slate-900">{formatMoney(row.revenue)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>{metricLabel}</span>
              <span className="font-medium text-slate-900">{metricValue}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
          Нет данных для анализа
        </div>
      )}
    </section>
  );
}

function AnalyticsTableCard({
  title,
  subtitle,
  rows,
  metricLabel,
  metricValue,
  tone,
}: {
  title: string;
  subtitle: string;
  rows: ProductProfitInsight[];
  metricLabel: string;
  metricValue: (row: ProductProfitInsight) => string;
  tone: 'sky' | 'emerald' | 'violet' | 'slate';
}) {
  const toneClass =
    tone === 'sky'
      ? 'border-sky-100 bg-sky-50/60'
      : tone === 'emerald'
        ? 'border-emerald-100 bg-emerald-50/60'
        : tone === 'violet'
          ? 'border-violet-100 bg-violet-50/60'
          : 'border-slate-200 bg-slate-50/80';

  return (
    <section className={`overflow-hidden rounded-3xl border ${toneClass}`}>
      <div className="border-b border-white/70 px-5 py-4">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>

      <div className="max-h-[320px] overflow-auto px-3 py-3 sm:px-4">
        <div className="space-y-2">
          {rows.length ? (
            rows.map((row, index) => (
              <article key={`${title}-${row.name}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/80 bg-white px-3 py-3 shadow-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{row.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Продано: {formatCount(row.quantity)} · Прибыль: {formatMoney(row.profit)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">{metricLabel}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{metricValue(row)}</p>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
              Нет данных для отображения
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function AnalyticsMiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
