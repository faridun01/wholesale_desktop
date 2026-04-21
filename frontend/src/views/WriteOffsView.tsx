import React, { useEffect, useState, useMemo } from 'react';
import { 
  Scissors, 
  Search, 
  Filter, 
  Calendar, 
  Package, 
  Warehouse, 
  History, 
  RotateCcw,
  X,
  Printer,
  ChevronRight,
  TrendingDown,
  AlertCircle
} from 'lucide-react';
import { getWarehouses } from '../api/warehouses.api';
import client from '../api/client';
import { formatMoney } from '../utils/format';
import { formatProductName } from '../utils/productName';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import WriteOffReturnModal from '../components/sales/WriteOffReturnModal';

export default function WriteOffsView() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [showReturnModal, setShowReturnModal] = useState(false);
  
  useEffect(() => {
    fetchData();

    const handleRefresh = () => fetchData(true);
    window.addEventListener('refresh-data', handleRefresh);
    return () => window.removeEventListener('refresh-data', handleRefresh);
  }, [selectedWarehouseId]);

  const fetchData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const w = await getWarehouses();
      setWarehouses(Array.isArray(w) ? w : []);
      
      const response = await client.get('/reports/writeoffs', { 
        params: { warehouseId: selectedWarehouseId || undefined } 
      });
      setTransactions(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      if (!silent) toast.error('Ошибка загрузки данных');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const s = search.toLowerCase();
      return !s || 
        t.product_name?.toLowerCase().includes(s) ||
        String(t.transaction_id || '').includes(s);
    });
  }, [transactions, search]);

  return (
    <div className="flex flex-col h-full bg-[#f0f1f4] select-none overflow-hidden text-[#1e1e1e]">
      {/* 1C Header Section */}
      <div className="bg-white border-b border-border-base p-4 shrink-0 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-rose-600 p-2 rounded shadow-lg shadow-rose-200">
               <TrendingDown size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tighter uppercase leading-none">Журнал списаний товара</h1>
              <p className="text-[10px] font-black text-slate-400 uppercase mt-1 tracking-widest italic">Контроль складских потерь и порчи имущества</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => fetchData()} className="btn-1c flex items-center gap-2 !bg-white">
               <History size={14} className="text-brand-orange" /> Обновить реестр
            </button>
            <button className="btn-1c flex items-center gap-2 !bg-slate-900 !text-white !border-slate-800">
               <Printer size={14} /> Печать журнала
            </button>
          </div>
        </div>

        {/* Toolbar Filters */}
        <div className="flex flex-wrap items-center gap-3 bg-[#f8f9fb] p-2 rounded border border-slate-100">
          <div className="relative w-80">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Поиск по товару или № операции..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="field-1c w-full pl-10"
            />
          </div>
          
          <div className="h-6 w-[1px] bg-slate-200"></div>

          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase text-slate-400">Склад:</span>
            <select 
              value={selectedWarehouseId}
              onChange={e => setSelectedWarehouseId(e.target.value)}
              className="bg-white border border-slate-200 rounded px-3 py-1.5 text-[11px] font-black uppercase outline-none focus:ring-1 focus:ring-brand-orange min-w-[200px]"
            >
              <option value="">[Все склады предприятия]</option>
              {warehouses.map(w => <option key={w.id} value={String(w.id)}>{w.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Registry Table */}
      <div className="flex-1 overflow-auto bg-white m-4 rounded-[4px] border border-border-base shadow-sm">
        <table className="table-1c border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 shadow-sm bg-slate-50">
            <tr>
              <th className="w-12 text-center">№</th>
              <th className="w-40 text-center">Дата операции</th>
              <th>Объект списания (Номенклатура)</th>
              <th className="w-40">Место хранения</th>
              <th className="w-28 text-right">Списано</th>
              <th className="w-28 text-right">Возвращено</th>
              <th className="w-16 text-center">Ед.</th>
              <th className="w-48 text-right">Стоимость</th>
              <th className="w-20 text-center">Статус</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={10} className="py-32 text-center">
                   <div className="w-10 h-10 border-4 border-rose-600 border-t-transparent animate-spin rounded-full mx-auto mb-4"></div>
                   <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Синхронизация данных...</span>
                </td>
              </tr>
            ) : filteredTransactions.length > 0 ? (
              filteredTransactions.map((t, idx) => {
                const balance = Number(t.quantity || 0) - Number(t.returned_qty || 0);
                return (
                  <tr 
                    key={t.transaction_id || idx} 
                    onDoubleClick={() => { setSelectedTx(t); setShowReturnModal(true); }}
                    className="hover:bg-rose-50/30 transition-colors group cursor-pointer"
                  >
                    <td className="text-center font-mono text-[10px] text-slate-300">{idx + 1}</td>
                    <td className="text-center font-bold text-slate-500 italic text-[11px]">
                      {t.date}
                    </td>
                    <td>
                      <div className="flex flex-col">
                        <span className="font-black text-slate-800 text-[11px] uppercase">{formatProductName(t.product_name)}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                           <span className="text-[9px] text-slate-400 font-bold italic truncate max-w-[200px]">{t.reason}</span>
                        </div>
                      </div>
                    </td>
                    <td className="font-black text-slate-500 uppercase text-[9px] italic">
                       {t.warehouse_name}
                    </td>
                    <td className="text-right font-black text-rose-600 text-[13px]">
                      -{Math.abs(t.quantity)}
                    </td>
                    <td className="text-right font-black text-emerald-600 text-[11px]">
                      {t.returned_qty > 0 ? `+${t.returned_qty}` : '—'}
                    </td>
                    <td className="text-center text-[9px] font-black text-slate-400 uppercase">
                      {t.unit}
                    </td>
                    <td className="text-right">
                       <div className="font-black text-slate-900 text-[11px]">{formatMoney(t.total_value)}</div>
                       <div className="text-[8px] font-black text-slate-400 uppercase">По {formatMoney(t.cost_price)}</div>
                    </td>
                    <td className="text-center">
                       {t.status === 'full_return' ? (
                          <span className="bg-emerald-100 text-emerald-700 text-[8px] font-black px-1.5 py-0.5 rounded uppercase">Аннулиро.</span>
                       ) : t.returned_qty > 0 ? (
                          <span className="bg-orange-100 text-orange-700 text-[8px] font-black px-1.5 py-0.5 rounded uppercase">Частично</span>
                       ) : (
                          <span className="bg-rose-100 text-rose-700 text-[8px] font-black px-1.5 py-0.5 rounded uppercase">Списано</span>
                       )}
                    </td>
                    <td className="text-center">
                       <button 
                         onClick={(e) => { e.stopPropagation(); setSelectedTx(t); setShowReturnModal(true); }}
                         disabled={t.status === 'full_return'}
                         className="p-1.5 text-slate-300 hover:text-rose-600 disabled:opacity-0 transition-colors"
                         title="Оформить возврат на баланс"
                       >
                          <RotateCcw size={16} />
                       </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} className="py-40 text-center">
                   <div className="flex flex-col items-center gap-4 text-slate-200">
                     <Scissors size={80} strokeWidth={1} />
                     <div className="space-y-1">
                        <span className="text-sm font-black uppercase tracking-widest block text-slate-300">Реестр списаний пуст</span>
                        <span className="text-[10px] font-bold uppercase italic text-slate-300">Все складские остатки в полном порядке</span>
                     </div>
                   </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Stats Sidebar */}
      <div className="bg-slate-900 text-white border-t border-slate-800 p-4 px-8 shrink-0 flex items-center justify-between shadow-2xl relative overflow-hidden">
         <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <TrendingDown size={120} strokeWidth={1} />
         </div>
         
         <div className="flex gap-12 relative z-10">
            <div>
               <p className="text-[9px] font-black uppercase text-white/40 tracking-widest mb-1">Всего актов</p>
               <p className="text-2xl font-black text-white">{filteredTransactions.length}</p>
            </div>
            <div>
               <p className="text-[9px] font-black uppercase text-white/40 tracking-widest mb-1">Общая сумма потерь</p>
               <p className="text-2xl font-black text-rose-400">
                  {formatMoney(filteredTransactions.reduce((acc, t) => acc + (t.status !== 'full_return' ? Number(t.total_value) : 0), 0))}
               </p>
            </div>
            <div>
               <p className="text-[9px] font-black uppercase text-white/40 tracking-widest mb-1">Количество единиц</p>
               <p className="text-2xl font-black text-brand-yellow">
                  {filteredTransactions.reduce((acc, t) => acc + (t.status !== 'full_return' ? Math.abs(t.quantity) : 0), 0)} <span className="text-sm">шт.</span>
               </p>
            </div>
         </div>

         <div className="bg-white/5 border border-white/10 p-3 px-6 rounded-sm flex items-center gap-4 relative z-10 backdrop-blur-sm">
            <AlertCircle size={20} className="text-emerald-400" />
            <div className="text-[10px] font-bold text-white/70 leading-tight uppercase">
               Все операции списания и возврата <br /> фиксируются в истории движения товара
            </div>
         </div>
      </div>

      <WriteOffReturnModal 
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        transaction={selectedTx}
        onSuccess={fetchData}
      />
    </div>
  );
}
