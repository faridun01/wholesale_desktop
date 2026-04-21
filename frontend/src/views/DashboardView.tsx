import React, { useEffect, useMemo, useState, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Boxes,
  ChevronRight,
  Package,
  Store,
  Users,
  Wallet,
  ArrowRight,
  LayoutDashboard,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  ShoppingBag,
  History as HistoryIcon,
  Loader2
} from 'lucide-react';
import { getDashboardSummary } from '../api/dashboard.api';
import { getWarehouses } from '../api/warehouses.api';
import { formatCount, formatMoney, formatPercent } from '../utils/format';
import { filterWarehousesForUser, getCurrentUser, getUserWarehouseId, isAdminUser } from '../utils/userAccess';
import ChartSkeleton from '../components/charts/ChartSkeleton';
import { clsx } from 'clsx';

const DashboardCharts = React.lazy(() => import('../components/charts/DashboardCharts'));

const DashboardMetric = ({ title, value, delta, deltaValue, icon: Icon, subtitle }: any) => (
  <div className="bg-white border border-border-base rounded-[4px] p-4 relative overflow-hidden group hover:shadow-sm transition-all border-l-4 border-l-brand-yellow">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{title}</p>
        <h3 className="text-xl font-black text-slate-800 tracking-tight">{value}</h3>
        <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 tracking-tighter">{subtitle}</p>
      </div>
      <div className="text-brand-orange bg-slate-50 p-2.5 rounded border border-border-base">
        <Icon size={18} />
      </div>
    </div>
    <div className="mt-3 pt-3 border-t border-[#f0f0f0] flex items-center gap-2">
      <span className={`text-[11px] font-black flex items-center gap-0.5 ${deltaValue < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
        {deltaValue < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
        {delta}
      </span>
      <span className="text-[9px] text-slate-400 font-black uppercase tracking-tighter">к прошлому месяцу</span>
    </div>
  </div>
);

export default function DashboardView() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const user = useMemo(() => getCurrentUser(), []);
  const isAdmin = isAdminUser(user);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(isAdmin ? '' : (getUserWarehouseId(user) ? String(getUserWarehouseId(user)) : ''));

  const fetchDashboardData = async (silent = false) => {
    if (!silent) setIsLoaded(false);
    try {
      const data = await getDashboardSummary(selectedWarehouseId ? Number(selectedWarehouseId) : null);
      setSummary(data);
    } finally {
      if (!silent) setIsLoaded(true);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    const handleRefresh = () => fetchDashboardData(true);
    window.addEventListener('refresh-data', handleRefresh);
    return () => window.removeEventListener('refresh-data', handleRefresh);
  }, [selectedWarehouseId]);

  useEffect(() => {
    getWarehouses().then(data => {
      setWarehouses(filterWarehousesForUser(Array.isArray(data) ? data : [], user));
    });
  }, [user]);

  const metrics = [
    {
      title: 'Выручка / Доход',
      value: formatMoney(summary?.totalRevenue || 0),
      subtitle: 'Текущий оборот за месяц',
      deltaValue: Number(summary?.metricChanges?.revenue || 0),
      delta: (Number(summary?.metricChanges?.revenue || 0) > 0 ? '+' : '') + formatPercent(summary?.metricChanges?.revenue || 0),
      icon: Wallet,
    },
    {
      title: 'Продажи / Чеки',
      value: formatCount(summary?.totalOrders || 0),
      subtitle: 'Всего транзакций POS',
      deltaValue: Number(summary?.metricChanges?.orders || 0),
      delta: (Number(summary?.metricChanges?.orders || 0) > 0 ? '+' : '') + formatPercent(summary?.metricChanges?.orders || 0),
      icon: ShoppingBag,
    },
    {
      title: 'Контрагенты',
      value: formatCount(summary?.totalCustomers || 0),
      subtitle: 'База активных клиентов',
      deltaValue: Number(summary?.metricChanges?.customers || 0),
      delta: (Number(summary?.metricChanges?.customers || 0) > 0 ? '+' : '') + formatPercent(summary?.metricChanges?.customers || 0),
      icon: Users,
    },
    {
      title: 'Складской запас',
      value: formatCount(summary?.totalProducts || 0),
      subtitle: 'Активная номенклатура',
      deltaValue: Number(summary?.metricChanges?.products || 0),
      delta: (Number(summary?.metricChanges?.products || 0) > 0 ? '+' : '') + formatPercent(summary?.metricChanges?.products || 0),
      icon: Boxes,
    },
  ];

  const recentSales = summary?.recentSales?.slice(0, 10) || [];

  return (
    <div className="flex flex-col gap-6">
      {/* 1C Header Section */}
      <div className="flex items-center justify-between border-b border-border-base pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-brand-yellow p-2 rounded">
             <LayoutDashboard size={20} className="text-slate-800" />
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Информационная панель <span className="text-slate-400 font-normal">| Основной отчет</span></h1>
        </div>
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded border border-border-base shadow-sm">
           <Store size={14} className="text-slate-400" />
           <select
             value={selectedWarehouseId}
             onChange={(e) => setSelectedWarehouseId(e.target.value)}
             className="bg-transparent text-[11px] font-black text-slate-700 outline-none uppercase tracking-widest"
           >
             {isAdmin && <option value="">[Все склады компании]</option>}
             {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
           </select>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m, i) => <DashboardMetric key={i} {...m} />)}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Main Log Section */}
        <div className="lg:col-span-8 flex flex-col bg-white border border-border-base rounded-[4px] shadow-sm">
          <div className="bg-[#f8f9fb] border-b border-border-base px-4 py-3 flex items-center justify-between">
            <h2 className="text-[11px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
               <HistoryIcon size={14} className="text-slate-400" /> Журнал торговых операций
            </h2>
            <button 
              onClick={() => navigate('/sales')} 
              className="btn-1c text-[10px] flex items-center gap-1 border-brand-orange/30 text-brand-orange"
            >
               Все операции <ArrowRight size={12} />
            </button>
          </div>
          <div className="overflow-x-auto">
             <table className="table-1c">
                <thead>
                   <tr>
                      <th className="w-20 text-center">Номер</th>
                      <th>Контрагент</th>
                      <th className="text-right">Сумма</th>
                      <th className="text-center">Статус оплаты</th>
                      <th className="w-10"></th>
                   </tr>
                </thead>
                <tbody>
                   {recentSales.map((sale: any) => (
                      <tr key={sale.id}>
                         <td className="text-center font-mono font-bold text-slate-400">#{sale.id}</td>
                         <td className="font-bold">{sale.customer?.name || '<Розничный покупатель>'}</td>
                         <td className="text-right font-black text-slate-900">{formatMoney(sale.netAmount)}</td>
                         <td className="text-center">
                            <span className={clsx(
                              "text-[9px] font-black uppercase px-2 py-0.5 rounded",
                               sale.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 
                               sale.status === 'partial' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'
                            )}>
                               {sale.status === 'paid' ? 'Оплачено' : sale.status === 'partial' ? 'Частично' : 'Задолженность'}
                            </span>
                         </td>
                         <td><ChevronRight size={14} className="text-slate-300" /></td>
                      </tr>
                   ))}
                   {!recentSales.length && (
                      <tr>
                         <td colSpan={5} className="py-20 text-center text-slate-300 font-bold uppercase text-[10px]">Записей не обнаружено</td>
                      </tr>
                   )}
                </tbody>
             </table>
          </div>
        </div>

        {/* Right Info Panels */}
        <div className="lg:col-span-4 flex flex-col gap-6">
           <div className="bg-white border border-border-base rounded-[4px] p-5 shadow-sm space-y-5">
              <h2 className="text-[11px] font-black text-slate-800 uppercase tracking-widest border-b border-[#f0f0f0] pb-3">Экономические показатели</h2>
              
              <div className="space-y-4">
                 <div>
                    <div className="flex justify-between text-[10px] font-black text-slate-400 mb-2 uppercase tracking-tighter">
                       <span>Оценка ТМЦ на складах</span>
                       <span className="text-slate-900">{formatMoney(summary?.inventoryValue || 0)}</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-px overflow-hidden">
                       <div className="h-full bg-brand-orange w-[65%]" style={{ width: summary?.inventoryValue ? '100%' : '0%' }}></div>
                    </div>
                 </div>
                 
                 <div>
                    <div className="flex justify-between text-[10px] font-black text-slate-400 mb-2 uppercase tracking-tighter">
                       <span>Общий долг клиентов</span>
                       <span className="text-rose-600 font-black">{formatMoney(summary?.totalDebts || 0)}</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-px overflow-hidden">
                       <div className="h-full bg-rose-500 w-[40%]" style={{ width: summary?.totalDebts ? '100%' : '0%' }}></div>
                    </div>
                 </div>
              </div>

              <div className="pt-4 grid grid-cols-1 gap-2">
                 <button onClick={() => navigate('/products?sort=low-stock')} className="btn-1c w-full text-left flex items-center justify-between group">
                    <span>Критический остаток товара</span>
                    <AlertTriangle size={14} className="text-brand-orange opacity-0 group-hover:opacity-100 transition-opacity" />
                 </button>
                 <button onClick={() => navigate('/customers')} className="btn-1c w-full text-left flex items-center justify-between group">
                    <span>Список задолженностей</span>
                    <Wallet size={14} className="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                 </button>
              </div>
           </div>

           <div className="bg-brand-blue rounded-[4px] p-5 text-white shadow-xl relative overflow-hidden group border-b-4 border-b-brand-yellow">
              <ShoppingCart size={80} className="absolute -right-4 -bottom-4 opacity-10 rotate-12 transition-transform group-hover:scale-110" />
              <div className="relative z-10">
                <p className="text-[9px] font-black uppercase tracking-[2px] text-white/50 mb-1">Точка продаж</p>
                <h3 className="text-xl font-black mb-3 italic tracking-tight">Розничная торговля</h3>
                <p className="text-[11px] text-white/70 mb-5 leading-relaxed">Быстрое оформление чека, автоматический расчет остатка и печать документов.</p>
                <button 
                  onClick={() => navigate('/pos')}
                  className="w-full py-2.5 bg-brand-yellow text-slate-900 font-black rounded text-[11px] uppercase tracking-widest hover:bg-[#ffe04d] active:scale-95 transition-all"
                >
                   Открыть окно POS-терминала
                </button>
              </div>
           </div>
        </div>
      </div>
      
      {/* Charts Section */}
      <div className="bg-white border border-border-base rounded-[4px] p-6 shadow-sm min-h-[400px]">
        <h2 className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-6 border-b border-[#f0f0f0] pb-3">Графическая аналитика / Сбыт</h2>
        <Suspense fallback={<ChartSkeleton />}>
          <DashboardCharts 
            overviewData={summary?.revenueChartData || []}
            categoryData={summary?.categoryData || []}
            totalRevenue={summary?.totalRevenue || 0}
            ringColors={['#5b8def', '#ff9d00', '#10b981', '#f59e0b', '#6366f1']}
          />
        </Suspense>
      </div>
    </div>
  );
}
