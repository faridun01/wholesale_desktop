import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, CalendarDays, Pencil, Plus, Search, Trash2, Wallet, Warehouse, X, Filter, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { addExpensePayment, createExpense, deleteExpense, getExpenses, updateExpense } from '../api/expenses.api';
import { getWarehouses } from '../api/warehouses.api';
import ConfirmationModal from '../components/common/ConfirmationModal';
import PaginationControls from '../components/common/PaginationControls';
import { formatMoney, roundMoney } from '../utils/format';
import { filterWarehousesForUser, getCurrentUser, getUserWarehouseId, isAdminUser } from '../utils/userAccess';
import { getDefaultWarehouseId } from '../utils/warehouse';
import { clsx } from 'clsx';

type ExpenseRow = {
  id: number;
  title: string;
  category: string;
  amount: number;
  paidAmount: number;
  expenseDate: string;
  note?: string | null;
  warehouse?: { id: number; name: string };
  user?: { id: number; username: string };
  userId?: number;
};

const categories = ['Аренда', 'Зарплата', 'Доставка', 'Транспорт', 'Коммунальные', 'Ремонт', 'Прочее'];
const todayValue = new Date().toISOString().slice(0, 10);

export default function ExpensesView() {
  const pageSize = 12;
  const user = useMemo(() => getCurrentUser(), []);
  const isAdmin = isAdminUser(user);
  
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(getUserWarehouseId(user) ? String(getUserWarehouseId(user)) : '');
  const [search, setSearch] = useState('');
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState('all');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'paid' | 'partial' | 'unpaid'>('all');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedExpenseForPayment, setSelectedExpenseForPayment] = useState<ExpenseRow | null>(null);
  const [selectedExpenseForDelete, setSelectedExpenseForDelete] = useState<ExpenseRow | null>(null);
  const [selectedExpenseForEdit, setSelectedExpenseForEdit] = useState<ExpenseRow | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [form, setForm] = useState({ title: '', category: 'Прочее', amount: '', paidAmount: '', expenseDate: todayValue, note: '' });

  const fetchExpenses = async () => {
    try {
      const data = await getExpenses({ warehouseId: selectedWarehouseId || undefined });
      setExpenses(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error('Ошибка загрузки расходов');
    }
  };

  useEffect(() => {
    getWarehouses().then(data => {
        const filtered = filterWarehousesForUser(Array.isArray(data) ? data : [], user);
        setWarehouses(filtered);
        if (!selectedWarehouseId) {
            const def = getDefaultWarehouseId(filtered);
            if (def) setSelectedWarehouseId(String(def));
        }
    });
  }, []);

  useEffect(() => { fetchExpenses(); }, [selectedWarehouseId]);

  const filteredExpenses = useMemo(() => {
    const q = search.toLowerCase();
    return expenses.filter(e => {
      const matchesQ = !q || [e.title, e.category, e.note].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
      const rem = Math.max(0, e.amount - e.paidAmount);
      const matchesS = historyStatusFilter === 'all' || 
                       (historyStatusFilter === 'paid' && rem <= 0) || 
                       (historyStatusFilter === 'partial' && e.paidAmount > 0 && rem > 0) ||
                       (historyStatusFilter === 'unpaid' && e.paidAmount <= 0 && rem > 0);
      const ed = e.expenseDate.slice(0, 10);
      return matchesQ && matchesS && (!historyDateFrom || ed >= historyDateFrom) && (!historyDateTo || ed <= historyDateTo) && (historyCategoryFilter === 'all' || e.category === historyCategoryFilter);
    });
  }, [expenses, search, historyStatusFilter, historyDateFrom, historyDateTo, historyCategoryFilter]);

  const totalAmount = filteredExpenses.reduce((s, e) => s + e.amount, 0);
  const totalPaid = filteredExpenses.reduce((s, e) => s + e.paidAmount, 0);
  const totalPages = Math.ceil(filteredExpenses.length / pageSize) || 1;
  const paginated = filteredExpenses.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.amount) return toast.error('Заполните обязательные поля');
    setIsSubmitting(true);
    try {
        await createExpense({ ...form, amount: Number(form.amount), paidAmount: Number(form.paidAmount || 0), warehouseId: Number(selectedWarehouseId) });
        toast.success('Расход добавлен');
        setForm({ title: '', category: 'Прочее', amount: '', paidAmount: '', expenseDate: todayValue, note: '' });
        fetchExpenses();
    } catch (err: any) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setIsSubmitting(false); }
  };

  const handleAddPayment = async () => {
    if (!selectedExpenseForPayment) return;
    try {
        await addExpensePayment(selectedExpenseForPayment.id, Number(paymentAmount));
        toast.success('Оплата сохранена');
        setSelectedExpenseForPayment(null);
        fetchExpenses();
    } catch (err: any) { toast.error('Ошибка оплаты'); }
  };

  return (
    <div className="flex flex-col h-full bg-[#f0f1f4]">
      <ConfirmationModal
        isOpen={Boolean(selectedExpenseForDelete)}
        onClose={() => setSelectedExpenseForDelete(null)}
        onConfirm={async () => {
            if (!selectedExpenseForDelete) return;
            await deleteExpense(selectedExpenseForDelete.id);
            toast.success('Удалено');
            setSelectedExpenseForDelete(null);
            fetchExpenses();
        }}
        title="Удалить расход?"
        message="Это действие нельзя отменить."
        type="danger"
      />

      {/* HEADER 1C */}
      <div className="bg-white border-b border-border-base p-4 shrink-0 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
             <div className="bg-brand-yellow p-2 rounded">
                <Banknote size={20} className="text-slate-800" />
             </div>
             <div>
                <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Учет расходов</h1>
                <p className="text-[10px] font-black uppercase text-slate-400">Регистрация операционных затрат по складам</p>
             </div>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="flex flex-col text-right">
                <span className="text-[9px] font-black uppercase text-slate-400">Общий итог</span>
                <span className="text-lg font-black text-rose-600">{formatMoney(totalAmount)}</span>
             </div>
             <div className="w-[1px] h-8 bg-slate-200"></div>
             <div className="flex flex-col text-right">
                <span className="text-[9px] font-black uppercase text-slate-400">Задолженность</span>
                <span className="text-lg font-black text-brand-orange">{formatMoney(totalAmount - totalPaid)}</span>
             </div>
          </div>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="toolbar-1c bg-[#f8f9fb] border-b border-border-base shrink-0">
          <div className="flex items-center gap-3 px-3 border-r border-border-base py-1">
             <Warehouse size={14} className="text-slate-400" />
             <select 
               value={selectedWarehouseId} 
               onChange={e => setSelectedWarehouseId(e.target.value)}
               disabled={!isAdmin}
               className="bg-transparent text-[11px] font-black uppercase text-slate-700 outline-none"
             >
               {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
             </select>
          </div>
          <button onClick={() => fetchExpenses()} className="btn-1c flex items-center gap-1.5"><RefreshCw size={14} /> Обновить</button>
          <div className="flex-1"></div>
          <div className="relative w-64 mr-3">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Поиск по расходам..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="field-1c w-full pl-8"
              />
          </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col xl:flex-row">
        {/* LEFT: FORM */}
        <div className="xl:w-80 bg-white border-r border-border-base p-5 flex flex-col shrink-0">
            <h3 className="text-xs font-black uppercase text-slate-500 mb-4 flex items-center gap-2">
                <Plus size={14} className="text-brand-orange" /> Новый расход
            </h3>
            <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Наименование</label>
                    <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="field-1c w-full font-bold" placeholder="Напр: Аренда склада" />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Категория</label>
                    <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="field-1c w-full font-bold uppercase text-[11px]">
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-400">Сумма</label>
                        <input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="field-1c w-full font-black text-rose-600" placeholder="0.00" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-400">Оплачено</label>
                        <input type="number" value={form.paidAmount} onChange={e => setForm({...form, paidAmount: e.target.value})} className="field-1c w-full font-black text-emerald-600" placeholder="0.00" />
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Дата операции</label>
                    <input type="date" value={form.expenseDate} onChange={e => setForm({...form, expenseDate: e.target.value})} className="field-1c w-full font-bold" />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Комментарий</label>
                    <textarea value={form.note} onChange={e => setForm({...form, note: e.target.value})} className="field-1c w-full font-bold h-20 resize-none overflow-auto" />
                </div>
                <button type="submit" disabled={isSubmitting} className="btn-1c w-full !bg-brand-yellow !border-brand-orange/30 !py-3 tracking-widest flex items-center justify-center gap-2">
                    <Plus size={16} strokeWidth={3} /> {isSubmitting ? 'Проведение...' : 'ЗАРЕГИСТРИРОВАТЬ'}
                </button>
            </form>
        </div>

        {/* RIGHT: REGISTRY */}
        <div className="flex-1 flex flex-col bg-[#f0f1f4]">
            {/* Filter Bar */}
            <div className="px-5 py-3 border-b border-border-base bg-white/50 flex flex-wrap gap-4 items-center">
                <select value={historyCategoryFilter} onChange={e => setHistoryCategoryFilter(e.target.value)} className="field-1c !py-1 text-[10px] font-black uppercase">
                    <option value="all">Все категории</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={historyStatusFilter} onChange={e => setHistoryStatusFilter(e.target.value as any)} className="field-1c !py-1 text-[10px] font-black uppercase">
                    <option value="all">Все статусы</option>
                    <option value="paid">Оплачено</option>
                    <option value="partial">Частично</option>
                    <option value="unpaid">Долг</option>
                </select>
                <div className="flex items-center gap-2">
                    <input type="date" value={historyDateFrom} onChange={e => setHistoryDateFrom(e.target.value)} className="field-1c !py-1 text-[10px] font-bold" />
                    <span className="text-slate-400">—</span>
                    <input type="date" value={historyDateTo} onChange={e => setHistoryDateTo(e.target.value)} className="field-1c !py-1 text-[10px] font-bold" />
                </div>
            </div>

            <div className="flex-1 overflow-auto">
                <table className="table-1c border-separate border-spacing-0">
                    <thead className="sticky top-0 z-10">
                        <tr>
                            <th className="w-12 text-center">№</th>
                            <th className="w-32">Дата</th>
                            <th>Содержание / Примечание</th>
                            <th className="w-32">Категория</th>
                            <th className="w-32 text-right">Сумма</th>
                            <th className="w-32 text-right">Оплачено</th>
                            <th className="w-32 text-right">Долг</th>
                            <th className="w-24"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginated.map((e, idx) => {
                            const rem = Math.max(0, e.amount - e.paidAmount);
                            return (
                                <tr key={e.id} className="hover:bg-brand-yellow/5">
                                    <td className="text-center font-mono text-[10px] text-slate-400">{(currentPage-1)*pageSize + idx + 1}</td>
                                    <td className="font-bold text-slate-600">{new Date(e.expenseDate).toLocaleDateString('ru-RU')}</td>
                                    <td>
                                        <div className="font-black text-slate-800">{e.title}</div>
                                        {e.note && <div className="text-[10px] text-slate-400 italic mt-0.5 line-clamp-1">{e.note}</div>}
                                    </td>
                                    <td className="text-center"><span className="text-[9px] font-black uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{e.category}</span></td>
                                    <td className="text-right font-black text-rose-600">{formatMoney(e.amount)}</td>
                                    <td className="text-right font-black text-emerald-600">{formatMoney(e.paidAmount)}</td>
                                    <td className={clsx("text-right font-black", rem > 0 ? "text-brand-orange" : "text-slate-300")}>{formatMoney(rem)}</td>
                                    <td className="text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            {rem > 0 && (
                                                <button onClick={() => { setSelectedExpenseForPayment(e); setPaymentAmount(String(rem)); }} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded" title="Погасить долг">
                                                    <Wallet size={14} />
                                                </button>
                                            )}
                                            <button onClick={() => setSelectedExpenseForDelete(e)} className="p-1.5 text-slate-300 hover:text-rose-600 rounded">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="bg-white border-t border-border-base">
                <PaginationControls currentPage={currentPage} totalPages={totalPages} totalItems={filteredExpenses.length} pageSize={pageSize} onPageChange={setCurrentPage} />
            </div>
        </div>
      </div>

      {/* Payment Modal 1C */}
      {selectedExpenseForPayment && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedExpenseForPayment(null)}></div>
              <div className="relative bg-white w-full max-w-sm rounded-[4px] shadow-2xl border-t-4 border-t-emerald-500 overflow-hidden">
                  <div className="bg-slate-50 px-5 py-3 border-b border-border-base flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase text-slate-800">Погашение задолженности</h3>
                      <button onClick={() => setSelectedExpenseForPayment(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                  </div>
                  <div className="p-5 space-y-4">
                      <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Расход</label>
                          <div className="text-sm font-black text-slate-900">{selectedExpenseForPayment.title}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div className="p-2 bg-slate-50 border border-slate-200 rounded">
                              <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">Сумма долга</span>
                              <span className="text-sm font-black text-rose-600">{formatMoney(selectedExpenseForPayment.amount - selectedExpenseForPayment.paidAmount)}</span>
                          </div>
                          <div className="p-2 bg-emerald-50 border border-emerald-100 rounded">
                              <span className="text-[9px] font-black uppercase text-emerald-600 block mb-1">К оплате</span>
                              <input 
                                type="number" 
                                value={paymentAmount} 
                                onChange={e => setPaymentAmount(e.target.value)}
                                className="w-full bg-transparent text-sm font-black text-emerald-700 outline-none"
                              />
                          </div>
                      </div>
                      <button 
                        onClick={handleAddPayment}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded text-xs uppercase tracking-widest shadow-lg"
                      >
                         ПРОВЕСТИ ОПЛАТУ
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
