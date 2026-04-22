import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCount, formatMoney } from '../../utils/format';

type ReportType = 'sales' | 'profit' | 'returns' | 'writeoffs';

type ChartPoint = {
  date: string;
  value: number;
};

type PiePoint = {
  name: string;
  value: number;
};

type ReportMeta = {
  title: string;
  chartTitle: string;
  pieTitle: string;
  accent: string;
};

interface ReportsChartsProps {
  chartData: ChartPoint[];
  pieData: PiePoint[];
  reportType: ReportType;
  currentMeta: ReportMeta;
  pieColors: string[];
  panel: (props: {
    title?: string;
    children: React.ReactNode;
    className?: string;
    headerActions?: React.ReactNode;
  }) => React.ReactNode;
}

function PieTooltip({
  active,
  payload,
  reportType,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; payload?: { name?: string; value?: number } }>;
  reportType: ReportType;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0]?.payload;
  const label = item?.name || payload[0]?.name || 'Без названия';
  const value = Number(item?.value ?? payload[0]?.value ?? 0);

  return (
    <div className="max-w-[min(260px,calc(100vw-32px))] rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
      <p className="break-words text-xs font-medium leading-5 text-slate-700">{label}</p>
      <p className="mt-1 text-sm font-medium tabular-nums text-slate-900">
        {reportType === 'returns' ? formatCount(value) : formatMoney(value)}
      </p>
    </div>
  );
}

export default function ReportsCharts({
  chartData,
  pieData,
  reportType,
  currentMeta,
  pieColors,
  panel,
}: ReportsChartsProps) {
  const Panel = panel;

  return (
    <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_360px]">
      <Panel title={currentMeta.chartTitle}>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={10}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
              <RechartsTooltip
                contentStyle={{
                  borderRadius: 16,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
                }}
                formatter={(value: number) => [
                  reportType === 'returns' ? formatCount(value) : formatMoney(value),
                  currentMeta.title,
                ]}
              />
              <Bar dataKey="value" fill={currentMeta.accent} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title={currentMeta.pieTitle}>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={78} paddingAngle={4} dataKey="value">
                {pieData.map((item, index) => (
                  <Cell key={`${item.name}-${index}`} fill={pieColors[index % pieColors.length]} />
                ))}
              </Pie>
              <RechartsTooltip content={<PieTooltip reportType={reportType} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-3">
          {pieData.map((item, index) => (
            <div key={item.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: pieColors[index % pieColors.length] }} />
                <span className="truncate text-[13px] leading-5 text-slate-600">{item.name}</span>
              </div>
              <span className="whitespace-nowrap text-right font-medium tabular-nums text-slate-900">
                {reportType === 'returns' ? formatCount(item.value) : formatMoney(item.value)}
              </span>
            </div>
          ))}

          {!pieData.length && <div className="py-8 text-center text-sm text-slate-400">Нет данных для отображения</div>}
        </div>
      </Panel>
    </section>
  );
}
