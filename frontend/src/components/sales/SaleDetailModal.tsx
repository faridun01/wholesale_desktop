import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Receipt, 
  Package, 
  Banknote, 
  Calendar, 
  UserCircle,
  Loader2, 
  FileText, 
  Printer 
} from 'lucide-react';
import { clsx } from 'clsx';
import { getInvoiceDetails } from '../../api/invoices.api';
import { formatMoney } from '../../utils/format';
import PrintPreviewModal from '../common/PrintPreviewModal';
import { generateTorg12Html, generateReceiptHtml } from '../../utils/printTemplates';

interface SaleDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleId: number | null;
}

export default function SaleDetailModal({ isOpen, onClose, saleId }: SaleDetailModalProps) {
  const [sale, setSale] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [previewState, setPreviewState] = useState<{ isOpen: boolean; title: string; html: string; type: 'a4' | 'receipt' }>({
    isOpen: false,
    title: '',
    html: '',
    type: 'a4'
  });

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
               <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setPreviewState({ isOpen: true, title: `ТОРГ-12 №${saleId}`, html: generateTorg12Html(sale), type: 'a4' })}
                    className="btn-1c flex items-center gap-1.5 !text-[9px] !py-1 !px-2"
                  >
                     <FileText size={12} /> ТОРГ-12
                  </button>
                  <button 
                    onClick={() => setPreviewState({ isOpen: true, title: `Чек №${saleId}`, html: generateReceiptHtml(sale), type: 'receipt' })}
                    className="btn-1c flex items-center gap-1.5 !text-[9px] !py-1 !px-2"
                  >
                     <Receipt size={12} /> Чек
                  </button>
                  <div className="h-4 w-[1px] bg-black/10 mx-1"></div>
                  <button onClick={onClose} className="hover:text-rose-600 transition-colors">
                    <X size={20} />
                  </button>
               </div>
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
                     <div className="p-4 bg-slate-50 flex justify-between items-start gap-8 border-t border-slate-200">
                        <div className="flex-1 space-y-4">
                           {/* Payments Ledger */}
                           <div className="bg-white rounded border border-slate-200 overflow-hidden shadow-sm">
                              <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between">
                                 <span className="text-[9px] font-black uppercase text-slate-500">История оплат</span>
                                 <span className="text-[10px] font-bold text-emerald-600">{formatMoney(sale.paidAmount)}</span>
                              </div>
                              <div className="max-h-[120px] overflow-auto">
                                 <table className="w-full text-[10px] border-collapse">
                                    <thead className="sticky top-0 bg-white border-b border-slate-100">
                                       <tr>
                                          <th className="px-3 py-1 text-left text-slate-400">Дата</th>
                                          <th className="px-3 py-1 text-left text-slate-400">Метод</th>
                                          <th className="px-3 py-1 text-right text-slate-400">Сумма</th>
                                       </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                       {Array.isArray(sale.payments) && sale.payments.length > 0 ? (
                                          sale.payments.map((p: any) => (
                                             <tr key={p.id}>
                                                <td className="px-3 py-1.5 text-slate-500">{new Date(p.createdAt).toLocaleDateString('ru-RU')}</td>
                                                <td className="px-3 py-1.5 font-bold text-slate-700 uppercase">{p.method}</td>
                                                <td className="px-3 py-1.5 text-right font-black text-emerald-700">{formatMoney(p.amount)}</td>
                                             </tr>
                                          ))
                                       ) : (
                                          <tr>
                                             <td colSpan={3} className="px-3 py-4 text-center text-slate-400 italic">Нет зафиксированных оплат</td>
                                          </tr>
                                       )}
                                    </tbody>
                                 </table>
                              </div>
                           </div>

                           {Array.isArray(sale.returns) && sale.returns.length > 0 && (
                              <div className="bg-rose-50/50 rounded border border-rose-100 overflow-hidden shadow-sm">
                                 <div className="bg-rose-100/50 px-3 py-1.5 border-b border-rose-100">
                                    <span className="text-[9px] font-black uppercase text-rose-600">Возвраты</span>
                                 </div>
                                 <div className="p-3">
                                    {sale.returns.map((r: any) => (
                                       <div key={r.id} className="flex justify-between items-center text-[10px]">
                                          <span className="text-slate-500">{new Date(r.createdAt).toLocaleDateString('ru-RU')}</span>
                                          <span className="font-black text-rose-700">{formatMoney(r.totalValue)}</span>
                                       </div>
                                    ))}
                                 </div>
                              </div>
                           )}
                        </div>

                        <div className="w-48 space-y-1">
                           <div className="flex justify-between text-[11px] font-bold text-slate-500">
                              <span>Итого:</span>
                              <span>{formatMoney(sale.totalAmount)}</span>
                           </div>
                           {sale.discount > 0 && (
                              <div className="flex justify-between text-[11px] font-bold text-rose-500">
                                 <span>Скидка:</span>
                                 <span>-{formatMoney(sale.discountAmount || (sale.totalAmount * (sale.discount / 100)))}</span>
                              </div>
                           )}
                           <div className="flex justify-between text-base font-black text-slate-900 border-t border-slate-200 pt-1 mt-1">
                              <span>СУММА:</span>
                              <span>{formatMoney(sale.netAmount)}</span>
                           </div>
                           <div className="flex justify-between text-[11px] font-bold text-emerald-600 pt-2">
                              <span>ОПЛАЧЕНО:</span>
                              <span>{formatMoney(sale.paidAmount)}</span>
                           </div>
                           <div className={clsx(
                              "flex justify-between text-[12px] font-black pt-1 border-t-2 border-dotted mt-1",
                              (sale.netAmount - sale.paidAmount) > 0.01 ? "text-rose-600" : "text-emerald-700"
                           )}>
                              <span>ДОЛГ:</span>
                              <span>{formatMoney(sale.netAmount - sale.paidAmount)}</span>
                           </div>
                        </div>
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
       
       <PrintPreviewModal 
         isOpen={previewState.isOpen}
         onClose={() => setPreviewState(s => ({ ...s, isOpen: false }))}
         title={previewState.title}
         html={previewState.html}
         type={previewState.type}
       />
    </AnimatePresence>
  );
}
