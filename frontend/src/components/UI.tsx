import React from 'react';
import { clsx } from 'clsx';

export const Card = ({ title, children, className, headerActions }: { title?: string, children: React.ReactNode, className?: string, headerActions?: React.ReactNode }) => (
  <div className={clsx("bg-white rounded-[18px] border border-[#e1e3e5] shadow-[0_1px_0_rgba(22,29,37,0.04),0_8px_24px_rgba(22,29,37,0.04)] overflow-hidden", className)}>
    {title && (
      <div className="px-5 py-4 border-b border-[#e1e3e5] bg-[#f6f6f7] flex justify-between items-center">
        <h3 className="text-lg font-semibold text-[#202223] tracking-tight">{title}</h3>
        {headerActions}
      </div>
    )}
    <div className="p-5">
      {children}
    </div>
  </div>
);

export const Badge = ({ children, variant = 'default' }: { children: React.ReactNode, variant?: 'default' | 'success' | 'warning' | 'danger' }) => {
  const variants = {
    default: 'bg-[#f1f2f3] text-[#3f4246]',
    success: 'bg-[#e3f1df] text-[#0f5132]',
    warning: 'bg-[#fff5d6] text-[#8a6116]',
    danger: 'bg-[#fde7e9] text-[#8e1f0b]',
  };
  return (
    <span className={clsx("px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.14em]", variants[variant])}>
      {children}
    </span>
  );
};
