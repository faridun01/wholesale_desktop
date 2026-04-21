import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  User, 
  Phone, 
  MapPin, 
  History, 
  DollarSign, 
  Package, 
  CreditCard,
  Printer,
  ChevronRight,
  FileText
} from 'lucide-react';
import { getCustomerHistory, getCustomerReconciliation } from '../../api/customers.api';
import { formatMoney } from '../../utils/format';
import { generateReconciliationHtml } from '../../utils/printTemplates';
import { clsx } from 'clsx';

import SaleDetailModal from '../sales/SaleDetailModal';
import PrintPreviewModal from '../common/PrintPreviewModal';

interface CustomerDossierModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: any;
}

export default function CustomerDossierModal({ isOpen, onClose, customer }: CustomerDossierModalProps) {
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    if (isOpen && customer?.id) {
       setIsLoading(true);
       getCustomerReconciliation(customer.id)
         .then(data => {
            console.log('RECONCILIATION DATA:', data);
            setHistory(Array.isArray(data) ? data : []);
         })
         .catch(err => console.error('RECONCILIATION ERROR:', err))
         .finally(() => setIsLoading(false));
    }
  }, [isOpen, customer]);

  const summary = useMemo(() => {
    const revenue = history.filter(h => h.side === 'debit').reduce((acc, h) => acc + h.amount, 0);
    const paid = history.filter(h => h.side === 'credit').reduce((acc, h) => acc + h.amount, 0);
    
    return {
      totalRevenue: revenue,
      totalPaid: paid,
      balance: revenue - paid,
      invoiceCount: history.filter(h => h.type === 'invoice').length
    };
  }, [history]);

  const handleShowDetail = (id: number, type: string) => {
    if (type !== 'invoice') return;
    setSelectedSaleId(id);
    setIsDetailOpen(true);
  };

  const handlePrint = () => {
    setPreviewOpen(true);
  };

  const reconciliationHtml = useMemo(() => {
    if (!customer || !history) return '';
    return generateReconciliationHtml(customer, history);
  }, [customer, history]);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex flex-col w-full max-w-5xl max-h-[90vh] bg-white border-2 border-brand-orange shadow-2xl rounded-sm overflow-hidden"
            >
              {/* Header 1C Taxi Style */}
              <div className="bg-brand-yellow px-4 py-2.5 flex items-center justify-between border-b border-black/10 shrink-0">
                 <div className="flex items-center gap-3">
                    <div className="bg-white/20 p-1.5 rounded-[4px]">
                       <User size={18} className="text-slate-800" />
                    </div>
                    <h3 className="text-sm font-black uppercase tracking-tight text-slate-800">
                       Досье контрагента: <span className="text-slate-900 border-b-2 border-brand-orange">{customer?.name}</span>
                    </h3>
                 </div>
                 <div className="flex items-center gap-2 text-slate-400">
                    <button onClick={onClose} className="hover:bg-black/5 p-1 rounded transition-colors text-slate-700">
                       <X size={20} />
                    </button>
                 </div>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-auto flex flex-col md:flex-row bg-[#f2f3f7]">
                 {/* LEFT SIDE: Info & Stats */}
                 <div className="w-full md:w-80 bg-white border-r border-border-base p-6 space-y-6 shrink-0">
                    <div className="space-y-4">
                       <div>
                          <span className="text-[9px] font-black uppercase text-slate-400 block tracking-widest mb-2">Контактные данные</span>
                          <div className="space-y-2">
                             <div className="flex items-center gap-3 text-xs font-bold text-slate-700">
                                <Phone size={14} className="text-slate-300" /> {customer?.phone || 'Не указан'}
                             </div>
                             <div className="flex items-start gap-3 text-xs font-bold text-slate-700">
                                <MapPin size={14} className="text-slate-300 shrink-0 mt-0.5" /> {customer?.address || 'Адрес не указан'}
                             </div>
                             <div className="inline-block px-2 py-1 bg-slate-100 rounded text-[9px] font-black uppercase text-slate-500 mt-2">
                                {customer?.customerCategory || 'Без категории'}
                             </div>
                          </div>
                       </div>

                       <div className="pt-6 border-t border-slate-100">
                          <span className="text-[9px] font-black uppercase text-slate-400 block tracking-widest mb-3">Финансовые показатели</span>
                          <div className="grid grid-cols-1 gap-2">
                             <div className="p-3 bg-emerald-50 rounded border border-emerald-100">
                                <span className="text-[8px] font-black uppercase text-emerald-600 block mb-0.5">Всего закупок</span>
                                <span className="text-lg font-black text-emerald-700">{formatMoney(summary.totalRevenue)}</span>
                             </div>
                             <div className="p-3 bg-brand-yellow/10 rounded border border-brand-yellow/20">
                                <span className="text-[8px] font-black uppercase text-slate-500 block mb-0.5">Сумма оплат</span>
                                <span className="text-lg font-black text-slate-800">{formatMoney(summary.totalPaid)}</span>
                             </div>
                             <div className={clsx("p-3 rounded border", summary.balance > 0 ? "bg-rose-50 border-rose-100" : "bg-slate-50 border-slate-200")}>
                                <span className={clsx("text-[8px] font-black uppercase block mb-0.5", summary.balance > 0 ? "text-rose-600" : "text-slate-500")}>Текущий долг</span>
                                <span className={clsx("text-lg font-black", summary.balance > 0 ? "text-rose-700" : "text-slate-400")}>{formatMoney(summary.balance)}</span>
                             </div>
                          </div>
                       </div>
                    </div>
                 </div>

                 {/* RIGHT SIDE: Transaction History */}
                 <div className="flex-1 flex flex-col min-w-0">
                    <div className="bg-white px-5 py-3 border-b border-border-base flex items-center justify-between shadow-sm">
                       <h4 className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-2">
                          <History size={14} className="text-brand-orange" /> История операций
                       </h4>
                       <button onClick={handlePrint} className="btn-1c flex items-center gap-1.5 !text-[10px] !py-1">
                          <Printer size={12} /> Печать сверки
                       </button>
                    </div>
                    
                    <div className="flex-1 overflow-auto bg-[#e6e8eb]">
                       {isLoading ? (
                          <div className="h-full flex items-center justify-center py-20 text-slate-400 italic text-xs">
                             Загрузка данных...
                          </div>
                       ) : history.filter(h => h.type === 'invoice').length > 0 ? (
                          <table className="table-1c border-separate border-spacing-0">
                             <thead className="sticky top-0 z-10">
                                <tr>
                                   <th className="w-10 text-center">№</th>
                                   <th className="w-24">Дата</th>
                                   <th className="w-24">Склад</th>
                                   <th className="w-48">Документ / Содержание</th>
                                   <th className="text-right">Сумма</th>
                                   <th className="text-right">Оплачено</th>
                                   <th className="text-right w-24">Долг (Сальдо)</th>
                                   <th className="w-8"></th>
                                </tr>
                             </thead>
                             <tbody>
                                {history.filter(h => h.type === 'invoice').map((h, i) => {
                                   const isDebit = h.side === 'debit';
                                   
                                   return (
                                      <tr 
                                        key={`${h.type}-${h.id}`} 
                                        className={clsx("hover:bg-brand-yellow/5 group cursor-pointer", !isDebit && "bg-slate-50/50")} 
                                        onClick={() => handleShowDetail(h.id, h.type)}
                                      >
                                         <td className="text-center font-mono text-[10px] text-slate-400">{i + 1}</td>
                                         <td className="font-bold text-slate-600 italic">
                                            {new Date(h.date).toLocaleDateString('ru-RU')}
                                         </td>
                                         <td className="text-[10px] font-black text-slate-400 uppercase truncate max-w-[100px]" title={h.warehouse}>
                                            {h.warehouse}
                                         </td>
                                         <td>
                                           <span className={clsx(
                                              "font-black text-[10px]",
                                              isDebit ? "text-brand-orange hover:underline decoration-brand-orange" : "text-emerald-700 font-bold"
                                           )}>
                                              {h.description}
                                           </span>
                                         </td>
                                         <td className="text-right font-black text-slate-900">
                                            {formatMoney(h.amount)}
                                         </td>
                                         <td className="text-right font-black text-emerald-600">
                                            {formatMoney(h.paidAmount || 0)}
                                         </td>
                                         <td className={clsx("text-right font-black", h.runningBalance > 0 ? "text-rose-600" : "text-emerald-700")}>
                                            {formatMoney(h.runningBalance)}
                                         </td>
                                         <td className="text-center text-slate-200 group-hover:text-brand-orange transition-colors">
                                            {isDebit && <ChevronRight size={14} />}
                                         </td>
                                      </tr>
                                   );
                                 })}
                             </tbody>
                          </table>
                       ) : (
                          <div className="h-full flex flex-col items-center justify-center py-20 text-slate-300 opacity-50 uppercase font-black text-[10px] tracking-widest gap-2">
                             <Package size={48} strokeWidth={1} />
                             Нет зафиксированных операций
                          </div>
                       )}
                    </div>
                 </div>
              </div>

              {/* Footer 1C Style */}
              <div className="bg-[#fcfcfc] border-t border-border-base p-3 px-5 flex items-center justify-between shrink-0">
                 <div className="flex items-center gap-4 text-[10px] font-black uppercase text-slate-400">
                    <span>Документов: {summary.invoiceCount}</span>
                 </div>
                 <button onClick={onClose} className="btn-1c !px-10 font-black uppercase">Закрыть</button>
              </div>
            </motion.div>
            
            <PrintPreviewModal 
              isOpen={previewOpen}
              onClose={() => setPreviewOpen(false)}
              title={`Акт сверки - ${customer?.name}`}
              html={reconciliationHtml}
              type="a4"
            />
          </div>
        )}
      </AnimatePresence>

      <SaleDetailModal 
        isOpen={isDetailOpen} 
        onClose={() => setIsDetailOpen(false)} 
        saleId={selectedSaleId} 
      />
    </>
  );
}
