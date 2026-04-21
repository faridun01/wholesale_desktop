import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, RotateCcw, AlertCircle } from 'lucide-react';
import { formatMoney } from '../../utils/format';
import client from '../../api/client';
import toast from 'react-hot-toast';

interface ReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: any;
  onSuccess: () => void;
}

export default function ReturnModal({ isOpen, onClose, invoice, onSuccess }: ReturnModalProps) {
  const [returnItems, setReturnItems] = useState<any[]>(
    (invoice?.items || []).map((item: any) => ({
      ...item,
      returnQty: 0,
    }))
  );
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleQtyChange = (itemId: number, qty: number) => {
    setReturnItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const max = item.quantity - (item.returnedQty || 0);
        return { ...item, returnQty: Math.min(max, Math.max(0, qty)) };
      }
      return item;
    }));
  };

  const handleReturn = async () => {
    const itemsToReturn = returnItems.filter(i => i.returnQty > 0).map(i => ({
      invoiceItemId: i.id,
      quantity: i.returnQty
    }));

    if (itemsToReturn.length === 0) {
      toast.error('Выберите товары для возврата');
      return;
    }

    setIsSubmitting(true);
    try {
      await client.post(`/invoices/${invoice.id}/return`, {
        items: itemsToReturn,
        reason
      });
      toast.success('Возврат оформлен');
      onSuccess();
      onClose();
    } catch (e) {
      toast.error('Ошибка при оформлении возврата');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: 20 }}
            className="bg-white border-t-4 border-t-rose-500 shadow-2xl rounded-sm w-full max-w-xl overflow-hidden"
          >
            <div className="bg-slate-50 px-4 py-3 border-b border-border-base flex items-center justify-between">
               <h3 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2">
                  <RotateCcw size={16} className="text-rose-500" /> Оформление возврата по чеку №{invoice.id}
               </h3>
               <button onClick={onClose}><X size={20} /></button>
            </div>
            
            <div className="p-4 space-y-4">
               <div className="bg-rose-50 border border-rose-100 p-3 rounded flex gap-3 text-rose-700">
                  <AlertCircle size={20} className="shrink-0" />
                  <p className="text-[11px] font-bold">
                     Укажите количество товара, которое клиент возвращает. На это количество будет уменьшен долг клиента или увеличена сумма к возврату.
                  </p>
               </div>

               <div className="max-h-60 overflow-auto border border-border-base">
                  <table className="table-1c !text-[11px]">
                     <thead className="sticky top-0 bg-white">
                        <tr>
                           <th>Товар</th>
                           <th className="text-right w-20">Доступно</th>
                           <th className="text-right w-24">Возврат</th>
                        </tr>
                     </thead>
                     <tbody>
                        {returnItems.map(item => (
                           <tr key={item.id}>
                              <td>{item.product_name}</td>
                              <td className="text-right font-bold text-slate-400">{item.quantity - (item.returnedQty || 0)}</td>
                              <td className="text-right">
                                 <input 
                                    type="number" 
                                    value={item.returnQty} 
                                    onChange={e => handleQtyChange(item.id, Number(e.target.value))}
                                    className="w-full bg-rose-50 border-rose-200 border rounded px-2 py-1 text-right font-black outline-none"
                                 />
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>

               <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block">Причина возврата</label>
                  <textarea 
                     value={reason}
                     onChange={e => setReason(e.target.value)}
                     className="field-1c w-full h-20 resize-none pt-2"
                     placeholder="Брак, пересортица, отказ клиента..."
                  />
               </div>

               <button 
                  onClick={handleReturn}
                  disabled={isSubmitting}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black py-4 rounded text-xs uppercase tracking-widest shadow-lg"
               >
                  {isSubmitting ? 'ОФОРМЛЕНИЕ...' : 'ПОДТВЕРДИТЬ ВОЗВРАТ'}
               </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
