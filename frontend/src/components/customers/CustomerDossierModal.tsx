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
  FileText,
  Warehouse
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
  const [summary, setSummary] = useState({ totalRevenue: 0, totalPaid: 0, balance: 0, invoiceCount: 0 });

  useEffect(() => {
    const fetchReconciliation = () => {
      if (isOpen && customer?.id) {
         setIsLoading(true);
         getCustomerReconciliation(customer.id)
           .then(data => {
              console.log('RECONCILIATION DATA:', data);
              if (data && data.history) {
                 setHistory(data.history);
                 setSummary(data.summary || { totalRevenue: 0, totalPaid: 0, balance: 0, invoiceCount: 0 });
              } else {
                 setHistory(Array.isArray(data) ? data : []);
              }
           })
           .catch(err => console.error('RECONCILIATION ERROR:', err))
           .finally(() => setIsLoading(false));
      }
    };

    fetchReconciliation();

    window.addEventListener('refresh-data', fetchReconciliation);
    return () => window.removeEventListener('refresh-data', fetchReconciliation);
  }, [isOpen, customer]);

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
                    <h3 className="text-sm font-medium uppercase tracking-tight text-slate-800">
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
                 <div className="w-full md:w-72 bg-white border-r border-border-base flex flex-col shrink-0">
                    {/* Customer Contact Info */}
                    <div className="p-5 border-b border-slate-100 space-y-4">
                       <div className="flex items-center gap-2 mb-3">
                          <div className="w-1 h-4 bg-brand-orange"></div>
                          <span className="text-[10px] font-medium uppercase text-slate-500 tracking-wider">Контакты</span>
                       </div>
                       <div className="space-y-2.5">
                          <div className="flex items-center gap-3 text-xs font-bold text-slate-700">
                             <Phone size={14} className="text-slate-300" /> {customer?.phone || '—'}
                          </div>
                          <div className="flex items-start gap-3 text-xs font-bold text-slate-700">
                             <MapPin size={14} className="text-slate-300 shrink-0 mt-0.5" /> {customer?.address || '—'}
                          </div>
                          {customer?.customerCategory && (
                             <div className="inline-block px-2 py-0.5 bg-brand-yellow/20 rounded-[2px] text-[9px] font-medium uppercase text-slate-600 border border-brand-yellow/30">
                                {customer.customerCategory}
                             </div>
                          )}
                       </div>
                    </div>

                    {/* Financial KPIs - 1C Monitor Style */}
                    <div className="p-5 flex-1 bg-slate-50/50">
                       <div className="flex items-center gap-2 mb-4">
                          <div className="w-1 h-4 bg-brand-orange"></div>
                          <span className="text-[10px] font-medium uppercase text-slate-500 tracking-wider">Финансовое состояние</span>
                       </div>
                       
                       <div className="space-y-3">
                          <div className="bg-white p-3 border border-slate-200 rounded shadow-sm hover:border-emerald-300 transition-colors">
                             <span className="text-[8px] font-medium uppercase text-emerald-600 block mb-0.5">Всего закупок</span>
                             <div className="text-xl font-medium text-slate-800 leading-none">{formatMoney(summary.totalRevenue)}</div>
                          </div>
                          
                          <div className="bg-white p-3 border border-slate-200 rounded shadow-sm hover:border-brand-orange/30 transition-colors group">
                             <span className="text-[8px] font-medium uppercase text-slate-500 block mb-0.5">Сумма оплат</span>
                             <div className="text-xl font-medium text-slate-800 leading-none">{formatMoney(summary.totalPaid)}</div>
                             {(summary.totalPaid - history.reduce((s: any, h: any) => s + (h.type === 'invoice' ? (h.paidAmount || 0) : 0), 0)) > 1 && (
                                <div className="mt-2 pt-2 border-t border-slate-50 flex flex-col">
                                   <span className="text-[7px] font-bold text-slate-400 uppercase leading-none mb-1">В т.ч. авансы:</span>
                                   <span className="text-[10px] font-medium text-brand-orange">{formatMoney(summary.totalPaid - history.reduce((s: any, h: any) => s + (h.type === 'invoice' ? (h.paidAmount || 0) : 0), 0))}</span>
                                </div>
                             )}
                          </div>

                          <div className={clsx(
                             "p-3 rounded border shadow-sm transition-all duration-300",
                             summary.balance > 0.01 ? "bg-rose-50 border-rose-200 scale-[1.02]" : "bg-emerald-50 border-emerald-200"
                          )}>
                             <span className={clsx("text-[8px] font-medium uppercase block mb-0.5", summary.balance > 0.01 ? "text-rose-600" : "text-emerald-600")}>
                                {summary.balance > 0.01 ? 'Текущий долг' : 'Переплата/Баланс'}
                             </span>
                             <div className={clsx("text-xl font-medium leading-none", summary.balance > 0.01 ? "text-rose-700" : "text-emerald-700")}>
                                {formatMoney(Math.abs(summary.balance))}
                             </div>
                          </div>
                       </div>
                    </div>
                 </div>

                 {/* RIGHT SIDE: Transaction History */}
                 <div className="flex-1 flex flex-col min-w-0 bg-white">
                    <div className="bg-[#fcfcfc] px-5 py-2.5 border-b border-border-base flex items-center justify-between shadow-sm sticky top-0 z-20">
                       <div className="flex items-center gap-3">
                          <History size={14} className="text-brand-orange" />
                          <h4 className="text-[10px] font-medium uppercase text-slate-600 tracking-wider">
                             История операций (только накладные)
                          </h4>
                       </div>
                       <button onClick={handlePrint} className="btn-1c flex items-center gap-1.5 !py-1 !px-3 !text-[9px]">
                          <Printer size={12} /> Печать сверки
                       </button>
                    </div>

                    <div className="flex-1 overflow-auto p-4 bg-slate-50/30">
                       {isLoading ? (
                          <div className="py-20 text-center text-[10px] font-medium text-slate-400 uppercase tracking-widest animate-pulse">
                             Загрузка данных...
                          </div>
                       ) : history.filter(h => h.type === 'invoice').length > 0 ? (
                           <table className="table-1c border-separate border-spacing-0 bg-white shadow-sm border border-slate-200">
                              <thead className="sticky top-0 z-10">
                                 <tr>
                                    <th className="w-12 text-center border-b border-slate-200 bg-slate-50">№</th>
                                    <th className="text-left py-3 border-b border-slate-200 bg-slate-50">Документ / Содержание</th>
                                    <th className="w-32 text-right border-b border-slate-200 bg-slate-50">Сумма</th>
                                    <th className="w-32 text-right border-b border-slate-200 bg-slate-50">Оплачено</th>
                                    <th className="w-32 text-right border-b border-slate-200 bg-slate-50">Остаток</th>
                                    <th className="w-28 text-center border-b border-slate-200 bg-slate-50">Статус</th>
                                    <th className="w-8 border-b border-slate-200 bg-slate-50"></th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                 {history.filter(h => h.type === 'invoice').map((h, i) => {
                                    const netAmt = h.amount;
                                    const paidAmt = h.paidAmount || 0;
                                    const rowBalance = Math.max(0, netAmt - paidAmt);
                                    
                                    return (
                                       <tr 
                                          key={`${h.type}-${h.id}-${i}`} 
                                          className="hover:bg-brand-yellow/10 group cursor-pointer transition-colors"
                                          onClick={() => handleShowDetail(h.id, h.type)}
                                       >
                                          <td className="text-center font-mono text-[10px] text-slate-400 border-r border-slate-50">{i + 1}</td>
                                          <td className="py-2.5">
                                             <div className="font-medium text-[11px] leading-tight text-slate-800">
                                                Продажа № {h.id}
                                             </div>
                                             <div className="text-[8px] font-medium uppercase text-slate-400 tracking-tighter mt-0.5">
                                                {new Date(h.date).toLocaleDateString('ru-RU')}
                                             </div>
                                          </td>
                                          <td className="text-right font-medium text-slate-900 pr-4">
                                             {formatMoney(netAmt)}
                                          </td>
                                          <td className="text-right font-medium text-emerald-600 pr-4 bg-emerald-50/5">
                                             {formatMoney(paidAmt)}
                                          </td>
                                          <td className={clsx(
                                             "text-right font-medium pr-4", 
                                             rowBalance > 0.01 ? "text-brand-orange" : "text-slate-300"
                                          )}>
                                             {formatMoney(rowBalance)}
                                          </td>
                                          <td className="text-center px-2">
                                             <span className={clsx(
                                                "px-2.5 py-0.5 rounded-[2px] text-[10px] font-medium uppercase border whitespace-nowrap inline-block",
                                                h.status === 'Возврат' ? "text-rose-600 bg-rose-50 border-rose-200" :
                                                h.status === 'Оплачено' ? "text-emerald-700 bg-emerald-50 border-emerald-300" :
                                                h.status === 'Частично' ? "text-amber-600 bg-amber-50 border-amber-200" :
                                                "text-slate-500 bg-slate-50 border-slate-200"
                                             )}>
                                                {h.status}
                                             </span>
                                          </td>
                                          <td className="text-center text-slate-200 group-hover:text-brand-orange transition-colors">
                                             <ChevronRight size={14} />
                                          </td>
                                       </tr>
                                    );
                                 })}
                              </tbody>
                           </table>
                       ) : (
                          <div className="h-full flex flex-col items-center justify-center py-20 text-slate-300 opacity-50 uppercase font-medium text-[10px] tracking-widest gap-2">
                             <Package size={48} strokeWidth={1} />
                             Нет зафиксированных операций
                          </div>
                       )}
                    </div>
                 </div>
              </div>

              {/* Footer 1C Style */}
              <div className="bg-[#fcfcfc] border-t border-border-base p-3 px-5 flex items-center justify-between shrink-0">
                 <div className="flex items-center gap-4 text-[10px] font-medium uppercase text-slate-400">
                    <span>Документов: {summary.invoiceCount}</span>
                 </div>
                 <button onClick={onClose} className="btn-1c !px-10 font-medium uppercase">Закрыть</button>
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
