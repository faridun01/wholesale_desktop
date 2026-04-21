import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { clsx } from 'clsx';
import { Layers, Trash2, X, Info } from 'lucide-react';
import { formatMoney } from '../../utils/format';
import { formatProductName } from '../../utils/productName';

interface ProductBatchesModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProduct: any;
  productBatches: any[];
  canManage?: boolean;
  onDeleteBatch?: (batchId: number) => void;
}

const getQuantityDisplay = (qty: number, product: any) => {
  return \\ \\;
};

export default function ProductBatchesModal({
  isOpen,
  onClose,
  selectedProduct,
  productBatches,
  canManage = false,
  onDeleteBatch,
}: ProductBatchesModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="flex flex-col w-full max-w-4xl max-h-[85vh] bg-white border-2 border-brand-orange shadow-2xl rounded-[4px] overflow-hidden"
          >
            {/* Header 1C Style */}
            <div className="bg-brand-yellow px-4 py-2.5 flex items-center justify-between border-b border-black/10 shrink-0">
               <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-1.5 rounded-[4px]">
                     <Layers size={18} className="text-slate-800" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-tight text-slate-800">
                     Реестр партий (FIFO): <span className="text-slate-900 border-b-2 border-brand-orange">{formatProductName(selectedProduct.name)}</span>
                  </h3>
               </div>
               <button onClick={onClose} className="hover:bg-black/5 p-1 rounded-sm transition-colors text-slate-700">
                 <X size={20} />
               </button>
            </div>

            {/* Info Note 1C */}
            <div className="bg-amber-50 border-b border-amber-100 p-2.5 px-4 flex items-center gap-3 shrink-0">
               <Info size={14} className="text-amber-600 shrink-0" />
               <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wide">
                  Списание товаров производится по методу FIFO (самые старые партии в первую очередь).
               </p>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-auto bg-[#e6e8eb]">
               <table className="table-1c border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50">
                       <th className="w-12 text-center">№</th>
                       <th className="w-36">Дата прихода</th>
                       <th className="w-40">Склад</th>
                       <th className="text-right">Нач. кол-во</th>
                       <th className="text-right">Текущий остаток</th>
                       <th className="text-right w-36">Себестоимость</th>
                       {canManage && <th className="w-24 text-center">Действие</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {productBatches.length > 0 ? productBatches.map((b, i) => (
                      <tr key={b.id} className={clsx("hover:bg-brand-yellow/5", i === 0 && "bg-brand-yellow/10")}>
                        <td className="text-center font-mono text-[10px] text-slate-400">{i + 1}</td>
                        <td className="font-bold text-slate-700 italic">
                           {new Date(b.createdAt).toLocaleDateString('ru-RU')}
                           {i === 0 && (
                            <span className="ml-2 px-1.5 py-0.5 bg-brand-orange text-white text-[8px] font-black uppercase rounded-[2px] animate-pulse">Очер. списания</span>
                           )}
                        </td>
                        <td className="font-bold text-slate-600">{b.warehouse?.name || '---'}</td>
                        <td className="text-right text-slate-500 font-bold">
                           {getQuantityDisplay(b.quantity, selectedProduct)}
                        </td>
                        <td className="text-right font-black text-slate-900 bg-black/5">
                           {getQuantityDisplay(b.remainingQuantity, selectedProduct)}
                        </td>
                        <td className="text-right font-black text-emerald-700">
                           {formatMoney(b.costPrice)}
                        </td>
                        {canManage && (
                          <td className="text-center">
                             <button 
                               onClick={() => onDeleteBatch?.(b.id)} 
                               disabled={!b.canDelete}
                               className="btn-1c !py-0.5 !px-2 text-rose-600 border-rose-100 hover:bg-rose-50 disabled:opacity-30"
                             >
                                <Trash2 size={12} />
                             </button>
                          </td>
                        )}
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={canManage ? 7 : 6} className="py-20 text-center bg-white">
                           <div className="flex flex-col items-center gap-2 text-slate-300">
                             <Layers size={48} strokeWidth={1} />
                             <span className="text-[10px] font-black uppercase tracking-widest">Партии отсутствуют</span>
                           </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
               </table>
            </div>

            {/* Footer 1C Style */}
            <div className="bg-[#fcfcfc] border-t border-border-base p-3 px-5 flex items-center justify-between shrink-0">
               <div className="flex flex-col">
                  <span className="text-[9px] font-black uppercase text-slate-400">Всего партий: {productBatches.length}</span>
                  <span className="text-[11px] font-black text-slate-700">Общий остаток: {getQuantityDisplay(productBatches.reduce((acc, b) => acc + b.remainingQuantity, 0), selectedProduct)}</span>
               </div>
               <button onClick={onClose} className="btn-1c !px-8 font-black uppercase">Завершить просмотр</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
