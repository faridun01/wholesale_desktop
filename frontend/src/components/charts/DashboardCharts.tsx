import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney, formatPercent } from '../../utils/format';

type OverviewPoint = {
  label: string;
  total: number;
};

type CategoryPoint = {
  name: string;
  value: number;
};

interface DashboardChartsProps {
  overviewData: OverviewPoint[];
  categoryData: CategoryPoint[];
  ringColors: string[];
  totalRevenue: number;
  leftBottomContent?: React.ReactNode;
  onOpenProfitReport?: () => void;
}

export default function DashboardCharts({
  overviewData,
  categoryData,
  ringColors,
  totalRevenue,
  leftBottomContent,
  onOpenProfitReport,
}: DashboardChartsProps) {
  const totalCategoryValue = categoryData.reduce((sum, item) => sum + item.value, 0);
  const topCategory = categoryData[0] || null;

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_360px] xl:items-stretch">
      <div className="space-y-4">
        <div className="rounded-3xl border border-white bg-white p-4 shadow-sm border-l-4 border-l-brand-blue">
          <div className="mt-5 h-[220px] sm:h-[280px] lg:h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={overviewData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashboardArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5b8def" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#5b8def" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 16,
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
                  }}
                  formatter={(value: number) => [formatMoney(value), 'Выручка']}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#5b8def"
                  strokeWidth={3}
                  fill="url(#dashboardArea)"
                  dot={{ r: 0 }}
                  activeDot={{ r: 5, fill: '#5b8def', stroke: '#ffffff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {leftBottomContent}
      </div>

      <div className="flex h-full min-w-0 flex-col rounded-[24px] border border-white bg-white p-4 shadow-sm border-l-4 border-l-brand-orange">
        <div className="flex items-start justify-between gap-3 px-2">
          <div>
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-tighter">Продажи по категориям</h2>
            <p className="mt-1 text-[10px] text-slate-400 font-bold uppercase italic">Анализ товарных групп</p>
            <p className="mt-3 break-words text-2xl font-black leading-none tracking-tighter text-brand-orange">
              {formatMoney(totalRevenue)}
            </p>
          </div>
          {onOpenProfitReport ? (
            <button
              type="button"
              onClick={onOpenProfitReport}
              className="shrink-0 rounded-[4px] border border-brand-orange/20 bg-brand-orange/5 px-3 py-1.5 text-[9px] font-black uppercase text-brand-orange transition-all hover:bg-brand-orange/10"
            >
              ПРИБЫЛЬ
            </button>
          ) : null}
        </div>

        <div className="mt-5 h-[220px] sm:h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={85}
                paddingAngle={4}
                dataKey="value"
                stroke="none"
              >
                {categoryData.map((entry, index) => (
                  <Cell 
                    key={`${entry.name}-${index}`} 
                    fill={ringColors[index % ringColors.length]} 
                    className="hover:opacity-80 transition-opacity cursor-pointer outline-none"
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: '4px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  textTransform: 'uppercase'
                }}
                formatter={(v: number) => [formatMoney(v), '']}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 flex-1 space-y-2 px-2 overflow-auto max-h-[120px] custom-scrollbar">
          {categoryData.map((item, index) => (
            <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-3 text-[11px] hover:bg-slate-50 p-1 rounded transition-colors group">
              <div className="flex min-w-0 items-center gap-2">
                <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: ringColors[index % ringColors.length] }} />
                <span className="truncate font-bold text-slate-600 group-hover:text-slate-900">{item.name}</span>
              </div>
              <span className="font-black text-slate-900 shrink-0">
                {totalCategoryValue > 0 ? formatPercent((item.value / totalCategoryValue) * 100) : formatPercent(0)}
              </span>
            </div>
          ))}
          {!categoryData.length && <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest text-center mt-4 italic">Данные отсутствуют</p>}
        </div>

        <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Категорий</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{categoryData.length}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Лидер</p>
            <p className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-slate-900">
              {topCategory?.name || 'Нет данных'}
            </p>
            {topCategory ? (
              <p className="mt-1 text-xs text-slate-500">
                {totalCategoryValue > 0 ? formatPercent((topCategory.value / totalCategoryValue) * 100) : formatPercent(0)}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
