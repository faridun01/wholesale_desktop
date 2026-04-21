import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Boxes,
  ChevronRight,
  Clock3,
  Package,
  Store,
  Search,
  Users,
  Wallet,
  ArrowRight,
  LayoutDashboard,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  ShoppingBag,
  History as HistoryIcon
} from 'lucide-react';
import { getDashboardSummary } from '../api/dashboard.api';
import { getWarehouses } from '../api/warehouses.api';
import { formatCount, formatMoney, formatPercent } from '../utils/format';
import { filterWarehousesForUser, getCurrentUser, getUserWarehouseId, isAdminUser } from '../utils/userAccess';
import client from '../api/client';
import ChartSkeleton from '../components/charts/ChartSkeleton';

const DashboardCharts = React.lazy(() => import('../components/charts/DashboardCharts'));

const DashboardMetric = ({ title, value, delta, deltaValue, icon: Icon, colorClass, subtitle }: any) => (
  <div className="bg-white border border-[#dcdcdc] rounded-[4px] p-4 relative overflow-hidden group hover:shadow-md transition-shadow">
    <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#ffcc33]/20 group-hover:bg-[#ffcc33]"></div>
    <div className="flex items-start justify-between">
      <div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">{title}</p>
        <h3 className="text-2xl font-black text-slate-800 tracking-tight">{value}</h3>
        <p className="text-[10px] text-slate-400 mt-1 font-medium italic">{subtitle}</p>
      </div>
      <div className={`p-3 rounded-lg ${colorClass}`}>
        <Icon size={20} />
      </div>
    </div>
    <div className="mt-4 flex items-center gap-2">
      <span className={`text-xs font-bold flex items-center gap-0.5 ${deltaValue < 0 ? 'text-red-500' : 'text-green-600'}`}>
        {deltaValue < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
        {delta}
      </span>
      <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">vs прошлый период</span>
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

  useEffect(() => {
    setIsLoaded(false);
    getDashboardSummary(selectedWarehouseId ? Number(selectedWarehouseId) : null)
      .then(setSummary)
      .finally(() => setIsLoaded(true));
  }, [selectedWarehouseId]);

  useEffect(() => {
    getWarehouses().then(data => {
      setWarehouses(filterWarehousesForUser(Array.isArray(data) ? data : [], user));
    });
  }, [user]);

  const metrics = [
    {
      title: 'Выручка',
      value: formatMoney(summary?.totalRevenue || 0),
      subtitle: 'За текущий месяц',
      deltaValue: Number(summary?.metricChanges?.revenue || 0),
      delta: (Number(summary?.metricChanges?.revenue || 0) > 0 ? '+' : '') + formatPercent(summary?.metricChanges?.revenue || 0),
      colorClass: 'bg-yellow-50 text-yellow-600',
      icon: Wallet,
    },
    {
      title: 'Всего заказов',
      value: formatCount(summary?.totalOrders || 0),
      subtitle: 'Продажи через базу',
      deltaValue: Number(summary?.metricChanges?.orders || 0),
      delta: (Number(summary?.metricChanges?.orders || 0) > 0 ? '+' : '') + formatPercent(summary?.metricChanges?.orders || 0),
      colorClass: 'bg-blue-50 text-blue-600',
      icon: ShoppingBag,
    },
    {
      title: 'База клиентов',
      value: formatCount(summary?.totalCustomers || 0),
      subtitle: 'Зарегистрированные контрагенты',
      deltaValue: Number(summary?.metricChanges?.customers || 0),
      delta: (Number(summary?.metricChanges?.customers || 0) > 0 ? '+' : '') + formatPercent(summary?.metricChanges?.customers || 0),
      colorClass: 'bg-emerald-50 text-emerald-600',
      icon: Users,
    },
    {
      title: 'Номенклатура',
      value: formatCount(summary?.totalProducts || 0),
      subtitle: 'Уникальных позиций',
      deltaValue: Number(summary?.metricChanges?.products || 0),
      delta: (Number(summary?.metricChanges?.products || 0) > 0 ? '+' : '') + formatPercent(summary?.metricChanges?.products || 0),
      colorClass: 'bg-orange-50 text-orange-600',
      icon: Boxes,
    },
  ];

  const recentSales = summary?.recentSales?.slice(0, 8) || [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-[#dcdcdc] pb-6">
        <div>
          <div className="flex items-center gap-2 text-[#ff9900] mb-2">
            <LayoutDashboard size={18} />
            <span className="text-[11px] font-black uppercase tracking-[0.2em]">Рабочий стол</span>
          </div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Дашборд <span className="font-light text-slate-400">| Текущее состояние</span></h1>
        </div>
        <div className="flex items-center gap-3 bg-white p-1.5 rounded-lg border border-[#dcdcdc] shadow-sm">
           <Store size={16} className="text-slate-400 ml-2" />
           <select
             value={selectedWarehouseId}
             onChange={(e) => setSelectedWarehouseId(e.target.value)}
             className="bg-transparent text-sm font-bold text-slate-700 outline-none pr-4 min-w-[160px]"
           >
             {isAdmin && <option value="">По всем складам</option>}
             {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
           </select>
        </div>
      </div>

      {/* Primary Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m, i) => <DashboardMetric key={i} {...m} />)}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Transactions Panel */}
        <div className="lg:col-span-2 bg-white border border-[#dcdcdc] rounded-[4px] shadow-sm overflow-hidden flex flex-col">
          <div className="bg-[#fcfcfc] border-b border-[#dcdcdc] px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
               <HistoryIcon size={18} className="text-slate-400" />
               <h2 className="text-[13px] font-black text-slate-700 uppercase tracking-wider">Журнал последних продаж</h2>
            </div>
            <button onClick={() => navigate('/sales')} className="text-[11px] font-bold text-[#ff9900] hover:underline flex items-center gap-1">
               Открыть весь список <ArrowRight size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-auto">
             <table className="w-full text-left">
                <thead className="bg-[#f9fafb] text-[10px] font-black text-slate-400 uppercase tracking-widest">
                   <tr>
                      <th className="px-5 py-3 border-b border-[#f0f0f0]">ID/Номер</th>
                      <th className="px-5 py-3 border-b border-[#f0f0f0]">Клиент</th>
                      <th className="px-5 py-3 border-b border-[#f0f0f0]">Сумма</th>
                      <th className="px-5 py-3 border-b border-[#f0f0f0] text-center">Статус</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f0f0]">
                   {recentSales.map((sale: any) => (
                      <tr key={sale.id} className="hover:bg-slate-50/50 transition-colors">
                         <td className="px-5 py-3.5 text-xs font-bold text-slate-900 tracking-tight">#{sale.id}</td>
                         <td className="px-5 py-3.5 text-xs text-slate-600 font-medium">{sale.customer?.name || 'Розничный покупатель'}</td>
                         <td className="px-5 py-3.5 text-xs font-extrabold text-slate-800">{formatMoney(sale.netAmount)}</td>
                         <td className="px-5 py-3.5 text-center">
                            <span className={`inline-block px-2 py-1 rounded text-[9px] font-black uppercase ${
                               sale.status === 'paid' ? 'bg-green-100 text-green-700' : 
                               sale.status === 'partial' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                            }`}>
                               {sale.status === 'paid' ? 'Оплачено' : sale.status === 'partial' ? 'Частично' : 'Долг'}
                            </span>
                         </td>
                      </tr>
                   ))}
                   {!recentSales.length && (
                      <tr>
                         <td colSpan={4} className="px-5 py-20 text-center text-slate-400 text-sm font-medium italic">
                            Продажи за выбранный период не найдены
                         </td>
                      </tr>
                   )}
                </tbody>
             </table>
          </div>
        </div>

        {/* Inventory Summary Panel */}
        <div className="space-y-6">
           <div className="bg-white border border-[#dcdcdc] rounded-[4px] p-5 shadow-sm">
              <h2 className="text-[12px] font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                 <Package size={16} className="text-orange-500" /> Состояние склада
              </h2>
              <div className="space-y-4">
                 <div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-1.5 uppercase">
                       <span>Оценка склада (в закупе)</span>
                       <span className="text-slate-900">{formatMoney(summary?.inventoryValue || 0)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                       <div className="h-full bg-blue-500 w-[70%]"></div>
                    </div>
                 </div>
                 <div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-1.5 uppercase">
                       <span>Дебиторская задолженность</span>
                       <span className="text-red-600">{formatMoney(summary?.totalDebts || 0)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                       <div className="h-full bg-red-400 w-[45%]"></div>
                    </div>
                 </div>
              </div>
              <div className="mt-8 pt-5 border-t border-[#f0f0f0]">
                 <p className="text-[10px] font-black tracking-widest text-[#ff9900] uppercase mb-3">Короткие ссылки</p>
                 <div className="space-y-2">
                    <button onClick={() => navigate('/products?sort=low-stock')} className="w-full flex items-center justify-between p-3 rounded bg-slate-50 hover:bg-yellow-50 text-xs font-bold text-slate-700 transition-colors">
                       Критический остаток <ChevronRight size={14} className="text-slate-400" />
                    </button>
                    <button onClick={() => navigate('/customers/debts')} className="w-full flex items-center justify-between p-3 rounded bg-slate-50 hover:bg-yellow-50 text-xs font-bold text-slate-700 transition-colors">
                       Список должников <ChevronRight size={14} className="text-slate-400" />
                    </button>
                 </div>
              </div>
           </div>

           <div className="bg-[#1e293b] rounded-[4px] p-6 text-white relative overflow-hidden">
              <div className="absolute -right-6 -bottom-6 opacity-10 rotate-12">
                 <ShoppingCart size={120} />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[2px] opacity-60 mb-2">Быстрые действия</p>
              <h3 className="text-xl font-black mb-4">Открыть кассу (POS)</h3>
              <p className="text-xs opacity-70 mb-6 leading-relaxed">Быстрое оформление чеков и учет розничных продаж в один клик.</p>
              <button 
                onClick={() => navigate('/pos')}
                className="w-full py-3 bg-[#ffcc33] text-[#854d0e] font-black rounded text-sm hover:bg-[#ffd659] transition-all shadow-lg shadow-black/20"
              >
                 ПЕРЕЙТИ В ТЕРМИНАЛ
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}
