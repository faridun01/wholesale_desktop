import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Briefcase,
  Building2,
  CalendarRange,
  DollarSign,
  Package,
  TrendingUp,
  Users,
  Warehouse,
  Banknote,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getAnalytics } from '../api/reports.api';
import { getWarehouses } from '../api/warehouses.api';
import { formatCount, formatMoney, formatPercent } from '../utils/format';
import { filterWarehousesForUser, getCurrentUser } from '../utils/userAccess';

type AnalyticsSummary = {
  totalRevenue: number;
  totalProfit: number | null;
  totalCost: number | null;
  totalExpenses: number | null;
  totalSalesCount: number;
  totalCustomers: number;
  totalProducts: number;
  totalDebts: number;
  stockValuation: number | null;
  margin: number | null;
  netProfit: number | null;
};

type NamedMetric = {
  id?: number;
  name: string;
  sales?: number;
  profit?: number;
  revenue?: number;
  debt?: number;
  invoices?: number;
  quantity?: number;
  value?: number;
  operations?: number;
};

type AnalyticsPayload = {
  summary: AnalyticsSummary;
  chartData: Array<{ name: string; sales: number; profit: number }>;
  warehousePerformance: NamedMetric[];
  productPerformance: NamedMetric[];
  staffPerformance: NamedMetric[];
  customerPerformance: NamedMetric[];
  customerDebts: NamedMetric[];
  writeoffReasons: NamedMetric[];
  writeoffByStaff: NamedMetric[];
  writeoffByProduct: NamedMetric[];
  writeoffByWarehouse: NamedMetric[];
};

type PeriodMode = 'month' | 'quarter' | 'year';
type SectionKey = 'overview' | 'products' | 'staff';

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthAnchor(date: Date) {
  return formatDateInputValue(date).slice(0, 7);
}

function getMonthRange(year: number, monthIndex: number) {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  return { start: formatDateInputValue(start), end: formatDateInputValue(end) };
}

function getQuarterRange(year: number, monthIndex: number) {
  const quarterStartMonth = Math.floor(monthIndex / 3) * 3;
  const start = new Date(year, quarterStartMonth, 1);
  const end = new Date(year, quarterStartMonth + 3, 0);
  return { start: formatDateInputValue(start), end: formatDateInputValue(end) };
}

function getYearRange(year: number) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 12, 0);
  return { start: formatDateInputValue(start), end: formatDateInputValue(end) };
}

function getRangeFromAnchor(anchor: string, mode: PeriodMode) {
  const [yearRaw, monthRaw] = anchor.split('-');
  const year = Number(yearRaw);
  const monthIndex = Math.max(0, Number(monthRaw || '1') - 1);

  if (mode === 'quarter') return getQuarterRange(year, monthIndex);
  if (mode === 'year') return getYearRange(year);
  return getMonthRange(year, monthIndex);
}

function getPeriodLabel(anchor: string, mode: PeriodMode) {
  const [yearRaw, monthRaw] = anchor.split('-');
  const year = Number(yearRaw);
  const monthIndex = Math.max(0, Number(monthRaw || '1') - 1);

  if (mode === 'year') return 'Год ' + year;
  if (mode === 'quarter') return String(Math.floor(monthIndex / 3) + 1) + ' квартал ' + year;

  const labelDate = new Date(year, monthIndex, 1);
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(labelDate);
}

function getQuickRangeLabel(mode: PeriodMode) {
  if (mode === 'quarter') return 'Этот квартал';
  if (mode === 'year') return 'Этот год';
  return 'Этот месяц';
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_14px_36px_-24px_rgba(15,23,42,0.35)]">
      <div className="border-b border-slate-200/90 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function MetricCard({
  icon,
  label,
  value,
  help,
  tone = 'slate',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  help: string;
  tone?: 'slate' | 'emerald' | 'amber' | 'sky';
}) {
  const toneMap = {
    slate: 'border-slate-200 bg-white',
    emerald: 'border-emerald-100 bg-gradient-to-br from-emerald-50 to-white',
    amber: 'border-amber-100 bg-gradient-to-br from-amber-50 to-white',
    sky: 'border-sky-100 bg-gradient-to-br from-sky-50 to-white',
  } as const;

  return (
    <article className={`rounded-[26px] border p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.35)] ${toneMap[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-2xl bg-white/90 p-2.5 shadow-sm">{icon}</div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      </div>
      <p className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{help}</p>
    </article>
  );
}

function RankTable({
  title,
  hint,
  rows,
  primaryLabel,
  primaryValue,
  secondaryValue,
}: {
  title: string;
  hint: string;
  rows: NamedMetric[];
  primaryLabel: string;
  primaryValue: (row: NamedMetric) => string;
  secondaryValue?: (row: NamedMetric) => string;
}) {
  return (
    <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-slate-50/70">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{hint}</p>
      </div>
      <div className="space-y-2 p-4">
        {rows.length ? (
          rows.slice(0, 8).map((row, index) => (
            <article
              key={`${title}-${row.name}-${index}`}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white bg-white px-3 py-3 shadow-sm"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                {index + 1}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{row.name}</p>
                {secondaryValue ? <p className="mt-1 text-xs text-slate-500">{secondaryValue(row)}</p> : null}
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">{primaryLabel}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{primaryValue(row)}</p>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
            Нет данных
          </div>
        )}
      </div>
    </section>
  );
}

function AnalyticsDataTable({
  title,
  hint,
  rows,
  columns,
}: {
  title: string;
  hint: string;
  rows: NamedMetric[];
  columns: Array<{ key: string; label: string; align?: 'left' | 'right'; className?: string; render: (row: NamedMetric, index: number) => React.ReactNode }>;
}) {
  return (
    <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_12px_30px_-24px_rgba(15,23,42,0.32)]">
      <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-4">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{hint}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/70">
            <tr className="text-slate-500">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] ${column.align === 'right' ? 'text-right' : 'text-left'} ${column.className || ''}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length ? (
              rows.slice(0, 10).map((row, index) => (
                <tr key={`${title}-${row.name}-${index}`} className="transition-colors hover:bg-slate-50/70">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3 align-top ${column.align === 'right' ? 'text-right' : 'text-left'} ${column.className || ''}`}
                    >
                      {column.render(row, index)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-slate-400">
                  Нет данных
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LeaderInsight({
  icon,
  title,
  value,
  meta,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  meta: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
        {icon}
        <span>{title}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{meta}</p>
    </div>
  );
}

export default function AnalyticsView() {
  const today = new Date();
  const user = useMemo(() => getCurrentUser(), []);
  const defaultAnchor = getMonthAnchor(today);

  const [activeSection, setActiveSection] = useState<SectionKey>('overview');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [periodAnchor, setPeriodAnchor] = useState(defaultAnchor);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const dateRange = useMemo(() => getRangeFromAnchor(periodAnchor, periodMode), [periodAnchor, periodMode]);
  const periodLabel = useMemo(() => getPeriodLabel(periodAnchor, periodMode), [periodAnchor, periodMode]);

  useEffect(() => {
    getWarehouses()
      .then((items) => setWarehouses(filterWarehousesForUser(Array.isArray(items) ? items : [], user)))
      .catch(() => setWarehouses([]));
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getAnalytics({
      warehouseId: selectedWarehouseId ? Number(selectedWarehouseId) : null,
      start: dateRange.start,
      end: dateRange.end,
    })
      .then((response) => {
        if (!cancelled) {
          setData(response);
        }
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) {
          toast.error('Не удалось загрузить аналитику');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dateRange.end, dateRange.start, selectedWarehouseId]);

  const summary = data?.summary;
  const topProduct = data?.productPerformance?.[0] || null;
  const topStaff = data?.staffPerformance?.[0] || null;
  const topWarehouse = data?.warehousePerformance?.[0] || null;
  const topWriteoffReason = data?.writeoffReasons?.[0] || null;
  const topCustomer = data?.customerPerformance?.[0] || null;
  const topDebtor = data?.customerDebts?.[0] || null;
  const topSellingProducts = useMemo(
    () =>
      [...(data?.productPerformance || [])]
        .sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0) || Number(b.revenue || 0) - Number(a.revenue || 0)),
    [data?.productPerformance]
  );
  const productEfficiencyRows = useMemo(
    () =>
      (data?.productPerformance || [])
        .map((row) => {
          const quantity = Number(row.quantity || 0);
          const revenue = Number(row.revenue || 0);
          const profit = Number(row.profit || 0);
          const profitPerUnit = quantity > 0 ? profit / quantity : 0;
          const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

          return {
            ...row,
            quantity,
            revenue,
            profit,
            profitPerUnit,
            profitMargin,
          };
        })
        .filter((row) => row.profit > 0 && row.quantity > 0)
        .sort((a, b) => {
          if (b.profitPerUnit !== a.profitPerUnit) {
            return b.profitPerUnit - a.profitPerUnit;
          }
          return b.profit - a.profit;
        }),
    [data?.productPerformance]
  );
  const staffSalesLeaders = useMemo(
    () =>
      [...(data?.staffPerformance || [])]
        .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0) || Number(b.profit || 0) - Number(a.profit || 0)),
    [data?.staffPerformance]
  );

  const actionItems = useMemo(() => {
    const items: Array<{ title: string; detail: string; tone: 'rose' | 'amber' | 'sky' | 'emerald' }> = [];

    const margin = Number(summary?.margin || 0);
    const debts = Number(summary?.totalDebts || 0);
    const revenue = Number(summary?.totalRevenue || 0);
    const debtShare = revenue > 0 ? (debts / revenue) * 100 : 0;
    const topLoss = Number(topWriteoffReason?.value || 0);
    const topLossShare = revenue > 0 ? (topLoss / revenue) * 100 : 0;

    if (margin > 0 && margin < 12) {
      items.push({
        title: 'Маржа низкая',
        detail: 'Средняя маржа ' + formatPercent(margin, 1) + '. Проверьте цену и себестоимость.',
        tone: 'amber',
      });
    }

    if (debtShare >= 20) {
      items.push({
        title: 'Долги высокие',
        detail: 'Доля долгов ' + formatPercent(debtShare, 1) + ' от выручки. Нужен контроль оплат.',
        tone: 'rose',
      });
    }

    if (topLossShare >= 3) {
      items.push({
        title: 'Списания заметные',
        detail: 'Потери по главной причине уже ' + formatPercent(topLossShare, 1) + ' от выручки.',
        tone: 'rose',
      });
    }

    if (topProduct && Number(topProduct.profit || 0) > 0) {
      items.push({
        title: 'Лидер по товару',
        detail: topProduct.name + ' приносит максимум прибыли. Держите в наличии.',
        tone: 'emerald',
      });
    }

    if (topCustomer && topDebtor && topCustomer.name === topDebtor.name) {
      items.push({
        title: 'Крупный клиент в долге',
        detail: topDebtor.name + ' даёт оборот и одновременно держит самый большой долг.',
        tone: 'sky',
      });
    }

    if (!items.length) {
      items.push({
        title: 'Ситуация стабильна',
        detail: 'Критичных отклонений по прибыли, долгам и списаниям не видно.',
        tone: 'emerald',
      });
    }

    return items;
  }, [summary, topCustomer, topDebtor, topProduct, topWriteoffReason]);

  const sections: Array<{ key: SectionKey; label: string }> = [
    { key: 'overview', label: 'Главное' },
    { key: 'products', label: 'Товары' },
    { key: 'staff', label: 'Сотрудники' },
  ];

  return (
    <div className="app-page-shell bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.08),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(15,118,110,0.08),_transparent_24%)]">
      <div className="w-full space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-slate-200/90 bg-white shadow-[0_24px_70px_-36px_rgba(15,23,42,0.4)]">
          <div className="grid gap-0 xl:grid-cols-[minmax(0,1.35fr)_420px]">
            <div className="border-b border-slate-200/80 px-6 py-6 xl:border-b-0 xl:border-r">
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white">
                <BarChart3 size={14} />
                Админ аналитика
              </div>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">Аналитика CRM</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                Главные показатели бизнеса в аккуратном формате: самые продаваемые товары, товары по эффективности прибыли и результат сотрудников.
              </p>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Период</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{periodLabel}</p>
                  <p className="mt-1 text-xs text-slate-500">{dateRange.start} - {dateRange.end}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Продажи</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{formatCount(summary?.totalSalesCount || 0)}</p>
                  <p className="mt-1 text-xs text-slate-500">Всего накладных за период</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Ассортимент</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{formatCount(summary?.totalProducts || 0)}</p>
                  <p className="mt-1 text-xs text-slate-500">Товаров в движении</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-6">
              <div className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <CalendarRange size={16} className="text-slate-500" />
                  {'Управление периодом'}
                </div>

                <div className="mt-4 inline-flex w-full rounded-2xl border border-slate-200 bg-white p-1">
                  {[
                    { key: 'month', label: 'Месяц' },
                    { key: 'quarter', label: 'Квартал' },
                    { key: 'year', label: 'Год' },
                  ].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setPeriodMode(option.key as PeriodMode)}
                      className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                        periodMode === option.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex flex-col gap-3">
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                    <Warehouse size={15} className="text-slate-400" />
                    <select
                      value={selectedWarehouseId}
                      onChange={(event) => setSelectedWarehouseId(event.target.value)}
                      className="w-full appearance-none bg-transparent text-[13px] text-slate-700 outline-none"
                    >
                      <option value="">{'\u0412\u0441\u0435 \u0441\u043a\u043b\u0430\u0434\u044b'}</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                    <span className="text-[13px] text-slate-400">{'\u0411\u0430\u0437\u0430'}</span>
                    <input
                      type="month"
                      value={periodAnchor}
                      onChange={(event) => setPeriodAnchor(event.target.value)}
                      className="w-full bg-transparent text-[13px] text-slate-700 outline-none"
                    />
                  </div>

                  <div className="rounded-2xl bg-slate-900 px-4 py-3 text-white">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">{'\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0439 \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d'}</p>
                    <p className="mt-2 text-sm font-semibold">{getQuickRangeLabel(periodMode)}</p>
                    <p className="mt-1 text-xs text-slate-300">{dateRange.start} - {dateRange.end}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <MetricCard icon={<DollarSign size={18} className="text-emerald-700" />} label={'\u0412\u044b\u0440\u0443\u0447\u043a\u0430'} value={formatMoney(summary?.totalRevenue || 0)} help={'\u041e\u0431\u0449\u0438\u0439 \u043e\u0431\u043e\u0440\u043e\u0442.'} tone="emerald" />
          <MetricCard icon={<TrendingUp size={18} className="text-sky-700" />} label={'\u0427\u0438\u0441\u0442\u0430\u044f \u043f\u0440\u0438\u0431\u044b\u043b\u044c'} value={formatMoney(summary?.netProfit || 0)} help={'\u0414\u043e\u0445\u043e\u0434 \u0437\u0430 \u0432\u044b\u0447\u0435\u0442\u043e\u043c \u0440\u0430\u0441\u0445\u043e\u0434\u043e\u0432.'} tone="sky" />
          <MetricCard icon={<Banknote size={18} className="text-rose-700" />} label={'\u0420\u0430\u0441\u0445\u043e\u0434\u044b'} value={formatMoney(summary?.totalExpenses || 0)} help={'\u0410\u0440\u0435\u043d\u0434\u0430, \u0437/\u043f \u0438 \u0434\u0440.'} tone="amber" />
          <MetricCard icon={<Boxes size={18} className="text-amber-700" />} label={'\u041c\u0430\u0440\u0436\u0430 (\u0447\u0438\u0441\u0442.)'} value={formatPercent(summary?.margin || 0, 1)} help={'\u0420\u0435\u043d\u0442\u0430\u0431\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c \u0431\u0438\u0437\u043d\u0435\u0441\u0430.'} tone="amber" />
          <MetricCard icon={<Package size={18} className="text-slate-700" />} label={'\u0414\u043e\u043b\u0433\u0438'} value={formatMoney(summary?.totalDebts || 0)} help={'\u041d\u0435\u043e\u043f\u043b\u0430\u0447\u0435\u043d\u043d\u044b\u0435 \u0441\u0443\u043c\u043c\u044b.'} tone="slate" />
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_14px_36px_-24px_rgba(15,23,42,0.35)]">
          <div className="grid gap-2 md:grid-cols-3">
            {sections.map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(section.key)}
                className={`rounded-2xl px-3 py-3 text-sm font-medium transition ${
                  activeSection === section.key ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {section.label}
              </button>
            ))}
          </div>
        </section>

        {activeSection === 'overview' ? (
          <Panel title={'\u0413\u043b\u0430\u0432\u043d\u0430\u044f \u0430\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430'} description={'\u0422\u0440\u0438 \u0433\u043b\u0430\u0432\u043d\u044b\u0445 \u043f\u043e\u0434\u0440\u0430\u0437\u0434\u0435\u043b\u0430 \u0434\u043b\u044f \u0430\u0434\u043c\u0438\u043d\u0430 \u0432 \u043e\u0434\u043d\u043e\u043c \u043c\u0435\u0441\u0442\u0435.'}>
            {isLoading ? (
              <div className="py-16 text-center text-sm text-slate-400">{'\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0430\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0438...'}</div>
            ) : (
              <div className="space-y-4">
                <AnalyticsDataTable
                  title={'\u0421\u0430\u043c\u044b\u0435 \u043f\u0440\u043e\u0434\u0430\u0432\u0430\u0435\u043c\u044b\u0435 \u0442\u043e\u0432\u0430\u0440\u044b'}
                  hint={'\u0421\u043f\u0438\u0441\u043e\u043a \u043e\u0442\u0441\u043e\u0440\u0442\u0438\u0440\u043e\u0432\u0430\u043d \u043f\u043e \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u0443 \u043f\u0440\u043e\u0434\u0430\u0436.'}
                  rows={topSellingProducts}
                  columns={[
                    { key: 'rank', label: '\u2116', render: (_, index) => index + 1, className: 'w-14' },
                    { key: 'name', label: '\u0422\u043e\u0432\u0430\u0440', render: (row) => row.name || '-' },
                    { key: 'quantity', label: '\u041f\u0440\u043e\u0434\u0430\u043d\u043e', render: (row) => formatCount(row.quantity || 0), align: 'right' },
                    { key: 'revenue', label: '\u0412\u044b\u0440\u0443\u0447\u043a\u0430', render: (row) => formatMoney(row.revenue || 0), align: 'right' },
                    { key: 'profit', label: '\u041f\u0440\u0438\u0431\u044b\u043b\u044c', render: (row) => formatMoney(row.profit || 0), align: 'right' },
                  ]}
                />
                <AnalyticsDataTable
                  title={'\u0422\u043e\u0432\u0430\u0440\u044b \u043f\u043e \u0440\u0435\u043d\u0442\u0430\u0431\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u0438'}
                  hint={'\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442, \u043a\u0430\u043a\u0438\u0435 \u0442\u043e\u0432\u0430\u0440\u044b \u0434\u0430\u044e\u0442 \u043b\u0443\u0447\u0448\u0443\u044e \u043e\u0442\u0434\u0430\u0447\u0443 \u043f\u043e \u043f\u0440\u0438\u0431\u044b\u043b\u0438.'}
                  rows={productEfficiencyRows}
                  columns={[
                    { key: 'rank', label: '\u2116', render: (_, index) => index + 1, className: 'w-14' },
                    { key: 'name', label: '\u0422\u043e\u0432\u0430\u0440', render: (row) => row.name || '-' },
                    { key: 'profitMargin', label: '\u0420\u0435\u043d\u0442\u0430\u0431\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c', render: (row) => formatPercent((row as NamedMetric & { profitMargin?: number }).profitMargin || 0, 1), align: 'right' },
                    { key: 'profitPerUnit', label: '\u041f\u0440\u0438\u0431\u044b\u043b\u044c \u0437\u0430 1 \u0448\u0442', render: (row) => formatMoney((row as NamedMetric & { profitPerUnit?: number }).profitPerUnit || 0), align: 'right' },
                    { key: 'profit', label: '\u041e\u0431\u0449\u0430\u044f \u043f\u0440\u0438\u0431\u044b\u043b\u044c', render: (row) => formatMoney(row.profit || 0), align: 'right' },
                  ]}
                />
                <AnalyticsDataTable
                  title={'\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u043e\u0432'}
                  hint={'\u041a\u0442\u043e \u0434\u0435\u043b\u0430\u0435\u0442 \u0431\u043e\u043b\u044c\u0448\u0435 \u043f\u0440\u043e\u0434\u0430\u0436 \u0438 \u043a\u0442\u043e \u043f\u0440\u0438\u043d\u043e\u0441\u0438\u0442 \u0431\u043e\u043b\u044c\u0448\u0435 \u043f\u0440\u0438\u0431\u044b\u043b\u0438.'}
                  rows={staffSalesLeaders}
                  columns={[
                    { key: 'rank', label: '\u2116', render: (_, index) => index + 1, className: 'w-14' },
                    { key: 'name', label: '\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a', render: (row) => row.name || '-' },
                    { key: 'invoices', label: '\u041d\u0430\u043a\u043b\u0430\u0434\u043d\u044b\u0435', render: (row) => formatCount(row.invoices || 0), align: 'right' },
                    { key: 'revenue', label: '\u0412\u044b\u0440\u0443\u0447\u043a\u0430', render: (row) => formatMoney(row.revenue || 0), align: 'right' },
                    { key: 'profit', label: '\u041f\u0440\u0438\u0431\u044b\u043b\u044c', render: (row) => formatMoney(row.profit || 0), align: 'right' },
                  ]}
                />
              </div>
            )}
          </Panel>
        ) : null}

        {activeSection === 'products' ? (
          <Panel title={'\u0410\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430 \u043f\u043e \u0442\u043e\u0432\u0430\u0440\u0430\u043c'} description={'\u041e\u0442\u0434\u0435\u043b\u044c\u043d\u044b\u0435 \u043f\u043e\u0434\u0440\u0430\u0437\u0434\u0435\u043b\u044b \u043f\u043e \u043f\u0440\u043e\u0434\u0430\u0436\u0430\u043c \u0438 \u043f\u043e \u044d\u0444\u0444\u0435\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u0438 \u043f\u0440\u0438\u0431\u044b\u043b\u0438.'}>
            <div className="space-y-4">
              <AnalyticsDataTable
                title={'\u041f\u043e\u0434\u0440\u0430\u0437\u0434\u0435\u043b: \u0441\u0430\u043c\u044b\u0435 \u043f\u0440\u043e\u0434\u0430\u0432\u0430\u0435\u043c\u044b\u0435 \u0442\u043e\u0432\u0430\u0440\u044b'}
                hint={'\u0422\u043e\u0432\u0430\u0440\u044b \u043e\u0442\u0441\u043e\u0440\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u044b \u043f\u043e \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u0443 \u043f\u0440\u043e\u0434\u0430\u043d\u043d\u044b\u0445 \u0435\u0434\u0438\u043d\u0438\u0446.'}
                rows={topSellingProducts}
                columns={[
                  { key: 'rank', label: '\u2116', render: (_, index) => index + 1, className: 'w-14' },
                  { key: 'name', label: '\u0422\u043e\u0432\u0430\u0440', render: (row) => row.name || '-' },
                  { key: 'quantity', label: '\u041f\u0440\u043e\u0434\u0430\u043d\u043e', render: (row) => formatCount(row.quantity || 0), align: 'right' },
                  { key: 'revenue', label: '\u0412\u044b\u0440\u0443\u0447\u043a\u0430', render: (row) => formatMoney(row.revenue || 0), align: 'right' },
                  { key: 'profit', label: '\u041f\u0440\u0438\u0431\u044b\u043b\u044c', render: (row) => formatMoney(row.profit || 0), align: 'right' },
                ]}
              />
              <AnalyticsDataTable
                title={'\u041f\u043e\u0434\u0440\u0430\u0437\u0434\u0435\u043b: \u0442\u043e\u0432\u0430\u0440\u044b \u043f\u043e \u0440\u0435\u043d\u0442\u0430\u0431\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u0438'}
                hint={'\u0414\u0430\u0436\u0435 \u0435\u0441\u043b\u0438 \u0442\u043e\u0432\u0430\u0440 \u043f\u0440\u043e\u0434\u0430\u0451\u0442\u0441\u044f \u0440\u0435\u0436\u0435, \u0437\u0434\u0435\u0441\u044c \u0432\u0438\u0434\u043d\u043e, \u043d\u0430\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u043e\u043d \u0432\u044b\u0433\u043e\u0434\u0435\u043d.'}
                rows={productEfficiencyRows}
                columns={[
                  { key: 'rank', label: '\u2116', render: (_, index) => index + 1, className: 'w-14' },
                  { key: 'name', label: '\u0422\u043e\u0432\u0430\u0440', render: (row) => row.name || '-' },
                  { key: 'profitMargin', label: '\u0420\u0435\u043d\u0442\u0430\u0431\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c', render: (row) => formatPercent((row as NamedMetric & { profitMargin?: number }).profitMargin || 0, 1), align: 'right' },
                  { key: 'profitPerUnit', label: '\u041f\u0440\u0438\u0431\u044b\u043b\u044c \u0437\u0430 1 \u0448\u0442', render: (row) => formatMoney((row as NamedMetric & { profitPerUnit?: number }).profitPerUnit || 0), align: 'right' },
                  { key: 'quantity', label: '\u041f\u0440\u043e\u0434\u0430\u043d\u043e', render: (row) => formatCount(row.quantity || 0), align: 'right' },
                ]}
              />
            </div>
          </Panel>
        ) : null}

        {activeSection === 'staff' ? (
          <Panel title={'\u0410\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430 \u043f\u043e \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0430\u043c'} description={'\u041e\u0442\u0434\u0435\u043b\u044c\u043d\u043e \u0432\u0438\u0434\u043d\u043e, \u043a\u0442\u043e \u043f\u0440\u043e\u0434\u0430\u0451\u0442 \u0431\u043e\u043b\u044c\u0448\u0435 \u0438 \u043a\u0442\u043e \u043f\u0440\u0438\u043d\u043e\u0441\u0438\u0442 \u0431\u043e\u043b\u044c\u0448\u0435 \u043f\u0440\u0438\u0431\u044b\u043b\u0438.'}>
            <div className="space-y-4">
              <AnalyticsDataTable
                title={'\u041f\u043e\u0434\u0440\u0430\u0437\u0434\u0435\u043b: \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0438 \u043f\u043e \u043f\u0440\u043e\u0434\u0430\u0436\u0430\u043c'}
                hint={'\u0420\u0435\u0439\u0442\u0438\u043d\u0433 \u043f\u043e \u043e\u0431\u0449\u0435\u0439 \u0432\u044b\u0440\u0443\u0447\u043a\u0435 \u0438 \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u0443 \u043d\u0430\u043a\u043b\u0430\u0434\u043d\u044b\u0445.'}
                rows={staffSalesLeaders}
                columns={[
                  { key: 'rank', label: '\u2116', render: (_, index) => index + 1, className: 'w-14' },
                  { key: 'name', label: '\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a', render: (row) => row.name || '-' },
                  { key: 'invoices', label: '\u041d\u0430\u043a\u043b\u0430\u0434\u043d\u044b\u0435', render: (row) => formatCount(row.invoices || 0), align: 'right' },
                  { key: 'revenue', label: '\u0412\u044b\u0440\u0443\u0447\u043a\u0430', render: (row) => formatMoney(row.revenue || 0), align: 'right' },
                  { key: 'profit', label: '\u041f\u0440\u0438\u0431\u044b\u043b\u044c', render: (row) => formatMoney(row.profit || 0), align: 'right' },
                ]}
              />
              <AnalyticsDataTable
                title={'\u041f\u043e\u0434\u0440\u0430\u0437\u0434\u0435\u043b: \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0438 \u043f\u043e \u043f\u0440\u0438\u0431\u044b\u043b\u0438'}
                hint={'\u041a\u0442\u043e \u043f\u0440\u0438\u043d\u043e\u0441\u0438\u0442 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438 \u043d\u0430\u0438\u0431\u043e\u043b\u044c\u0448\u0443\u044e \u043f\u0440\u0438\u0431\u044b\u043b\u044c.'}
                rows={[...(data?.staffPerformance || [])].sort((a, b) => Number(b.profit || 0) - Number(a.profit || 0) || Number(b.revenue || 0) - Number(a.revenue || 0))}
                columns={[
                  { key: 'rank', label: '\u2116', render: (_, index) => index + 1, className: 'w-14' },
                  { key: 'name', label: '\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a', render: (row) => row.name || '-' },
                  { key: 'profit', label: '\u041f\u0440\u0438\u0431\u044b\u043b\u044c', render: (row) => formatMoney(row.profit || 0), align: 'right' },
                  { key: 'revenue', label: '\u0412\u044b\u0440\u0443\u0447\u043a\u0430', render: (row) => formatMoney(row.revenue || 0), align: 'right' },
                  { key: 'invoices', label: '\u041d\u0430\u043a\u043b\u0430\u0434\u043d\u044b\u0435', render: (row) => formatCount(row.invoices || 0), align: 'right' },
                ]}
              />
            </div>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
