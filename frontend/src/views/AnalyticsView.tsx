import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  BarChart3,
  Boxes,
  CalendarRange,
  DollarSign,
  Package,
  TrendingUp,
  Warehouse,
  Banknote,
  Search,
  ChevronRight,
  Filter,
  BarChart as BarChartIcon,
  LineChart as LineChartIcon,
  ArrowRight,
  PieChart as PieChartIcon
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  AreaChart, 
  Area,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { getAnalytics } from '../api/reports.api';
import { getWarehouses } from '../api/warehouses.api';
import { formatCount, formatMoney, formatPercent } from '../utils/format';
import { filterWarehousesForUser, getCurrentUser } from '../utils/userAccess';
import { clsx } from 'clsx';

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
  categoryPerformance: NamedMetric[];
};

type PeriodMode = 'month' | 'quarter' | 'year';
type SectionKey = 'overview' | 'charts' | 'products' | 'staff' | 'customers' | 'warehouses';

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRangeFromAnchor(anchor: string, mode: PeriodMode) {
  const [yearRaw, monthRaw] = anchor.split('-');
  const year = Number(yearRaw);
  const monthIndex = Math.max(0, Number(monthRaw || '1') - 1);

  if (mode === 'quarter') {
    const qs = Math.floor(monthIndex / 3) * 3;
    return { start: formatDateInputValue(new Date(year, qs, 1)), end: formatDateInputValue(new Date(year, qs + 3, 0)) };
  }
  if (mode === 'year') {
    return { start: formatDateInputValue(new Date(year, 0, 1)), end: formatDateInputValue(new Date(year, 12, 0)) };
  }
  return { start: formatDateInputValue(new Date(year, monthIndex, 1)), end: formatDateInputValue(new Date(year, monthIndex + 1, 0)) };
}

function getPeriodLabel(anchor: string, mode: PeriodMode) {
  const [yearRaw, monthRaw] = anchor.split('-');
  const year = Number(yearRaw);
  const monthIndex = Math.max(0, Number(monthRaw || '1') - 1);
  if (mode === 'year') return 'Год ' + year;
  if (mode === 'quarter') return Math.floor(monthIndex / 3) + 1 + ' квартал ' + year;
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(year, monthIndex, 1));
}

// 1C Style Components
const ReportCard = ({ label, value, help, icon: Icon, color }: any) => (
  <div className="bg-white border border-border-base p-4 rounded-[4px] shadow-sm flex flex-col relative overflow-hidden group hover:border-brand-orange/30 transition-colors">
    <div className={clsx("absolute top-0 left-0 w-1 h-full", color || "bg-brand-yellow")}></div>
    <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-medium uppercase text-slate-400 tracking-widest">{label}</span>
        <Icon size={16} className="text-slate-300 group-hover:text-brand-orange transition-colors" />
    </div>
    <div className="text-xl font-medium text-slate-900 mb-1">{value}</div>
    <div className="text-[10px] font-normal text-slate-400 italic">{help}</div>
  </div>
);

export default function AnalyticsView() {
  const today = new Date();
  const user = useMemo(() => getCurrentUser(), []);
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [periodAnchor, setPeriodAnchor] = useState(formatDateInputValue(today).slice(0, 7));
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const dateRange = useMemo(() => getRangeFromAnchor(periodAnchor, periodMode), [periodAnchor, periodMode]);
  const periodLabel = useMemo(() => getPeriodLabel(periodAnchor, periodMode), [periodAnchor, periodMode]);

  useEffect(() => {
    getWarehouses().then(items => setWarehouses(filterWarehousesForUser(Array.isArray(items) ? items : [], user)));
  }, [user]);

  useEffect(() => {
    setIsLoading(true);
    getAnalytics({ warehouseId: selectedWarehouseId ? Number(selectedWarehouseId) : null, start: dateRange.start, end: dateRange.end })
      .then(setData)
      .catch(() => toast.error('Ошибка загрузки данных'))
      .finally(() => setIsLoading(false));
  }, [dateRange, selectedWarehouseId]);

  const sections: { key: SectionKey; label: string }[] = [
    { key: 'overview', label: 'Сводные данные' },
    { key: 'charts', label: 'Графики сбыта' },
    { key: 'products', label: 'Товары' },
    { key: 'customers', label: 'Покупатели' },
    { key: 'staff', label: 'Сотрудники' }
  ];

  return (
    <div className="flex flex-col h-full bg-[#f0f1f4] text-[#1e1e1e]">
      {/* HEADER 1C */}
      <div className="bg-white border-b border-border-base p-4 shrink-0 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
             <div className="bg-brand-yellow p-2 rounded">
                <BarChart3 size={20} className="text-slate-800" />
             </div>
             <div>
                <h1 className="text-2xl font-medium text-slate-800 uppercase tracking-tighter">Аналитика и Сбыт</h1>
                <p className="text-[10px] font-medium uppercase text-slate-400">Мониторинг эффективности торговых операций</p>
             </div>
          </div>
          
          <div className="flex items-center gap-2 bg-[#f8f9fb] border border-border-base rounded p-1">
             {sections.map(s => (
               <button 
                 key={s.key}
                 onClick={() => setActiveSection(s.key)}
                 className={clsx(
                   "px-4 py-1.5 text-[10px] font-medium uppercase rounded transition-all",
                   activeSection === s.key ? "bg-brand-yellow text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"
                 )}
               >
                 {s.label}
               </button>
             ))}
          </div>
        </div>
      </div>

      {/* FILTER BAR 1C */}
      <div className="bg-white border-b border-border-base px-5 py-3 shrink-0 flex flex-wrap items-center gap-6">
         <div className="flex items-center gap-3">
            <span className="text-[10px] font-medium uppercase text-slate-400 tracking-widest">Период:</span>
            <div className="flex bg-slate-100 rounded p-1">
               {(['month', 'quarter', 'year'] as PeriodMode[]).map(m => (
                 <button 
                   key={m} 
                   onClick={() => setPeriodMode(m)}
                   className={clsx("px-3 py-1 text-[9px] font-medium uppercase rounded", periodMode === m ? "bg-white text-slate-800 shadow-sm" : "text-slate-500")}
                 >
                   {m === 'month' ? 'Месяц' : m === 'quarter' ? 'Квартал' : 'Год'}
                 </button>
               ))}
            </div>
            <input 
              type="month" 
              value={periodAnchor} 
              onChange={e => setPeriodAnchor(e.target.value)}
              className="field-1c !py-1 font-normal"
            />
            <span className="text-[11px] font-medium text-slate-700 italic underline decoration-brand-yellow decoration-2 underline-offset-4">{periodLabel}</span>
         </div>

         <div className="flex items-center gap-3">
            <span className="text-[10px] font-medium uppercase text-slate-400 tracking-widest">Склад:</span>
            <select 
              value={selectedWarehouseId} 
              onChange={e => setSelectedWarehouseId(e.target.value)}
              className="field-1c !py-1 font-normal min-w-[180px]"
            >
               <option value="">Все склады</option>
               {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
         </div>
      </div>

      {/* CONTENT Area */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
         {/* KPI GRID */}
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            <ReportCard 
              label="Выручка" 
              value={formatMoney(data?.summary?.totalRevenue || 0)} 
              help="Продажи за период" 
              icon={DollarSign} 
              color="bg-emerald-500"
            />
            <ReportCard 
              label="Валовая прибыль" 
              value={formatMoney(data?.summary?.totalProfit || 0)} 
              help="Выручка - Себестоимость" 
              icon={TrendingUp} 
              color="bg-sky-500"
            />
            <ReportCard 
              label="Чистая прибыль" 
              value={formatMoney(data?.summary?.netProfit || 0)} 
              help="За вычетом расходов" 
              icon={TrendingUp} 
              color="bg-indigo-500"
            />
             <ReportCard 
              label="Общий Долг" 
              value={formatMoney(data?.summary?.totalDebts || 0)} 
              help="Дебиторская задолженность" 
              icon={Package} 
              color="bg-amber-500"
            />
            <ReportCard 
              label="Расходы" 
              value={formatMoney(data?.summary?.totalExpenses || 0)} 
              help="Операционные затраты" 
              icon={Banknote} 
              color="bg-rose-500"
            />
            <ReportCard 
              label="Рентабельность" 
              value={formatPercent(data?.summary?.margin || 0, 1)} 
              help="Эффективность продаж" 
              icon={Boxes} 
              color="bg-brand-yellow"
            />
         </div>

         {isLoading ? (
            <div className="flex h-64 items-center justify-center bg-white border border-border-base rounded">
               <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-brand-yellow border-t-transparent animate-spin rounded-full"></div>
                  <span className="text-[10px] font-medium uppercase text-slate-400">Формирование данных...</span>
               </div>
            </div>
         ) : (
            <div className="space-y-6">
                {/* CHARTS SECTION */}
                {activeSection === 'charts' && (
                    <div className="grid grid-cols-1 gap-6">
                        <div className="bg-white border border-border-base rounded-[4px] p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-xs font-medium uppercase text-slate-700 flex items-center gap-2">
                                    <LineChartIcon size={14} className="text-brand-orange" /> Динамика выручки и прибыли
                                </h3>
                                <div className="flex items-center gap-4">
                                     <div className="flex items-center gap-2">
                                         <div className="w-3 h-3 bg-[#3b82f6] rounded-full"></div>
                                         <span className="text-[10px] font-medium uppercase text-slate-400">Выручка</span>
                                     </div>
                                     <div className="flex items-center gap-2">
                                         <div className="w-3 h-3 bg-[#10b981] rounded-full"></div>
                                         <span className="text-[10px] font-medium uppercase text-slate-400">Прибыль</span>
                                     </div>
                                </div>
                            </div>
                            <div className="h-[400px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={data?.chartData || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                            </linearGradient>
                                            <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis 
                                            dataKey="name" 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={{ fontSize: 10, fontWeight: 900, fill: '#64748b' }}
                                            dy={10}
                                        />
                                        <YAxis 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={{ fontSize: 10, fontWeight: 900, fill: '#64748b' }}
                                            tickFormatter={(v) => `${v/1000}k`}
                                        />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '4px', color: '#fff' }}
                                            itemStyle={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}
                                            labelStyle={{ fontSize: '10px', color: '#94a3b8', marginBottom: '4px' }}
                                        />
                                        <Area type="monotone" dataKey="sales" name="ВЫРУЧКА" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                                        <Area type="monotone" dataKey="profit" name="ПРИБЫЛЬ" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorProfit)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <div className="bg-white border border-border-base rounded-[4px] p-6 shadow-sm">
                                <h3 className="text-xs font-medium uppercase text-slate-700 flex items-center gap-2 mb-6">
                                    <BarChartIcon size={14} className="text-brand-orange" /> Продажи по категориям
                                </h3>
                                <div className="h-[250px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={data?.categoryPerformance || []}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#64748b' }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#64748b' }} />
                                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '4px' }} />
                                            <Bar dataKey="revenue" name="ВЫРУЧКА" fill="#ffda1a" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="profit" name="ПРИБЫЛЬ" fill="#10b981" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                             </div>

                             <div className="bg-white border border-border-base rounded-[4px] p-6 shadow-sm">
                                <h3 className="text-xs font-medium uppercase text-slate-700 flex items-center gap-2 mb-6">
                                    <PieChartIcon size={14} className="text-brand-orange" /> Причины списаний (Доля)
                                </h3>
                                <div className="h-[250px] w-full">
                                     {data?.writeoffReasons && data.writeoffReasons.length > 0 ? (
                                         <ResponsiveContainer width="100%" height="100%">
                                             <PieChart>
                                                 <Pie
                                                     data={data.writeoffReasons}
                                                     cx="50%"
                                                     cy="50%"
                                                     innerRadius={60}
                                                     outerRadius={80}
                                                     paddingAngle={5}
                                                     dataKey="value"
                                                     nameKey="name"
                                                 >
                                                     {data.writeoffReasons.map((entry, index) => (
                                                         <Cell key={`cell-${index}`} fill={['#ffda1a', '#ff9d00', '#3b82f6', '#10b981', '#f43f5e'][index % 5]} />
                                                     ))}
                                                 </Pie>
                                                 <Tooltip />
                                             </PieChart>
                                         </ResponsiveContainer>
                                     ) : (
                                         <div className="h-full flex items-center justify-center text-slate-300 font-medium uppercase text-[10px] italic">
                                             Нет данных по списаниям
                                         </div>
                                     )}
                                </div>
                             </div>
                        </div>
                    </div>
                )}

                {/* OVERVIEW SECTION (Ledger Style) */}
                {activeSection === 'overview' && (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <div className="bg-white border border-border-base rounded-[4px] overflow-hidden shadow-sm">
                            <div className="bg-slate-50 px-4 py-3 border-b border-border-base flex items-center justify-between">
                                <h3 className="text-xs font-medium uppercase text-slate-700 flex items-center gap-2">
                                    <TrendingUp size={14} className="text-brand-orange" /> Лидеры продаж (Товары)
                                </h3>
                            </div>
                            <table className="table-1c border-separate border-spacing-0">
                                <thead>
                                    <tr>
                                        <th className="w-12 text-center">№</th>
                                        <th>Товар</th>
                                        <th className="text-right">Кол-во</th>
                                        <th className="text-right">Выручка</th>
                                        <th className="text-right">Прибыль</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data?.productPerformance?.slice(0, 10).map((p, i) => (
                                        <tr key={p.name} className="hover:bg-slate-50 transition-colors">
                                            <td className="text-center font-mono text-[10px] text-slate-400">{i + 1}</td>
                                            <td className="font-medium text-slate-700">{p.name}</td>
                                            <td className="text-right font-medium text-slate-600">{p.quantity}</td>
                                            <td className="text-right font-medium text-slate-900">{formatMoney(p.revenue || 0)}</td>
                                            <td className="text-right font-medium text-emerald-600">{formatMoney(p.profit || 0)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                         <div className="bg-white border border-border-base rounded-[4px] overflow-hidden shadow-sm">
                            <div className="bg-slate-50 px-4 py-3 border-b border-border-base flex items-center justify-between">
                                <h3 className="text-xs font-medium uppercase text-slate-700 flex items-center gap-2">
                                    <Package size={14} className="text-brand-orange" /> Рейтинг покупателей
                                </h3>
                            </div>
                            <table className="table-1c border-separate border-spacing-0">
                                <thead>
                                    <tr>
                                        <th className="w-12 text-center">№</th>
                                        <th>Клиент</th>
                                        <th className="text-right">Закупка</th>
                                        <th className="text-right">Долг</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data?.customerPerformance?.slice(0, 10).map((c, i) => {
                                        const debt = data?.customerDebts?.find(d => d.name === c.name)?.debt || 0;
                                        return (
                                            <tr key={c.name} className="hover:bg-slate-50 transition-colors">
                                                <td className="text-center font-mono text-[10px] text-slate-400">{i + 1}</td>
                                                <td className="font-medium text-slate-700">{c.name}</td>
                                                <td className="text-right font-medium text-slate-900">{formatMoney(c.revenue || 0)}</td>
                                                <td className={clsx("text-right font-medium", debt > 0 ? "text-rose-600" : "text-slate-400")}>
                                                    {formatMoney(debt)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* PRODUCTS SECTION */}
                {activeSection === 'products' && (
                    <div className="bg-white border border-border-base rounded-[4px] overflow-hidden shadow-sm">
                        <div className="bg-slate-50 px-4 py-3 border-b border-border-base flex items-center justify-between font-medium text-[10px] uppercase text-slate-500">
                             Анализ продаж по номенклатуре
                        </div>
                        <table className="table-1c">
                            <thead>
                                <tr>
                                    <th className="w-12 text-center">№</th>
                                    <th>Наименование товара</th>
                                    <th className="text-right">Продано (Кол-во)</th>
                                    <th className="text-right">Выручка</th>
                                    <th className="text-right">Прибыль</th>
                                    <th className="text-right">Рентабельность</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data?.productPerformance?.map((p, i) => {
                                    const margin = p.revenue ? (p.profit! / p.revenue) * 100 : 0;
                                    return (
                                        <tr key={p.name} className="hover:bg-slate-50">
                                            <td className="text-center font-mono text-[10px] text-slate-400">{i + 1}</td>
                                            <td className="font-medium text-slate-700">{p.name}</td>
                                            <td className="text-right font-medium text-slate-600">{formatCount(p.quantity || 0)}</td>
                                            <td className="text-right font-medium text-slate-900">{formatMoney(p.revenue || 0)}</td>
                                            <td className="text-right font-medium text-emerald-600">{formatMoney(p.profit || 0)}</td>
                                            <td className="text-right font-medium text-brand-orange">{formatPercent(margin, 1)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* CUSTOMERS SECTION */}
                {activeSection === 'customers' && (
                    <div className="bg-white border border-border-base rounded-[4px] overflow-hidden shadow-sm">
                        <div className="bg-slate-50 px-4 py-3 border-b border-border-base flex items-center justify-between font-medium text-[10px] uppercase text-slate-500">
                             Эффективность работы с контрагентами
                        </div>
                        <table className="table-1c">
                            <thead>
                                <tr>
                                    <th className="w-12 text-center">№</th>
                                    <th>ФИО / Наименование клиента</th>
                                    <th className="text-right">Кол-во чеков</th>
                                    <th className="text-right">Общая закупка</th>
                                    <th className="text-right">Тек. Задолженность</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data?.customerPerformance?.map((c, i) => {
                                    const debt = data?.customerDebts?.find(d => d.name === c.name)?.debt || 0;
                                    return (
                                        <tr key={c.name} className="hover:bg-slate-50">
                                            <td className="text-center font-mono text-[10px] text-slate-400">{i + 1}</td>
                                            <td className="font-medium text-slate-700 uppercase">{c.name}</td>
                                            <td className="text-right font-medium text-slate-600">{c.invoices || 0}</td>
                                            <td className="text-right font-medium text-slate-900">{formatMoney(c.revenue || 0)}</td>
                                            <td className={clsx("text-right font-medium", debt > 0 ? "text-rose-600" : "text-slate-400")}>
                                                {formatMoney(debt)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* STAFF SECTION */}
                {activeSection === 'staff' && (
                    <div className="bg-white border border-border-base rounded-[4px] overflow-hidden shadow-sm">
                        <div className="bg-slate-50 px-4 py-3 border-b border-border-base flex items-center justify-between font-medium text-[10px] uppercase text-slate-500">
                             Показатели эффективности сотрудников (KPI)
                        </div>
                        <table className="table-1c">
                            <thead>
                                <tr>
                                    <th className="w-12 text-center">№</th>
                                    <th>Сотрудник</th>
                                    <th className="text-right">Операций</th>
                                    <th className="text-right">Сумма продаж (Выручка)</th>
                                    <th className="text-right">Принесенная прибыль</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data?.staffPerformance?.map((s, i) => (
                                    <tr key={s.name} className="hover:bg-slate-50">
                                        <td className="text-center font-mono text-[10px] text-slate-400">{i + 1}</td>
                                        <td className="font-medium text-slate-800 uppercase italic tracking-tighter decoration-brand-yellow/30 underline underline-offset-4">{s.name}</td>
                                        <td className="text-right font-medium text-slate-600">{s.operations || 0}</td>
                                        <td className="text-right font-medium text-slate-900">{formatMoney(s.revenue || 0)}</td>
                                        <td className="text-right font-medium text-emerald-600">{formatMoney(s.profit || 0)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
         )}
      </div>
    </div>
  );
}
