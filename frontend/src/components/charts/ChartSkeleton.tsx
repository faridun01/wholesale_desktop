import React from 'react';

interface ChartSkeletonProps {
  variant?: 'area' | 'pie' | 'bar';
  heightClassName?: string;
}

export default function ChartSkeleton({
  variant = 'area',
  heightClassName = 'h-[312px]',
}: ChartSkeletonProps) {
  return (
    <div className={`${heightClassName} overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm`}>
      <div className="animate-pulse">
        <div className="h-4 w-28 rounded-full bg-slate-200" />
        <div className="mt-3 h-3 w-40 rounded-full bg-slate-100" />
        <div className="mt-8 h-[220px] rounded-[28px] bg-gradient-to-b from-slate-50 to-white p-4">
          {variant === 'pie' ? (
            <div className="flex h-full items-center justify-center">
              <div className="relative h-36 w-36 rounded-full bg-slate-100">
                <div className="absolute inset-[24px] rounded-full bg-white" />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-end gap-3">
              {(variant === 'bar'
                ? ['h-16', 'h-28', 'h-20', 'h-36', 'h-24', 'h-32']
                : ['h-14', 'h-20', 'h-24', 'h-16', 'h-32', 'h-28']).map((height, index) => (
                <div key={index} className="flex-1">
                  <div className={`${height} rounded-t-2xl bg-slate-200/80`} />
                </div>
              ))}
            </div>
          )}
        </div>
        {variant === 'pie' && (
          <div className="mt-5 space-y-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-slate-200" />
                  <div className="h-3 w-24 rounded-full bg-slate-100" />
                </div>
                <div className="h-3 w-10 rounded-full bg-slate-100" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
