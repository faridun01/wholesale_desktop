import React, { useEffect, useState, useMemo } from 'react';
import { 
  Scissors, 
  Search, 
  Filter, 
  Calendar, 
  Package, 
  Warehouse, 
  History, 
  ArrowRight,
  RotateCcw,
  X,
  Printer
} from 'lucide-react';
import { getWarehouses } from '../api/warehouses.api';
import client from '../api/client';
import { formatMoney } from '../utils/format';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { formatProductName } from '../utils/productName';

export default function WriteOffsView() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Trying /products/history which is more likely to exist given the individual product history path
      const response = await client.get('/products/history', { 
        params: { type: 'adjustment' } 
      });
      // Filter for write-offs if the backend doesn't filter by subType
      const allHistory = Array.isArray(response.data) ? response.data : [];
      const writeOffs = allHistory.filter((i: any) => i.type === 'adjustment' || i.writeOffStatus === 'writeoff');
      setTransactions(writeOffs);
      
      const w = await getWarehouses();
      setWarehouses(Array.isArray(w) ? w : []);
    } catch (err) {
      toast.error('Ошибка загрузки данных');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchesSearch = !search || 
        t.product?.name?.toLowerCase().includes(search.toLowerCase()) ||
        String(t.productId).includes(search);
      const matchesWarehouse = !selectedWarehouseId || String(t.warehouseId) === selectedWarehouseId;
      return matchesSearch && matchesWarehouse;
    });
  }, [transactions, search, selectedWarehouseId]);

  return (
    <div className="flex flex-col h-full bg-white select-none overflow-hidden">
      {/* 1C Header Section */}
      <div className="bg-[#f2f3f7] border-b border-border-base p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-brand-orange p-2 rounded">
               <Scissors size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight uppercase leading-none">Журнал списаний</h1>
              <p className="text-[10px] font-black text-slate-400 uppercase mt-1 tracking-widest italic">Реестр складских потерь и корректировок</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchData} className="btn-1c flex items-center gap-2">
               <History size={14} /> Обновить
            </button>
            <button className="btn-1c flex items-center gap-2">
               <Printer size={14} /> Печать списка
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Поиск по товару..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="field-1c w-full pl-10"
            />
          </div>
          
          <div className="h-6 w-[1px] bg-slate-200"></div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase text-slate-400">Склад:</span>
            <select 
              value={selectedWarehouseId}
              onChange={e => setSelectedWarehouseId(e.target.value)}
              className="bg-white border border-slate-200 rounded px-3 py-1.5 text-xs font-bold outline-none focus:ring-1 focus:ring-brand-orange min-w-[150px]"
            >
              <option value="">[Все склады]</option>
              {warehouses.map(w => <option key={w.id} value={String(w.id)}>{w.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Table */}
      <div className="flex-1 overflow-auto bg-[#e6e8eb]">
        <table className="table-1c border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="w-12 text-center">№</th>
              <th className="w-48 text-center">Дата и время</th>
              <th>Наименование товара</th>
              <th className="w-40">Склад</th>
              <th className="w-32 text-right">Количество</th>
              <th className="w-16 text-center">Ед.</th>
              <th className="w-64">Причина списания</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="py-20 text-center bg-white">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 size={32} className="animate-spin text-brand-orange" />
                    <span className="text-xs font-bold text-slate-400">Загрузка данных...</span>
                  </div>
                </td>
              </tr>
            ) : filteredTransactions.length > 0 ? (
              filteredTransactions.map((t, idx) => (
                <tr key={t.id} className="hover:bg-brand-orange/5 transition-colors">
                  <td className="text-center font-mono text-[10px] text-slate-400">{idx + 1}</td>
                  <td className="text-center font-bold text-slate-600 italic">
                    {new Date(t.createdAt).toLocaleString('ru-RU')}
                  </td>
                  <td>
                    <div className="flex flex-col">
                      <span className="font-black text-slate-800">{formatProductName(t.product?.name)}</span>
                      <span className="text-[9px] text-slate-400 font-mono italic">#{t.productId}</span>
                    </div>
                  </td>
                  <td className="font-bold text-slate-500 uppercase text-[10px] tracking-tighter">
                     {t.warehouse?.name || '---'}
                  </td>
                  <td className="text-right font-black text-rose-600 text-lg">
                    -{Math.abs(t.qtyChange)}
                  </td>
                  <td className="text-center text-[10px] font-black text-slate-400 uppercase">
                    {t.product?.unit || 'шт'}
                  </td>
                  <td>
                    <div className="bg-white border border-slate-100 p-2 rounded text-xs text-slate-600 font-bold leading-tight">
                      {t.reason || 'Причина не указана'}
                    </div>
                  </td>
                  <td className="text-center">
                    <ChevronRight size={14} className="text-slate-300" />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="py-20 text-center bg-white">
                   <div className="flex flex-col items-center gap-3 text-slate-300">
                     <Scissors size={64} strokeWidth={1} />
                     <span className="text-sm font-black uppercase tracking-widest">Журнал списаний пуст</span>
                   </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="bg-[#fcfcfc] border-t border-border-base p-3 px-6 flex items-center justify-between">
         <div className="flex items-center gap-6">
            <div className="flex flex-col">
               <span className="text-[9px] font-black text-slate-400 uppercase leading-none">Всего записей</span>
               <span className="text-lg font-black text-slate-800">{filteredTransactions.length}</span>
            </div>
            <div className="w-[1px] h-8 bg-slate-200"></div>
            <div className="flex flex-col">
               <span className="text-[9px] font-black text-slate-400 uppercase leading-none">Общий объем списаний</span>
               <span className="text-lg font-black text-rose-600 leading-none">
                  {filteredTransactions.reduce((acc, t) => acc + Math.abs(t.qtyChange), 0)} ед.
               </span>
            </div>
         </div>
      </div>
    </div>
  );
}

const Loader2 = ({ size, className }: any) => (
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
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

const ChevronRight = ({ size, className }: any) => (
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
    <path d="m9 18 6-6-6-6" />
  </svg>
);
