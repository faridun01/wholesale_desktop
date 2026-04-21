import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { clsx } from 'clsx';
import { History, RotateCcw, Scissors, X, Filter } from 'lucide-react';
import { formatProductName } from '../../utils/productName';
import { formatMoney } from '../../utils/format';

interface ProductHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName?: string | null;
  product?: any;
  productHistory: any[];
  onReverseIncoming?: (transactionId: number) => void | Promise<void>;
  onReverseCorrectionWriteOff?: (transactionId: number) => void | Promise<void>;
  onReturnWriteOff?: (transaction: any) => void | Promise<void>;
  onDeleteWriteOffPermanently?: (transaction: any) => void | Promise<void>;
  onWriteOff?: () => void | Promise<void>;
}

const getTypeLabel = (type: string) => {
  if (type === 'incoming') return 'Приход';
  if (type === 'outgoing') return 'Расход';
  if (type === 'price_change' || type === 'adjustment') return 'Коррект.';
  return 'Перенос';
};

const getTypeClassName = (type: string) =>
  clsx(
    'px-2 py-0.5 text-[9px] font-black uppercase border rounded-[2px]',
    type === 'incoming'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : type === 'outgoing'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-slate-200 bg-slate-100 text-slate-600'
  );

const getQuantityBreakdown = (quantityValue: unknown, product: any) => {
  const qty = Number(quantityValue || 0);
  const sign = qty > 0 ? '+' : '';
  return `${sign}${qty} ${product?.unit || 'шт'}`;
};

export default function ProductHistoryModal({
  isOpen,
  onClose,
  productName,
  product,
  productHistory,
  onReverseIncoming,
  onReverseCorrectionWriteOff,
  onReturnWriteOff,
  onDeleteWriteOffPermanently,
  onWriteOff,
}: ProductHistoryModalProps) {
  const [historyFilter, setHistoryFilter] = useState<'all' | 'incoming' | 'writeoff' | 'returns'>('all');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'incoming') return productHistory.filter(i => i.type === 'incoming');
    if (historyFilter === 'writeoff') return productHistory.filter(i => i.writeOffStatus === 'writeoff' || i.writeOffStatus?.includes('return'));
    if (historyFilter === 'returns') return productHistory.filter(i => i.writeOffStatus === 'return_record');
    return productHistory;
  }, [historyFilter, productHistory]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="flex flex-col w-full max-w-5xl max-h-[90vh] bg-white border-2 border-brand-orange shadow-2xl rounded-[4px] overflow-hidden"
          >
            {/* Header 1C Style */}
            <div className="bg-brand-yellow px-4 py-2.5 flex items-center justify-between border-b border-black/10 shrink-0">
               <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-1.5 rounded-[4px]">
                     <History size={18} className="text-slate-800" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-tight text-slate-800">
                     Карточка движения: <span className="text-slate-900 border-b-2 border-brand-orange">{formatProductName(productName)}</span>
                  </h3>
               </div>
               <div className="flex items-center gap-2">
                 {onWriteOff && (
                   <button onClick={() => void onWriteOff()} className="btn-1c flex items-center gap-1.5 shadow-sm">
                     <Scissors size={14} /> Списать остаток
                   </button>
                 )}
                 <div className="w-[1px] h-6 bg-black/10 mx-1"></div>
                 <button onClick={onClose} className="hover:bg-black/5 p-1 rounded-sm transition-colors text-slate-700">
                   <X size={20} />
                 </button>
               </div>
            </div>

            {/* Sub-header Filter 1C */}
            <div className="bg-[#f2f3f7] border-b border-border-base p-2 flex items-center gap-3 shrink-0 overflow-x-auto">
               <div className="flex items-center gap-1 capitalize">
                  <Filter size={12} className="text-slate-400 ml-2" />
                  <span className="text-[10px] font-black uppercase text-slate-400 mr-2">Режим:</span>
                  {[
                    { key: 'all', label: 'Все движения' },
                    { key: 'incoming', label: 'Только приход' },
                    { key: 'writeoff', label: 'Списания' },
                    { key: 'returns', label: 'Возвраты' },
                  ].map(item => (
                    <button
                      key={item.key}
                      onClick={() => setHistoryFilter(item.key as any)}
                      className={clsx(
                        "px-3 py-1 text-[10px] font-black uppercase rounded-[2px] border transition-all",
                        historyFilter === item.key 
                          ? "bg-white border-brand-orange text-slate-800 shadow-sm"
                          : "border-transparent text-slate-500 hover:bg-white/50"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
               </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-auto bg-[#e6e8eb]">
               <table className="table-1c border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50">
                       <th className="w-12 text-center">№</th>
                       <th className="w-40">Дата / Время</th>
                       <th className="w-32 text-center">Тип</th>
                       <th className="w-32 text-right">Количество</th>
                       <th className="w-40">Склад / Точка</th>
                       <th>Основание / Комментарий</th>
                       <th className="w-36 text-center">Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.length > 0 ? filteredHistory.map((t, i) => (
                      <tr key={i} className="hover:bg-brand-yellow/5">
                        <td className="text-center font-mono text-[10px] text-slate-400">{i + 1}</td>
                        <td className="font-bold text-slate-600 italic">{new Date(t.createdAt).toLocaleString('ru-RU')}</td>
                        <td className="text-center">
                           <span className={getTypeClassName(t.type)}>{getTypeLabel(t.type)}</span>
                        </td>
                        <td className={clsx("text-right font-black", (t.qtyChange || 0) > 0 ? "text-emerald-700" : "text-rose-700")}>
                           {getQuantityBreakdown(t.qtyChange, product)}
                        </td>
                        <td className="text-slate-600 font-bold">{t.warehouseName || t.warehouse?.name || '---'}</td>
                        <td className="text-xs text-slate-500 italic">
                           {t.reason || '---'}
                           {Number(t.returnedQty || 0) > 0 && (
                             <span className="ml-2 text-[10px] font-black uppercase text-emerald-600">[Возврат: {t.returnedQty}]</span>
                           )}
                        </td>
                        <td className="text-center">
                           {t.canReverseIncoming && onReverseIncoming && (
                             <button onClick={() => onReverseIncoming(t.transactionId)} className="btn-1c !py-0.5 !px-2 text-rose-600 border-rose-100 hover:bg-rose-50 flex items-center gap-1 mx-auto">
                                <RotateCcw size={10} /> Отмена
                             </button>
                           )}
                           {t.canReturnWriteOff && onReturnWriteOff && (
                             <button onClick={() => onReturnWriteOff(t)} className="btn-1c !py-0.5 !px-2 text-emerald-600 border-emerald-100 hover:bg-emerald-50 flex items-center gap-1 mx-auto">
                                <RotateCcw size={10} /> Вернуть
                             </button>
                           )}
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={7} className="py-20 text-center bg-white">
                           <div className="flex flex-col items-center gap-2 text-slate-300">
                             <History size={48} strokeWidth={1} />
                             <span className="text-[10px] font-black uppercase tracking-widest">Нет данных за выбранный период</span>
                           </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
               </table>
            </div>

            {/* Footer 1C Style */}
            <div className="bg-[#fcfcfc] border-t border-border-base p-3 px-5 flex items-center justify-between shrink-0">
               <div className="flex items-center gap-4">
                  <span className="text-[10px] font-black uppercase text-slate-400">Итого операций: {filteredHistory.length}</span>
               </div>
               <button onClick={onClose} className="btn-1c !px-8 font-black uppercase">Закрыть форму</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
