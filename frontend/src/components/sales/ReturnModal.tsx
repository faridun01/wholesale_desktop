import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, RotateCcw, AlertCircle, Package, Calculator, CheckCircle2 } from 'lucide-react';
import { formatMoney, roundMoney } from '../../utils/format';
import { formatProductName } from '../../utils/productName';
import client from '../../api/client';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

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
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');

  const handleQtyChange = (itemId: number, qty: number) => {
    setReturnItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const max = Number(item.quantity || 0) - Number(item.returnedQty || 0);
        return { ...item, returnQty: Math.min(max, Math.max(0, qty)) };
      }
      return item;
    }));
  };

  const totals = useMemo(() => {
    let totalValue = 0;
    const globalDiscount = Number(invoice?.discount || 0);
    
    returnItems.forEach(item => {
      if (item.returnQty > 0) {
        // Price after item-level discount
        const itemDiscount = Number(item.discount || 0);
        const discountedPrice = Number(item.sellingPrice) * (1 - itemDiscount / 100);
        // Price after global invoice discount
        const finalPrice = discountedPrice * (1 - globalDiscount / 100);
        totalValue += finalPrice * item.returnQty;
      }
    });

    return {
      totalValue: roundMoney(totalValue),
      count: returnItems.filter(i => i.returnQty > 0).length
    };
  }, [returnItems, invoice]);

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
        reason: reason || 'Возврат по просьбе клиента'
      });
      toast.success('Возврат успешно оформлен');
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Ошибка при оформлении возврата');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 overflow-hidden">
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-900/70 backdrop-blur-md"
          onClick={onClose}
        />
        <motion.div 
          initial={{ scale: 0.95, y: 20, opacity: 0 }} 
          animate={{ scale: 1, y: 0, opacity: 1 }} 
          exit={{ scale: 0.95, y: 20, opacity: 0 }}
          className="relative bg-white w-full max-w-3xl rounded-[4px] shadow-2xl flex flex-col max-h-[85vh] border-t-4 border-t-rose-600"
        >
          {/* Header */}
          <div className="bg-slate-50 px-5 py-4 border-b border-border-base flex items-center justify-between">
             <div className="flex items-center gap-3">
                <div className="bg-rose-100 p-2 rounded text-rose-600">
                   <RotateCcw size={20} />
                </div>
                <div>
                   <h3 className="text-sm font-black uppercase text-slate-800">Оформление возврата: Накладная №{invoice.id}</h3>
                   <p className="text-[9px] font-black uppercase text-slate-400 italic">Склад: {invoice.warehouse?.name || '---'}</p>
                </div>
             </div>
             <button onClick={onClose} className="text-slate-300 hover:text-slate-600 transition-colors"><X size={24} /></button>
          </div>
          
          <div className="flex-1 flex flex-col overflow-hidden">
             {step === 'edit' ? (
                <>
                  <div className="p-6 space-y-4 flex-1 overflow-auto">
                     <div className="bg-rose-50 border border-rose-100 p-4 rounded-sm flex gap-4">
                        <AlertCircle size={24} className="text-rose-500 shrink-0" />
                        <div className="space-y-1">
                           <p className="text-[11px] font-black uppercase text-rose-700">Внимание: Складская операция</p>
                           <p className="text-[11px] font-bold text-rose-600/80 leading-relaxed">
                              Укажите фактическое количество возвращаемого товара. Остатки будут автоматически возвращены в соответствующие партии товара на складе. Сумма долга клиента будет уменьшена на итоговую стоимость возврата.
                           </p>
                        </div>
                     </div>

                     <div className="border border-border-base rounded-sm overflow-hidden bg-white shadow-sm">
                        <table className="table-1c !text-[11px]">
                           <thead className="sticky top-0 bg-slate-50 z-10">
                              <tr>
                                 <th>Наименование товара</th>
                                 <th className="text-right w-24">Продано</th>
                                 <th className="text-right w-24">Возвращено</th>
                                 <th className="text-right w-32 bg-rose-50/50">Кол-во возврата</th>
                                 <th className="w-16">Ед.</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100">
                              {returnItems.map(item => {
                                 const available = Number(item.quantity || 0) - Number(item.returnedQty || 0);
                                 return (
                                   <tr key={item.id} className={clsx(available <= 0 && "opacity-40 grayscale")}>
                                      <td className="font-bold text-slate-800">{formatProductName(item.product_name)}</td>
                                      <td className="text-right font-black text-slate-400">{item.quantity}</td>
                                      <td className="text-right font-black text-rose-400">{item.returnedQty || 0}</td>
                                      <td className="p-0 bg-rose-50/20">
                                         <input 
                                            type="number" 
                                            value={item.returnQty || ''} 
                                            onChange={e => handleQtyChange(item.id, Number(e.target.value))}
                                            placeholder="0"
                                            disabled={available <= 0}
                                            className="w-full h-10 bg-transparent text-right font-black text-rose-600 outline-none px-4 focus:bg-white focus:ring-1 focus:ring-rose-500/20"
                                         />
                                      </td>
                                      <td className="text-center text-[10px] font-black text-slate-400 uppercase tracking-tighter">{item.unit || 'шт'}</td>
                                   </tr>
                                 );
                              })}
                           </tbody>
                        </table>
                     </div>

                     <div>
                        <div className="flex items-center justify-between mb-2">
                           <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Причина оформления (комментарий)</label>
                           <span className="text-[8px] font-bold text-slate-300 uppercase">Необязательно</span>
                        </div>
                        <textarea 
                           value={reason}
                           onChange={e => setReason(e.target.value)}
                           className="field-1c w-full h-24 resize-none pt-3 text-[12px] font-bold"
                           placeholder="Например: Брак упаковки, пересортица, отказ клиента после вскрытия..."
                        />
                     </div>
                  </div>

                  <div className="bg-[#f8f9fb] border-t border-border-base p-6 flex items-center justify-between">
                     <div className="flex gap-8">
                        <div>
                           <p className="text-[9px] font-black uppercase text-slate-400 tracking-tighter mb-1">Товаров к возврату</p>
                           <p className="text-xl font-black text-slate-800">{totals.count} поз.</p>
                        </div>
                        <div>
                           <p className="text-[9px] font-black uppercase text-slate-400 tracking-tighter mb-1">Сумма к возмещению</p>
                           <p className="text-2xl font-black text-rose-600">{formatMoney(totals.totalValue)}</p>
                        </div>
                     </div>
                     <button 
                        onClick={() => totals.count > 0 && setStep('confirm')}
                        disabled={totals.count === 0}
                        className="bg-rose-600 hover:bg-rose-700 disabled:opacity-30 disabled:grayscale text-white font-black px-10 py-4 rounded shadow-xl uppercase tracking-widest text-xs flex items-center gap-3 transition-all active:scale-95"
                     >
                        ПРОДОЛЖИТЬ <ArrowRight size={18} />
                     </button>
                  </div>
                </>
             ) : (
                <div className="p-10 flex flex-col items-center text-center space-y-6">
                   <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center text-rose-600 mb-2">
                      <Calculator size={40} />
                   </div>
                   <div className="space-y-2">
                      <h4 className="text-xl font-black text-slate-800 uppercase">Подтверждение операции</h4>
                      <p className="text-sm text-slate-500 font-bold max-w-sm mx-auto">
                         Вы оформляете возврат на сумму <span className="text-rose-600 font-black">{formatMoney(totals.totalValue)}</span>. 
                         Это действие изменит баланс клиента и остатки на складе.
                      </p>
                   </div>
                   
                   <div className="w-full max-w-xs space-y-3">
                      <button 
                         onClick={handleReturn}
                         disabled={isSubmitting}
                         className="w-full bg-slate-900 border-b-4 border-slate-700 hover:bg-slate-800 text-white font-black py-4 rounded uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                      >
                         {isSubmitting ? 'ВЫПОЛНЕНИЕ...' : <>ПОДТВЕРДИТЬ И ПРОВЕСТИ <CheckCircle2 size={18} /></>}
                      </button>
                      <button onClick={() => setStep('edit')} className="w-full text-slate-400 font-bold hover:text-slate-600 uppercase text-[10px] tracking-widest">
                         Вернуться и изменить
                      </button>
                   </div>
                </div>
             )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

const ArrowRight = ({ size, className }: any) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);
