import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, RotateCcw, AlertCircle, CheckCircle2, Scissors } from 'lucide-react';
import { formatMoney } from '../../utils/format';
import { formatProductName } from '../../utils/productName';
import client from '../../api/client';
import toast from 'react-hot-toast';

interface WriteOffReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: any;
  onSuccess: () => void;
}

export default function WriteOffReturnModal({ isOpen, onClose, transaction, onSuccess }: WriteOffReturnModalProps) {
  const [quantity, setQuantity] = useState<string>('0');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const maxReturn = transaction ? Math.abs(transaction.quantity || transaction.qtyChange || 0) - (transaction.returned_qty || 0) : 0;

  const handleReturn = async () => {
    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0 || qty > maxReturn + 0.001) {
      toast.error(`Введите корректное количество (макс. ${maxReturn})`);
      return;
    }

    setIsSubmitting(true);
    try {
      await client.post(`/products/history/${transaction.transaction_id || transaction.id}/reverse-writeoff`, {
        quantity: qty,
        reason: reason || 'Отмена/возврат списания'
      });
      toast.success('Товар возвращен на баланс');
      window.dispatchEvent(new CustomEvent('refresh-data'));
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Ошибка при возврате товара');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !transaction) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
          className="relative bg-white w-full max-w-md rounded-sm shadow-2xl border-t-4 border-t-brand-orange overflow-hidden"
        >
          <div className="bg-slate-50 px-5 py-3 border-b border-border-base flex items-center justify-between">
             <h3 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2">
                <RotateCcw size={16} className="text-brand-orange" /> Возврат списанного товара
             </h3>
             <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={20} /></button>
          </div>

          <div className="p-5 space-y-5">
             <div className="bg-slate-50 p-3 rounded border border-slate-200">
                <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Товар</div>
                <div className="text-sm font-black text-slate-800">{formatProductName(transaction.product_name || transaction.product?.name)}</div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                   <div className="text-[9px] font-black uppercase text-slate-400">Списано: <span className="text-rose-600">{Math.abs(transaction.quantity || transaction.qtyChange)}</span></div>
                   <div className="text-[9px] font-black uppercase text-slate-400">Уже возвращено: <span className="text-emerald-600">{transaction.returned_qty || 0}</span></div>
                </div>
             </div>

             <div className="space-y-4">
                <div>
                   <label className="text-[10px] font-black uppercase text-slate-400 mb-1.5 block">Количество к возврату (макс. {maxReturn})</label>
                   <div className="relative">
                      <input 
                        type="number" 
                        value={quantity}
                        onChange={e => setQuantity(e.target.value)}
                        className="field-1c w-full !text-2xl font-black text-brand-orange text-center py-3"
                        autoFocus
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 font-black uppercase text-[10px]">{transaction.unit || 'шт'}</span>
                   </div>
                </div>

                <div>
                   <label className="text-[10px] font-black uppercase text-slate-400 mb-1.5 block">Причина возврата</label>
                   <textarea 
                     value={reason}
                     onChange={e => setReason(e.target.value)}
                     className="field-1c w-full h-20 resize-none pt-2 text-[11px] font-bold"
                     placeholder="Ошибочное списание, товар найден..."
                   />
                </div>
             </div>

             <div className="pt-2">
                <button 
                  onClick={handleReturn}
                  disabled={isSubmitting || Number(quantity) <= 0}
                  className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-white font-black py-4 rounded text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                   {isSubmitting ? 'ОБРАБОТКА...' : <>ВЕРНУТЬ НА СКЛАД <CheckCircle2 size={18} /></>}
                </button>
             </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
