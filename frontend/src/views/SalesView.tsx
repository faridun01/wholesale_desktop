import React, { useState, useEffect, useMemo, useRef } from 'react';
import client from '../api/client';
import { 
  Plus, 
  Search, 
  Filter, 
  Receipt, 
  ChevronUp,
  ChevronDown,
  ChevronRight, 
  Eye, 
  Pencil,
  Trash2, 
  X,
  Calendar,
  Banknote,
  User as UserIcon,
  Warehouse as WarehouseIcon,
  CheckCircle2,
  Clock,
  AlertCircle,
  RotateCcw,
  Printer,
  History,
  FileText,
  ArrowRight,
  RefreshCw,
  MoreVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { filterWarehousesForUser, getCurrentUser, getUserWarehouseId, isAdminUser } from '../utils/userAccess';
import { formatCount, formatMoney, toFixedNumber, roundMoney, ceilMoney } from '../utils/format';
import { formatProductName } from '../utils/productName';
import { getDefaultWarehouseId } from '../utils/warehouse';
import { getCustomers } from '../api/customers.api';
import { getWarehouses } from '../api/warehouses.api';
import { getProducts } from '../api/products.api';
import PaginationControls from '../components/common/PaginationControls';
import { printSalesInvoice } from '../utils/print/salesInvoicePrint';
import { printThermalReceipt } from '../utils/print/thermalReceiptPrint';
import ReturnModal from '../components/sales/ReturnModal';
import EditInvoiceModal from '../components/sales/EditInvoiceModal';

// Logics helpers
const normalizeProductSearchValue = (value: unknown) => formatProductName(value).toLowerCase();
const normalizeDisplayBaseUnit = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'шт';
  if (['пачка', 'пачки', 'пачек', 'шт', 'штук', 'штука', 'штуки', 'pcs', 'piece', 'pieces'].includes(normalized)) return 'шт';
  return normalized;
};
const normalizePackagings = (product: any) =>
  Array.isArray(product?.packagings)
    ? product.packagings
        .map((entry: any) => ({
          id: Number(entry.id),
          packageName: String(entry.packageName || '').trim(),
          baseUnitName: normalizeDisplayBaseUnit(entry.baseUnitName || product?.baseUnitName || product?.unit || 'шт'),
          unitsPerPackage: Number(entry.unitsPerPackage || 0),
          isDefault: Boolean(entry.isDefault),
        }))
        .filter((entry: any) => entry.id > 0 && entry.packageName && entry.unitsPerPackage > 0)
    : [];
const getDefaultPackaging = (packagings: any[]) => packagings.find((entry) => entry.isDefault) || packagings[0] || null;

type EditInvoiceItem = {
  key: string;
  productId: number | '';
  productSearch: string;
  quantity: string;
  sellingPrice: string;
  unit: string;
  baseUnitName: string;
  packagings: any[];
  selectedPackagingId: number | '';
  packageQuantityInput: string;
  extraUnitQuantityInput: string;
  discount: string;
  isNew?: boolean;
};

export default function SalesView() {
  const PAYMENT_EPSILON = 0.01;
  const pageSize = 10;
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const user = useMemo(() => getCurrentUser(), []);
  const isAdmin = isAdminUser(user);
  const userWarehouseId = getUserWarehouseId(user);
  
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(userWarehouseId ? String(userWarehouseId) : '');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'partial' | 'unpaid'>('all');
  const [staffFilter, setStaffFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [showReturnModal, setShowReturnModal] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => { 
    fetchInvoices();

    const handleRefresh = () => fetchInvoices(true);
    window.addEventListener('refresh-data', handleRefresh);
    return () => window.removeEventListener('refresh-data', handleRefresh);
  }, [selectedWarehouseId]);
  useEffect(() => { 
    getWarehouses().then(d => {
        const f = filterWarehousesForUser(Array.isArray(d) ? d : [], user);
        setWarehouses(f);
        if (!selectedWarehouseId) setSelectedWarehouseId(String(getDefaultWarehouseId(f) || ''));
    });
    getCustomers().then(d => setCustomers(Array.isArray(d) ? d : []));
  }, []);

  const fetchInvoices = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const q = selectedWarehouseId ? `?warehouseId=${selectedWarehouseId}` : '';
      const res = await client.get(`/invoices${q}`);
      setInvoices(res.data.filter((i: any) => !i.cancelled));
    } catch (err) { 
      if (!silent) toast.error('Ошибка загрузки чеков'); 
    }
    finally { 
      if (!silent) setIsLoading(false); 
    }
  };

  const fetchInvoiceDetails = async (id: number) => {
    try {
      const res = await client.get(`/invoices/${id}`);
      setSelectedInvoice(res.data);
      setShowDetailsModal(true);
    } catch (err) { toast.error('Ошибка загрузки данных'); }
  };

  const [isPaying, setIsPaying] = useState(false);

  const getEffectiveStatus = (inv: any) => {
    const paid = Number(inv.paidAmount || 0);
    const net = typeof inv.netAmount === 'number' ? inv.netAmount : Number(inv.totalAmount || 0);
    const returned = Number(inv.returnedAmount || 0);

    if (returned > 0 && net <= 0.01) return 'returned';
    if (paid >= net - 0.01) return 'paid';
    return paid > 0 ? 'partial' : 'unpaid';
  };

  const filteredInvoices = invoices.filter(inv => {
    const s = search.toLowerCase();
    const matchesSearch = inv.id.toString().includes(s) || inv.customer_name?.toLowerCase().includes(s);
    const matchesStatus = statusFilter === 'all' || getEffectiveStatus(inv) === statusFilter;
    const d = String(inv.createdAt || '').slice(0, 10);
    return matchesSearch && matchesStatus && (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
  }).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalPages = Math.ceil(filteredInvoices.length / pageSize) || 1;
  const paginated = filteredInvoices.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getStatusBadge = (inv: any) => {
    const status = getEffectiveStatus(inv);
    const returned = Number(inv.returnedAmount || 0);
    
    let label = status === 'paid' ? 'Оплачено' : status === 'partial' ? 'Частично' : status === 'returned' ? 'Возврат' : 'Долг';
    let color = status === 'paid' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 
                status === 'partial' ? 'text-brand-orange bg-brand-orange/5 border-brand-orange/20' : 
                status === 'returned' ? 'text-rose-600 bg-rose-50 border-rose-200' :
                'text-slate-500 bg-slate-50 border-slate-200';

    return (
      <div className="flex flex-col items-center gap-1">
         <span className={clsx("px-2 py-0.5 rounded-[2px] text-[10px] font-black uppercase border whitespace-nowrap", color)}>{label}</span>
         {returned > 0 && status !== 'returned' && (
           <span className="text-[7px] font-black uppercase text-rose-500 bg-rose-50 px-1 border border-rose-100 rounded-[1px] tracking-tighter">Есть возврат</span>
         )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#f0f1f4]">
      {/* HEADER 1C */}
      <div className="bg-white border-b border-border-base p-4 shrink-0 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
             <div className="bg-brand-yellow p-2 rounded">
                <Receipt size={20} className="text-slate-800" />
             </div>
             <div>
                <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Журнал чеков и продаж</h1>
                <p className="text-[10px] font-black uppercase text-slate-400">Реестр торговых документов предприятия</p>
             </div>
          </div>
          <button 
            onClick={() => navigate('/pos')}
            className="btn-1c !bg-brand-yellow !border-brand-orange/30 !px-6 flex items-center gap-2"
          >
            <Plus size={16} strokeWidth={3} /> СОЗДАТЬ ЧЕК (POS)
          </button>
        </div>
      </div>

      {/* TOOLBAR 1C */}
      <div className="toolbar-1c bg-[#f8f9fb] border-b border-border-base shrink-0">
          <div className="flex items-center gap-3 px-3 border-r border-border-base py-1">
             <WarehouseIcon size={14} className="text-slate-400" />
             <select 
               value={selectedWarehouseId} 
               onChange={e => setSelectedWarehouseId(e.target.value)}
               disabled={!isAdmin}
               className="bg-transparent text-[11px] font-black uppercase text-slate-700 outline-none"
             >
               <option value="">Все склады</option>
               {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
             </select>
          </div>
          
          <div className="flex items-center gap-2 px-3 border-r border-border-base">
             <Calendar size={14} className="text-slate-400" />
             <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="field-1c !py-1 !px-2 text-[10px] font-bold" />
             <span className="text-slate-400">—</span>
             <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="field-1c !py-1 !px-2 text-[10px] font-bold" />
          </div>

          <div className="flex items-center gap-2 px-3 border-r border-border-base">
             <Filter size={14} className="text-slate-400" />
             <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="field-1c !py-1 text-[10px] font-black uppercase">
                <option value="all">Любой статус</option>
                <option value="paid">Оплачено</option>
                <option value="partial">Частично</option>
                <option value="unpaid">Долг</option>
             </select>
          </div>

          <button onClick={() => fetchInvoices()} className="btn-1c flex items-center gap-1.5"><RefreshCw size={14} /> Обновить</button>
          
          <div className="flex-1"></div>

          <div className="relative w-64 mr-3">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Поиск по чеку / клиенту..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="field-1c w-full pl-8"
              />
          </div>
      </div>

      {/* REGISTRY CONTENT */}
      <div className="flex-1 overflow-auto">
         {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-32 opacity-30">
                <div className="w-12 h-12 border-4 border-brand-yellow border-t-transparent animate-spin rounded-full mb-4"></div>
                <span className="font-black uppercase tracking-widest text-[10px]">Загрузка реестра документов...</span>
            </div>
         ) : (
            <table className="table-1c border-separate border-spacing-0">
               <thead className="sticky top-0 z-10 shadow-sm">
                  <tr>
                     <th className="w-12 text-center">№</th>
                     <th className="w-32">Дата / Время</th>
                     <th className="w-24">Документ</th>
                     <th>Контрагент (Покупатель)</th>
                     <th className="w-48">Склад отгрузки</th>
                     <th className="w-32 text-right">Сумма</th>
                     <th className="w-32 text-right">Оплачено</th>
                     <th className="w-32 text-right">Остаток</th>
                     <th className="w-24 text-center">Статус</th>
                     <th className="w-10"></th>
                  </tr>
               </thead>
               <tbody>
                  {paginated.map((inv, idx) => {
                      const date = new Date(inv.createdAt);
                      const netAmt = typeof inv.netAmount === 'number' ? inv.netAmount : Number(inv.totalAmount || 0);
                      const paidAmt = Number(inv.paidAmount || 0);
                      const displayPaid = Math.min(paidAmt, netAmt); // Cap display paid amount
                      const balance = Math.max(0, netAmt - paidAmt); // No negative balance in display
                      return (
                        <tr key={inv.id} onDoubleClick={() => fetchInvoiceDetails(inv.id)} className="hover:bg-brand-yellow/5 group cursor-pointer">
                            <td className="text-center font-mono text-[10px] text-slate-400">{(currentPage-1)*pageSize+idx+1}</td>
                            <td>
                               <div className="font-bold text-slate-700">{date.toLocaleDateString('ru-RU')}</div>
                               <div className="text-[9px] font-black text-slate-400 uppercase italic leading-none mt-0.5">{date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>
                            </td>
                            <td>
                               <div className="font-black text-brand-orange text-[11px] leading-none mb-1">№ {inv.id}</div>
                               <div className="text-[8px] font-black uppercase text-slate-400">Продажа</div>
                            </td>
                            <td>
                               <div className="font-bold text-slate-800">{inv.customer_name || '—'}</div>
                               {inv.staff_name && <div className="text-[9px] text-slate-400 flex items-center gap-1 mt-0.5"><UserIcon size={10} /> {inv.staff_name}</div>}
                            </td>
                            <td><div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-500 italic"><WarehouseIcon size={12} className="text-slate-300" /> {inv.warehouse_name || '—'}</div></td>
                            <td className="text-right font-black text-slate-900">{formatMoney(netAmt)}</td>
                            <td className="text-right font-black text-emerald-600">{formatMoney(displayPaid)}</td>
                            <td className={clsx("text-right font-black", balance > 0.01 ? "text-brand-orange" : "text-slate-300")}>{formatMoney(balance)}</td>
                            <td className="text-center">{getStatusBadge(inv)}</td>
                            <td className="text-center">
                               <button onClick={() => fetchInvoiceDetails(inv.id)} className="p-1.5 text-slate-300 hover:text-slate-600 rounded">
                                  <ChevronRight size={16} />
                                </button>
                            </td>
                        </tr>
                      );
                  })}
               </tbody>
            </table>
         )}

         {!isLoading && filteredInvoices.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-32 opacity-30">
                <FileText size={80} strokeWidth={1} />
                <span className="mt-4 font-black uppercase tracking-widest text-[10px]">В журнале нет подходящих документов</span>
            </div>
         )}
      </div>

      {/* FOOTER PAGINATION */}
      <div className="bg-white border-t border-border-base shrink-0">
          <PaginationControls currentPage={currentPage} totalPages={totalPages} totalItems={filteredInvoices.length} pageSize={pageSize} onPageChange={setCurrentPage} />
      </div>

      {/* DETAILS MODAL 1C */}
      <AnimatePresence>
        {showDetailsModal && selectedInvoice && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 overflow-hidden">
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
               onClick={() => setShowDetailsModal(false)}
             />
             <motion.div 
               initial={{ scale: 0.95, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, y: 20, opacity: 0 }}
               className="relative bg-white w-full max-w-5xl rounded-[4px] shadow-2xl flex flex-col max-h-[90vh]"
             >
                {/* Modal Header */}
                <div className="bg-slate-50 border-b border-border-base p-4 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className="bg-brand-yellow p-1.5 rounded">
                         <Receipt size={18} className="text-slate-800" />
                      </div>
                      <div>
                         <h3 className="text-sm font-black uppercase text-slate-800 flex items-center gap-2">
                           Продажа № {selectedInvoice.id} <span className="text-slate-400 font-bold">от {new Date(selectedInvoice.createdAt).toLocaleString('ru-RU')}</span>
                         </h3>
                         <div className="flex gap-4 mt-0.5">
                            <span className="text-[9px] font-black uppercase text-slate-400">Склад: {selectedInvoice.warehouse?.name || '—'}</span>
                            <span className="text-[9px] font-black uppercase text-slate-400">Оформил: {selectedInvoice.staff_name || selectedInvoice.user?.username || '—'}</span>
                         </div>
                      </div>
                   </div>
                   <div className="flex items-center gap-2">
                      {getStatusBadge(selectedInvoice)}
                      <button onClick={() => setShowDetailsModal(false)} className="text-slate-300 hover:text-slate-600 p-1">
                         <X size={20} />
                      </button>
                   </div>
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-auto">
                   <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div className="space-y-4">
                         <div className="bg-slate-50 border border-slate-200 p-4 rounded">
                            <span className="text-[9px] font-black uppercase text-slate-400 block mb-2 tracking-widest">Контрагент</span>
                            <div className="flex items-center gap-3">
                               <div className="w-10 h-10 bg-white border border-slate-200 rounded flex items-center justify-center text-slate-400">
                                  <UserIcon size={20} />
                               </div>
                               <div>
                                  <div className="text-sm font-black text-slate-900 leading-tight">{selectedInvoice.customer_name || '—'}</div>
                                  <div className="text-[10px] font-bold text-brand-orange mt-0.5 uppercase tracking-tighter italic">Постоянный покупатель</div>
                               </div>
                            </div>
                         </div>
                      </div>

                      <div className="lg:col-span-2 grid grid-cols-2 lg:grid-cols-4 gap-4">
                         <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                            <span className="text-[8px] font-black uppercase text-slate-400 block mb-1">Сумма чека</span>
                            <div className="text-base font-black text-slate-900">{formatMoney(selectedInvoice.totalAmount || 0)}</div>
                         </div>
                         <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                            <span className="text-[8px] font-black uppercase text-slate-400 block mb-1">Скидка ({selectedInvoice.discount || 0}%)</span>
                            <div className="text-base font-black text-brand-orange">-{formatMoney((selectedInvoice.totalAmount || 0) * (selectedInvoice.discount || 0) / 100)}</div>
                         </div>
                         <div className="p-3 bg-slate-900 border border-slate-800 rounded">
                            <span className="text-[8px] font-black uppercase text-slate-500 block mb-1">К оплате (NET)</span>
                            <div className="text-base font-black text-brand-yellow">{formatMoney(typeof selectedInvoice.netAmount === 'number' ? selectedInvoice.netAmount : (selectedInvoice.totalAmount || 0))}</div>
                         </div>
                         <div className="p-3 bg-emerald-50 border border-emerald-100 rounded">
                            <span className="text-[8px] font-black uppercase text-emerald-600 block mb-1">Оплачено</span>
                            <div className="text-base font-black text-emerald-600">{formatMoney(Math.min(selectedInvoice.paidAmount || 0, typeof selectedInvoice.netAmount === 'number' ? selectedInvoice.netAmount : (selectedInvoice.totalAmount || 0)))}</div>
                         </div>
                      </div>
                   </div>

                   {/* Table of Items */}
                   <div className="px-6 pb-6">
                      <div className="bg-white border border-border-base rounded-[2px] overflow-hidden">
                         <div className="bg-slate-50 px-4 py-2 border-b border-border-base">
                            <h4 className="text-[10px] font-black uppercase text-slate-500">Спецификация (состав чека)</h4>
                         </div>
                         <table className="table-1c !text-[11px]">
                            <thead>
                               <tr>
                                  <th className="w-10 text-center">№</th>
                                  <th>Номенклатура</th>
                                  <th className="text-right w-24">Цена</th>
                                  <th className="text-right w-24">Кол-во</th>
                                  <th className="text-right w-24">Ед.</th>
                                  <th className="text-right w-32">Всего</th>
                               </tr>
                            </thead>
                            <tbody>
                               {selectedInvoice.items?.map((item: any, idx: number) => (
                                  <tr key={idx}>
                                     <td className="text-center font-mono text-slate-400">{idx+1}</td>
                                     <td className="font-bold text-slate-800">{formatProductName(item.product_name)}</td>
                                     <td className="text-right font-bold text-slate-600">{formatMoney(item.sellingPrice)}</td>
                                     <td className="text-right font-black italic">{item.quantity}</td>
                                     <td className="text-right text-slate-400 uppercase font-black text-[9px]">{item.unit || 'шт'}</td>
                                     <td className="text-right font-black text-slate-900">{formatMoney(item.totalPrice)}</td>
                                  </tr>
                               ))}
                            </tbody>
                         </table>
                      </div>
                   </div>
                </div>

                {/* Modal Actions */}
                <div className="bg-[#f8f9fb] border-t border-border-base p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <button 
                           onClick={() => printSalesInvoice({ invoice: selectedInvoice, statusLabel: '', subtotal: 0, discountAmount: 0, netAmount: 0, balanceAmount: 0, changeAmount: 0, appliedPaidAmount: 0 })}
                           className="btn-1c flex items-center gap-2 !bg-white"
                        >
                           <Printer size={14} /> Печать ТОРГ-12
                        </button>
                        <button 
                           onClick={() => printThermalReceipt(selectedInvoice)}
                           className="btn-1c flex items-center gap-2 !bg-white"
                        >
                           <Printer size={14} /> Кассовый чек
                        </button>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <button 
                          onClick={() => { 
                            const net = typeof selectedInvoice.netAmount === 'number' ? selectedInvoice.netAmount : (selectedInvoice.totalAmount || 0);
                            const paid = selectedInvoice.paidAmount || 0;
                            setShowDetailsModal(false); 
                            setShowPaymentModal(true); 
                            setPaymentAmount(String(Math.max(0, roundMoney(net - paid)))); 
                          }}
                          disabled={getEffectiveStatus(selectedInvoice) === 'paid'}
                          className="btn-1c !bg-brand-yellow !border-brand-orange/30 flex items-center gap-2 disabled:grayscale disabled:opacity-30"
                        >
                           <Banknote size={14} strokeWidth={3} /> ПРИНЯТЬ ОПЛАТУ
                        </button>
                        <div className="w-[1px] h-6 bg-slate-300 mx-1"></div>
                        <button 
                           onClick={() => { setShowDetailsModal(false); setShowEditModal(true); }}
                           className="btn-1c !bg-white !text-brand-orange hover:!bg-brand-orange/5 flex items-center gap-2"
                        >
                           <Pencil size={14} /> РЕДАКТИРОВАТЬ
                        </button>
                        <button 
                           onClick={() => { setShowDetailsModal(false); setShowReturnModal(true); }}
                           className="btn-1c !bg-white !text-rose-600 hover:!bg-rose-50 flex items-center gap-2"
                        >
                           <RotateCcw size={14} /> ВОЗВРАТ
                        </button>
                         <div className="w-[1px] h-6 bg-slate-300 mx-1"></div>
                         <button 
                            onClick={async () => {
                               if (!window.confirm('Вы уверены, что хотите ОТМЕНИТЬ эту накладную? Это действие вернет товар на склад и аннулирует долг.')) return;
                               try {
                                  await client.post(`/invoices/${selectedInvoice.id}/cancel`);
                                  toast.success('Накладная отменена');
                                  window.dispatchEvent(new CustomEvent('refresh-data'));
                                  setShowDetailsModal(false);
                                  fetchInvoices();
                               } catch (err: any) {
                                  toast.error(err.response?.data?.error || 'Ошибка при отмене');
                               }
                            }}
                            className="btn-1c !bg-white !text-rose-700 hover:!bg-rose-50 border-rose-100 flex items-center gap-2"
                         >
                            <Trash2 size={14} /> ОТМЕНИТЬ
                         </button>
                         <div className="w-[1px] h-6 bg-slate-300 mx-1"></div>
                         <button onClick={() => setShowDetailsModal(false)} className="btn-1c !bg-slate-900 !text-white hover:!bg-slate-800 !px-8">
                           ЗАКРЫТЬ
                        </button>
                    </div>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PAYMENT MODAL (Simplified) */}
      <AnimatePresence>
         {showPaymentModal && selectedInvoice && (
            <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowPaymentModal(false)} />
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white w-full max-w-sm rounded-[4px] shadow-2xl border-t-4 border-t-emerald-500 overflow-hidden">
                    <div className="bg-slate-50 px-5 py-3 border-b border-border-base flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase text-slate-800">Регистрация входящей оплаты</h3>
                        <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                    </div>
                    <div className="p-5 space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-400">Накладная № {selectedInvoice.id}</label>
                            <div className="text-sm font-black text-slate-900 uppercase italic underline decoration-emerald-500 decoration-2 underline-offset-4">{selectedInvoice.customer_name}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-2 bg-slate-50 border border-slate-200 rounded">
                                <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">Долг клиента</span>
                                <span className="text-sm font-black text-rose-600">{formatMoney(Math.max(0, (typeof selectedInvoice.netAmount === 'number' ? selectedInvoice.netAmount : (selectedInvoice.totalAmount || 0)) - (selectedInvoice.paidAmount || 0)))}</span>
                            </div>
                            <div className="p-2 bg-emerald-50 border border-emerald-100 rounded">
                                <span className="text-[9px] font-black uppercase text-emerald-600 block mb-1">Сумма оплаты</span>
                                <input 
                                  type="number" 
                                  value={paymentAmount} 
                                  onChange={e => setPaymentAmount(e.target.value)}
                                  className="w-full bg-transparent text-sm font-black text-emerald-700 outline-none"
                                />
                            </div>
                        </div>
                        <button 
                          onClick={async () => {
                             const currentNet = typeof selectedInvoice.netAmount === 'number' ? selectedInvoice.netAmount : (selectedInvoice.totalAmount || 0);
                             const debt = Math.max(0, currentNet - (selectedInvoice.paidAmount || 0));
                             const amount = Number(paymentAmount);
                             if (amount > debt + 0.01) {
                                toast.error('Сумма превышает остаток долга');
                                return;
                             }
                             if (amount <= 0) {
                                toast.error('Введите корректную сумму');
                                return;
                             }

                             setIsPaying(true);
                             try {
                                await client.post('/payments', {
                                  customer_id: selectedInvoice.customerId,
                                  invoice_id: selectedInvoice.id,
                                  amount,
                                  method: 'cash'
                                });
                                 toast.success('Оплата проведена');
                                 window.dispatchEvent(new CustomEvent('refresh-data'));
                                 setShowPaymentModal(false);
                                 fetchInvoices();
                             } catch(e) { toast.error('Ошибка оплаты'); }
                             finally { setIsPaying(false); }
                          }}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2"
                        >
                           {isPaying ? 'ПРОВЕДЕНИЕ...' : 'ПРОВЕСТИ ОПЛАТУ'}
                        </button>
                    </div>
                </motion.div>
            </div>
         )}
      </AnimatePresence>

      <ReturnModal 
         isOpen={showReturnModal} 
         onClose={() => setShowReturnModal(false)} 
         invoice={selectedInvoice} 
         onSuccess={fetchInvoices} 
      />

      <EditInvoiceModal 
         isOpen={showEditModal} 
         onClose={() => setShowEditModal(false)} 
         invoice={selectedInvoice} 
         onSuccess={fetchInvoices} 
      />
    </div>
  );
}
