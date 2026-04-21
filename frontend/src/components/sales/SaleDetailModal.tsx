import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Receipt, Package, Banknote, Calendar, UserCircle } from 'lucide-react';
import { getInvoiceDetails } from '../../api/invoices.api';
import { formatMoney } from '../../utils/format';
import { Loader2 } from 'lucide-react';

interface SaleDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleId: number | null;
}

export default function SaleDetailModal({ isOpen, onClose, saleId }: SaleDetailModalProps) {
  const [sale, setSale] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen && saleId) {
      setIsLoading(true);
      getInvoiceDetails(saleId)
        .then(data => setSale(data))
        .catch(() => setSale(null))
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, saleId]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: 10 }}
            className="flex flex-col w-full max-w-2xl bg-white border-2 border-brand-orange shadow-2xl rounded overflow-hidden"
          >
            {/* Header */}
            <div className="bg-brand-yellow px-4 py-2 flex items-center justify-between border-b border-black/10">
              <div className="flex items-center gap-2">
                 <Receipt size={18} className="text-slate-800" />
                 <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">
                    Детали документа: Чек №{saleId}
                 </h3>
              </div>
              <button onClick={onClose} className="hover:text-rose-600 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-0 bg-[#f2f3f7]">
               {isLoading ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-3">
                     <Loader2 className="animate-spin text-brand-orange" size={32} />
                     <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Загрузка состава чека...</span>
                  </div>
               ) : sale ? (
                  <div className="flex flex-col h-full">
                     {/* Meta Info Bar */}
                     <div className="bg-white border-b border-border-base p-4 grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2">
                           <Calendar size={14} className="text-slate-300" />
                           <div className="flex flex-col">
                              <span className="text-[8px] font-black text-slate-400 uppercase leading-none">Дата и время</span>
                              <span className="text-[11px] font-bold text-slate-700">{new Date(sale.createdAt).toLocaleString('ru-RU')}</span>
                           </div>
                        </div>
                        <div className="flex items-center gap-2">
                           <UserCircle size={14} className="text-slate-300" />
                           <div className="flex flex-col">
                              <span className="text-[8px] font-black text-slate-400 uppercase leading-none">Продавец</span>
                              <span className="text-[11px] font-bold text-slate-700 font-black">{sale.user?.username || 'Система'}</span>
                           </div>
                        </div>
                     </div>

                     {/* Items Table */}
                     <div className="flex-1 overflow-auto p-4">
                        <table className="table-1c border-separate border-spacing-0 bg-white shadow-sm rounded-sm">
                           <thead>
                              <tr>
                                 <th className="w-10 text-center">№</th>
                                 <th>Номенклатура</th>
                                 <th className="w-20 text-center">Кол-во</th>
                                 <th className="w-24 text-right">Цена</th>
                                 <th className="w-24 text-right">Всего</th>
                              </tr>
                           </thead>
                           <tbody>
                              {sale.items?.map((item: any, i: number) => (
                                 <tr key={item.id}>
                                    <td className="text-center font-mono text-[10px] text-slate-400">{i + 1}</td>
                                    <td className="font-bold text-slate-700">{item.product?.name || 'Удаленный товар'}</td>
                                    <td className="text-center font-black">{item.quantity} {item.product?.unit || 'шт'}</td>
                                    <td className="text-right text-slate-500 italic">{formatMoney(item.sellingPrice)}</td>
                                    <td className="text-right font-black text-slate-900">{formatMoney(item.quantity * item.sellingPrice)}</td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>

                     {/* Totals Section */}
                     <div className="bg-white border-t border-slate-200 p-6 space-y-2">
                        <div className="flex justify-between items-center text-slate-500 text-[10px] uppercase font-black tracking-widest">
                           <span>Итого без скидки:</span>
                           <span>{formatMoney(sale.totalAmount)}</span>
                        </div>
                        {Number(sale.discountAmount || 0) > 0 && (
                           <div className="flex justify-between items-center text-rose-500 text-[10px] uppercase font-black tracking-widest">
                              <span>Скидка:</span>
                              <span>-{formatMoney(sale.discountAmount)}</span>
                           </div>
                         )}
                        <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                           <span className="text-xs font-black uppercase text-slate-700 tracking-tighter">К оплате (ИТОГО):</span>
                           <span className="text-2xl font-black text-brand-orange leading-none">{formatMoney(sale.netAmount)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-1 text-emerald-600 text-[10px] font-black uppercase">
                           <span>Оплачено:</span>
                           <span>{formatMoney(Math.min(sale.paidAmount || 0, sale.netAmount ?? sale.totalAmount ?? 0))}</span>
                        </div>
                        {((sale.netAmount ?? sale.totalAmount ?? 0) - (sale.paidAmount || 0)) > 0.01 && (
                           <div className="flex justify-between items-center pt-1 text-brand-orange text-[10px] font-black uppercase border-t border-slate-50 mt-1 italic">
                              <span>Остаток долга:</span>
                              <span>{formatMoney((sale.netAmount ?? sale.totalAmount ?? 0) - (sale.paidAmount || 0))}</span>
                           </div>
                        )}
                     </div>
                  </div>
               ) : (
                  <div className="py-20 text-center text-rose-500 font-bold uppercase text-[10px]">
                     Ошибка при загрузке документа
                  </div>
               )}
            </div>

            {/* Footer */}
            <div className="bg-[#fcfcfc] border-t border-border-base p-3 px-5 flex justify-end">
               <button onClick={onClose} className="btn-1c !px-10 font-black uppercase">Закрыть детали</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
