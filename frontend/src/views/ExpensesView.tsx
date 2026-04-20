import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, CalendarDays, Pencil, Plus, Search, Trash2, Wallet, Warehouse, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { addExpensePayment, createExpense, deleteExpense, getExpenses, updateExpense } from '../api/expenses.api';
import { getWarehouses } from '../api/warehouses.api';
import ConfirmationModal from '../components/common/ConfirmationModal';
import PaginationControls from '../components/common/PaginationControls';
import { formatMoney, roundMoney } from '../utils/format';
import { filterWarehousesForUser, getCurrentUser, getUserWarehouseId, isAdminUser } from '../utils/userAccess';
import { getDefaultWarehouseId } from '../utils/warehouse';

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

const buildExpenseFormState = (expense?: Partial<ExpenseRow> | null, preferredWarehouseId = '') => ({
  warehouseId: expense?.warehouse?.id ? String(expense.warehouse.id) : preferredWarehouseId,
  title: String(expense?.title || ''),
  category: String(expense?.category || 'Прочее') || 'Прочее',
  amount: expense ? String(roundMoney(expense.amount || 0)) : '',
  paidAmount: expense ? String(roundMoney(expense.paidAmount || 0)) : '',
  expenseDate: expense ? String(expense.expenseDate || '').slice(0, 10) || todayValue : todayValue,
  note: String(expense?.note || ''),
});

export default function ExpensesView() {
  const pageSize = 8;
  const user = React.useMemo(() => getCurrentUser(), []);
  const isAdmin = isAdminUser(user);
  const userWarehouseId = getUserWarehouseId(user);

  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(userWarehouseId ? String(userWarehouseId) : '');
  const [search, setSearch] = useState('');
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState('all');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'paid' | 'partial' | 'unpaid'>('all');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payingExpenseId, setPayingExpenseId] = useState<number | null>(null);
  const [selectedExpenseForPayment, setSelectedExpenseForPayment] = useState<ExpenseRow | null>(null);
  const [selectedExpenseForDelete, setSelectedExpenseForDelete] = useState<ExpenseRow | null>(null);
  const [selectedExpenseForEdit, setSelectedExpenseForEdit] = useState<ExpenseRow | null>(null);
  const [isUpdatingExpense, setIsUpdatingExpense] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [form, setForm] = useState({
    title: '',
    category: 'Прочее',
    amount: '',
    paidAmount: '',
    expenseDate: todayValue,
    note: '',
  });
  const [editForm, setEditForm] = useState(() => buildExpenseFormState(null, userWarehouseId ? String(userWarehouseId) : ''));

  const getExpenseRemaining = (expense: ExpenseRow) =>
    Math.max(0, Number(expense.amount || 0) - Number(expense.paidAmount || 0));

  const fetchExpenses = async (warehouseIdParam?: string) => {
    try {
      const effectiveWarehouseId = !isAdmin && userWarehouseId ? String(userWarehouseId) : (warehouseIdParam ?? selectedWarehouseId);
      const data = await getExpenses({
        warehouseId: effectiveWarehouseId || undefined,
      });
      setExpenses(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Ошибка при загрузке расходов');
    }
  };

  useEffect(() => {
    getWarehouses()
      .then((data) => {
        const filtered = filterWarehousesForUser(Array.isArray(data) ? data : [], user);
        setWarehouses(filtered);
        const defaultWarehouseId = getDefaultWarehouseId(filtered);
        const nextWarehouseId = userWarehouseId
          ? String(userWarehouseId)
          : selectedWarehouseId || (defaultWarehouseId ? String(defaultWarehouseId) : '');

        if (nextWarehouseId !== selectedWarehouseId) {
          setSelectedWarehouseId(nextWarehouseId);
          fetchExpenses(nextWarehouseId);
          return;
        }

        fetchExpenses(nextWarehouseId);
      })
      .catch(() => {
        setWarehouses([]);
        fetchExpenses(selectedWarehouseId);
      });
  }, []);

  useEffect(() => {
    fetchExpenses(selectedWarehouseId);
  }, [selectedWarehouseId]);

  const filteredExpenses = useMemo(() => {
    const query = search.trim().toLowerCase();

    return expenses.filter((expense) => {
      const matchesQuery =
        !query ||
        [expense.title, expense.category, expense.note, expense.warehouse?.name, expense.user?.username]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

      const matchesCategory = historyCategoryFilter === 'all' || expense.category === historyCategoryFilter;
      const remaining = getExpenseRemaining(expense);
      const matchesStatus =
        historyStatusFilter === 'all' ||
        (historyStatusFilter === 'paid' && remaining <= 0) ||
        (historyStatusFilter === 'partial' && Number(expense.paidAmount || 0) > 0 && remaining > 0) ||
        (historyStatusFilter === 'unpaid' && Number(expense.paidAmount || 0) <= 0 && remaining > 0);

      const expenseDateValue = String(expense.expenseDate || '').slice(0, 10);
      const matchesDateFrom = !historyDateFrom || expenseDateValue >= historyDateFrom;
      const matchesDateTo = !historyDateTo || expenseDateValue <= historyDateTo;

      return matchesQuery && matchesCategory && matchesStatus && matchesDateFrom && matchesDateTo;
    });
  }, [expenses, historyCategoryFilter, historyDateFrom, historyDateTo, historyStatusFilter, search]);

  const totalAmount = filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const totalPaidAmount = filteredExpenses.reduce((sum, expense) => sum + Number(expense.paidAmount || 0), 0);
  const totalRemainingAmount = Math.max(0, totalAmount - totalPaidAmount);
  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / pageSize));
  const paginatedExpenses = filteredExpenses.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [historyCategoryFilter, historyDateFrom, historyDateTo, historyStatusFilter, search, selectedWarehouseId]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const closePaymentModal = () => {
    setSelectedExpenseForPayment(null);
    setPaymentAmount('');
  };

  const closeEditModal = () => {
    setSelectedExpenseForEdit(null);
    setEditForm(buildExpenseFormState(null, selectedWarehouseId || (userWarehouseId ? String(userWarehouseId) : '')));
  };

  const handleCreateExpense = async (event: React.FormEvent) => {
    event.preventDefault();

    const warehouseId = isAdmin ? Number(selectedWarehouseId) : userWarehouseId;
    if (!warehouseId) {
      toast.error('Выберите склад');
      return;
    }

    if (!form.title.trim()) {
      toast.error('Введите название расхода');
      return;
    }

    if (!(Number(form.amount) > 0)) {
      toast.error('Сумма расхода должна быть больше нуля');
      return;
    }

    if (Number(form.paidAmount || 0) < 0) {
      toast.error('Оплата не может быть отрицательной');
      return;
    }

    if (Number(form.paidAmount || 0) > Number(form.amount)) {
      toast.error('Оплата не может быть больше суммы расхода');
      return;
    }

    setIsSubmitting(true);
    try {
      await createExpense({
        warehouseId,
        title: form.title.trim(),
        category: form.category,
        amount: Number(form.amount),
        paidAmount: Number(form.paidAmount || 0),
        expenseDate: form.expenseDate,
        note: form.note.trim(),
      });
      toast.success('Расход добавлен');
      setForm({
        title: '',
        category: 'Прочее',
        amount: '',
        paidAmount: '',
        expenseDate: todayValue,
        note: '',
      });
      await fetchExpenses(selectedWarehouseId);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Ошибка при добавлении расхода');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openPaymentModal = (expense: ExpenseRow) => {
    const remaining = getExpenseRemaining(expense);
    if (remaining <= 0) {
      toast.success('Этот расход уже полностью оплачен');
      return;
    }

    setSelectedExpenseForPayment(expense);
    setPaymentAmount(String(roundMoney(remaining)));
  };

  const openEditModal = (expense: ExpenseRow) => {
    setSelectedExpenseForEdit(expense);
    setEditForm(buildExpenseFormState(expense, selectedWarehouseId || (userWarehouseId ? String(userWarehouseId) : '')));
  };

  const handleAddPayment = async () => {
    if (!selectedExpenseForPayment) {
      return;
    }

    const remaining = getExpenseRemaining(selectedExpenseForPayment);
    const amount = Number(String(paymentAmount).replace(',', '.'));

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Введите корректную сумму оплаты');
      return;
    }

    if (amount > remaining) {
      toast.error('Сумма оплаты не может быть больше остатка');
      return;
    }

    setPayingExpenseId(selectedExpenseForPayment.id);
    try {
      await addExpensePayment(selectedExpenseForPayment.id, amount);
      toast.success('Оплата расхода сохранена');
      closePaymentModal();
      await fetchExpenses(selectedWarehouseId);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        toast.error('Маршрут оплаты не найден. Перезапустите backend и попробуйте снова.');
      } else {
        toast.error(err?.response?.data?.error || 'Ошибка при сохранении оплаты');
      }
    } finally {
      setPayingExpenseId(null);
    }
  };

  const handleDeleteExpense = async () => {
    if (!selectedExpenseForDelete) {
      return;
    }

    try {
      await deleteExpense(selectedExpenseForDelete.id);
      toast.success('Расход удалён');
      setSelectedExpenseForDelete(null);
      await fetchExpenses(selectedWarehouseId);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Ошибка при удалении расхода');
    }
  };

  const handleUpdateExpense = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedExpenseForEdit) {
      return;
    }

    const warehouseId = Number(editForm.warehouseId || selectedWarehouseId || userWarehouseId || '');
    if (!warehouseId) {
      toast.error('Выберите склад');
      return;
    }

    if (!editForm.title.trim()) {
      toast.error('Введите название расхода');
      return;
    }

    if (!(Number(editForm.amount) > 0)) {
      toast.error('Сумма расхода должна быть больше нуля');
      return;
    }

    if (Number(editForm.paidAmount || 0) < 0) {
      toast.error('Оплата не может быть отрицательной');
      return;
    }

    if (Number(editForm.paidAmount || 0) > Number(editForm.amount)) {
      toast.error('Оплата не может быть больше суммы расхода');
      return;
    }

    setIsUpdatingExpense(true);
    try {
      await updateExpense(selectedExpenseForEdit.id, {
        warehouseId,
        title: editForm.title.trim(),
        category: editForm.category,
        amount: Number(editForm.amount),
        paidAmount: Number(editForm.paidAmount || 0),
        expenseDate: editForm.expenseDate,
        note: editForm.note.trim(),
      });
      toast.success('Расход обновлён');
      closeEditModal();
      if (String(warehouseId) !== selectedWarehouseId) {
        setSelectedWarehouseId(String(warehouseId));
      }
      await fetchExpenses(String(warehouseId));
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Ошибка при обновлении расхода');
    } finally {
      setIsUpdatingExpense(false);
    }
  };

  const clearHistoryFilters = () => {
    setSearch('');
    setHistoryCategoryFilter('all');
    setHistoryStatusFilter('all');
    setHistoryDateFrom('');
    setHistoryDateTo('');
  };

  return (
    <div className="app-page-shell">
      <div className="w-full space-y-6">
        <div className="overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-4 py-4 sm:px-5 sm:py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-medium tracking-tight text-slate-900 sm:text-4xl">Расходы</h1>
              <p className="mt-1 text-slate-500">Учитывайте расходы по каждому складу отдельно.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-right">
                <p className="text-[11px] uppercase tracking-[0.16em] text-rose-400">Всего расходов</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{formatMoney(totalAmount)}</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-right">
                <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-400">Оплачено</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{formatMoney(totalPaidAmount)}</p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-right">
                <p className="text-[11px] uppercase tracking-[0.16em] text-amber-500">Остаток</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{formatMoney(totalRemainingAmount)}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-3 sm:p-5 xl:grid-cols-[360px_minmax(0,1fr)]">
            <section className="rounded-[24px] border border-slate-100 bg-slate-50 p-4">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                  <Banknote size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Новый расход</h2>
                  <p className="text-sm text-slate-500">Добавьте расход для нужд склада.</p>
                </div>
              </div>

              <form onSubmit={handleCreateExpense} className="space-y-3">
                <div className="space-y-2">
                  <label className="text-sm text-slate-600">Склад</label>
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                    <Warehouse size={16} className="text-slate-400" />
                    <select
                      value={selectedWarehouseId}
                      onChange={(event) => setSelectedWarehouseId(event.target.value)}
                      disabled={!isAdmin}
                      className="w-full bg-transparent text-sm text-slate-700 outline-none"
                    >
                      <option value="">Выберите склад</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-slate-600">Категория</label>
                  <select
                    value={form.category}
                    onChange={(event) => setForm({ ...form, category: event.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-slate-600">Название расхода</label>
                  <input
                    value={form.title}
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                    placeholder="Например: аренда, бензин, грузчики"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm text-slate-600">Сумма расхода</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.amount}
                      onChange={(event) => setForm({ ...form, amount: event.target.value })}
                      placeholder="0.00"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-slate-600">Оплачено сейчас</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.paidAmount}
                      onChange={(event) => setForm({ ...form, paidAmount: event.target.value })}
                      placeholder="0.00"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Остаток к оплате</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {formatMoney(Math.max(0, Number(form.amount || 0) - Number(form.paidAmount || 0)))}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-slate-600">Дата</label>
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                    <CalendarDays size={16} className="text-slate-400" />
                    <input
                      type="date"
                      value={form.expenseDate}
                      onChange={(event) => setForm({ ...form, expenseDate: event.target.value })}
                      className="w-full bg-transparent text-sm text-slate-700 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-slate-600">Примечание</label>
                  <textarea
                    value={form.note}
                    onChange={(event) => setForm({ ...form, note: event.target.value })}
                    rows={3}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                >
                  <Plus size={16} />
                  <span>{isSubmitting ? 'Сохраняем...' : 'Добавить расход'}</span>
                </button>
              </form>
            </section>

            <section className="flex flex-col overflow-hidden rounded-[24px] border border-slate-100 bg-white">
              <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">История расходов</h2>
                  <p className="text-sm text-slate-500">{filteredExpenses.length} записей</p>
                </div>
                <div className="relative w-full lg:max-w-sm">
                  <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Поиск по расходам..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-700 outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-3 border-b border-slate-100 px-4 py-4 sm:px-5 md:grid-cols-2 xl:grid-cols-5">
                <select
                  value={historyCategoryFilter}
                  onChange={(event) => setHistoryCategoryFilter(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none"
                >
                  <option value="all">Все категории</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>

                <select
                  value={historyStatusFilter}
                  onChange={(event) => setHistoryStatusFilter(event.target.value as typeof historyStatusFilter)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none"
                >
                  <option value="all">Все статусы</option>
                  <option value="paid">Полностью оплачено</option>
                  <option value="partial">Частично оплачено</option>
                  <option value="unpaid">Не оплачено</option>
                </select>

                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <CalendarDays size={16} className="text-slate-400" />
                  <input
                    type="date"
                    value={historyDateFrom}
                    onChange={(event) => setHistoryDateFrom(event.target.value)}
                    className="w-full bg-transparent text-sm text-slate-700 outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <CalendarDays size={16} className="text-slate-400" />
                  <input
                    type="date"
                    value={historyDateTo}
                    onChange={(event) => setHistoryDateTo(event.target.value)}
                    className="w-full bg-transparent text-sm text-slate-700 outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={clearHistoryFilters}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Сбросить фильтры
                </button>
              </div>

              <div className="space-y-3 p-3 md:hidden">
                {paginatedExpenses.map((expense) => {
                  const remaining = getExpenseRemaining(expense);

                  return (
                    <article key={`expense-mobile-${expense.id}`} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{expense.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{new Date(expense.expenseDate).toLocaleDateString('ru-RU')}</p>
                        </div>
                        <span className="rounded-xl bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700">{expense.category}</span>
                      </div>

                      {expense.note ? <p className="mt-3 text-sm leading-5 text-slate-500">{expense.note}</p> : null}

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-slate-50 px-3 py-3">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Сумма</p>
                          <p className="mt-1 text-sm font-semibold text-rose-600">{formatMoney(expense.amount)}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-3 py-3">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Оплачено</p>
                          <p className="mt-1 text-sm font-semibold text-emerald-600">{formatMoney(expense.paidAmount || 0)}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-3 py-3">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Остаток</p>
                          <p className="mt-1 text-sm font-semibold text-amber-600">{formatMoney(remaining)}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-3 py-3">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Склад</p>
                          <p className="mt-1 text-sm font-medium text-slate-700">{expense.warehouse?.name || '-'}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Добавил</p>
                          <p className="mt-1 text-sm font-medium text-slate-700">{expense.user?.username || '-'}</p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <button
                          type="button"
                          onClick={() => openEditModal(expense)}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3 text-xs font-semibold text-sky-700"
                        >
                          <Pencil size={14} />
                          <span>Изменить</span>
                        </button>
                        {remaining > 0 ? (
                          <button
                            type="button"
                            onClick={() => openPaymentModal(expense)}
                            disabled={payingExpenseId === expense.id}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                          >
                            <Wallet size={14} />
                            <span>{payingExpenseId === expense.id ? '...' : 'Оплатить'}</span>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setSelectedExpenseForDelete(expense)}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs font-semibold text-rose-700"
                        >
                          <Trash2 size={14} />
                          <span>Удалить</span>
                        </button>
                      </div>
                    </article>
                  );
                })}

                {!filteredExpenses.length && (
                  <div className="rounded-[22px] border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-400">
                    Расходы пока не добавлены.
                  </div>
                )}
              </div>

              <div className="hidden flex-1 overflow-x-auto md:block lg:overflow-x-visible">
                <table className="min-w-full table-fixed">
                  <thead className="bg-slate-50 text-left text-[12px] text-slate-500">
                    <tr>
                      <th className="w-[100px] whitespace-nowrap px-2 py-2 font-medium">Дата</th>
                      <th className="w-[150px] px-2 py-2 font-medium">Расход</th>
                      <th className="w-[90px] whitespace-nowrap px-2 py-2 font-medium">Категория</th>
                      <th className="w-[95px] px-2 py-2 font-medium">Склад</th>
                      <th className="w-[100px] whitespace-nowrap px-2 py-2 font-medium">Сумма</th>
                      <th className="w-[100px] whitespace-nowrap px-2 py-2 font-medium">Оплачено</th>
                      <th className="w-[90px] whitespace-nowrap px-2 py-2 font-medium">Долг</th>
                      <th className="w-[90px] px-2 py-2 font-medium">Кто добавил</th>
                      <th className="w-[110px] whitespace-nowrap px-2 py-2 text-right font-medium">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedExpenses.map((expense) => {
                      const remaining = getExpenseRemaining(expense);

                      return (
                        <tr key={expense.id} className="border-t border-slate-100 text-[12px] text-slate-700">
                          <td className="whitespace-nowrap px-2 py-3">{new Date(expense.expenseDate).toLocaleDateString('ru-RU')}</td>
                          <td className="px-2 py-3">
                            <div className="font-medium leading-4 text-slate-900">{expense.title}</div>
                            {expense.note ? <div className="mt-1 text-[11px] leading-4 text-slate-400">{expense.note}</div> : null}
                          </td>
                          <td className="whitespace-nowrap px-2 py-3">{expense.category}</td>
                          <td className="px-2 py-3 leading-4">{expense.warehouse?.name || '-'}</td>
                          <td className="whitespace-nowrap px-2 py-3 font-medium tabular-nums text-rose-600">
                            {formatMoney(expense.amount).replace(' TJS', '')}
                          </td>
                          <td className="whitespace-nowrap px-2 py-3 font-medium tabular-nums text-emerald-600">
                            {formatMoney(expense.paidAmount || 0).replace(' TJS', '')}
                          </td>
                          <td className="whitespace-nowrap px-2 py-3 font-medium tabular-nums text-amber-600">
                            {formatMoney(remaining).replace(' TJS', '')}
                          </td>
                          <td className="whitespace-nowrap px-2 py-3">{expense.user?.username || '-'}</td>
                          <td className="whitespace-nowrap px-2 py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => openEditModal(expense)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600"
                                title="Редактировать"
                              >
                                <Pencil size={14} />
                              </button>
                              {remaining > 0 ? (
                                <button
                                  onClick={() => openPaymentModal(expense)}
                                  disabled={payingExpenseId === expense.id}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-emerald-100 bg-emerald-50 px-2.5 text-[11px] text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                                  title="Внести оплату"
                                >
                                  <Wallet size={13} />
                                  <span className="font-medium">{payingExpenseId === expense.id ? '...' : 'Оплатить'}</span>
                                </button>
                              ) : null}
                              {(isAdmin || expense.user?.id === user.id) && (
                                <button
                                  onClick={() => setSelectedExpenseForDelete(expense)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
                                  title="Удалить"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!filteredExpenses.length && (
                      <tr>
                        <td colSpan={9} className="px-3 py-12 text-center text-sm text-slate-400">
                          Расходы пока не добавлены.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {filteredExpenses.length > pageSize && (
                <div className="mt-auto border-t border-slate-100 bg-white">
                  <PaginationControls
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={filteredExpenses.length}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    className="border-t-0"
                  />
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {selectedExpenseForPayment && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={closePaymentModal}
        >
          <div
            onClick={(event) => event.stopPropagation()}
              className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-[2.5rem]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 p-5 sm:p-7">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
                  <Wallet size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 sm:text-2xl">Оплата расхода</h3>
                  <p className="mt-1 text-sm text-slate-500">{selectedExpenseForPayment.title}</p>
                </div>
              </div>
              <button
                onClick={closePaymentModal}
                className="rounded-2xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={22} />
              </button>
            </div>

            <div className="space-y-5 overflow-y-auto p-5 sm:p-7">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Всего</p>
                  <p className="mt-1 text-lg font-black text-slate-900">{formatMoney(selectedExpenseForPayment.amount)}</p>
                </div>
                <div className="rounded-2xl bg-amber-50 px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-500">Остаток</p>
                  <p className="mt-1 text-lg font-black text-amber-700">{formatMoney(getExpenseRemaining(selectedExpenseForPayment))}</p>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.10),_transparent_60%)] p-4">
                <label className="ml-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Сумма оплаты</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                  autoFocus
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-2xl font-black text-slate-900 outline-none transition-all focus:border-emerald-400 focus:ring-8 focus:ring-emerald-500/5"
                  placeholder="0.00"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(String(roundMoney(getExpenseRemaining(selectedExpenseForPayment))))}
                    className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
                  >
                    Оплатить весь остаток
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(String(roundMoney(getExpenseRemaining(selectedExpenseForPayment) / 2)))}
                    className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-200"
                  >
                    Половина остатка
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50 p-4 sm:flex-row sm:p-6">
              <button
                type="button"
                onClick={closePaymentModal}
                className="flex-1 rounded-2xl border border-slate-200 bg-white py-4 font-bold text-slate-700 transition-all hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleAddPayment}
                disabled={payingExpenseId === selectedExpenseForPayment.id || !paymentAmount}
                className="flex-1 rounded-2xl bg-emerald-600 py-4 font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-700 disabled:opacity-50"
              >
                {payingExpenseId === selectedExpenseForPayment.id ? 'Сохранение...' : 'Внести оплату'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedExpenseForEdit && (
        <div
          className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={closeEditModal}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-[2.5rem]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 p-4 sm:p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-lg shadow-sky-600/20">
                  <Pencil size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 sm:text-2xl">Редактировать расход</h3>
                  <p className="mt-1 text-sm text-slate-500">Измените сумму, название и остальные поля без удаления записи.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-2xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleUpdateExpense} className="flex min-h-0 flex-1 flex-col">
              <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 sm:p-6 lg:grid-cols-2">
                <div className="space-y-2 lg:col-span-2">
                  <label className="text-sm text-slate-600">Склад</label>
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                    <Warehouse size={16} className="text-slate-400" />
                    <select
                      value={editForm.warehouseId}
                      onChange={(event) => setEditForm({ ...editForm, warehouseId: event.target.value })}
                      className="w-full bg-transparent text-sm text-slate-700 outline-none"
                    >
                      <option value="">Выберите склад</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-slate-600">Категория</label>
                  <select
                    value={editForm.category}
                    onChange={(event) => setEditForm({ ...editForm, category: event.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-slate-600">Дата</label>
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                    <CalendarDays size={16} className="text-slate-400" />
                    <input
                      type="date"
                      value={editForm.expenseDate}
                      onChange={(event) => setEditForm({ ...editForm, expenseDate: event.target.value })}
                      className="w-full bg-transparent text-sm text-slate-700 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2 lg:col-span-2">
                  <label className="text-sm text-slate-600">Название расхода</label>
                  <input
                    value={editForm.title}
                    onChange={(event) => setEditForm({ ...editForm, title: event.target.value })}
                    placeholder="Например: аренда, бензин, грузчики"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-slate-600">Сумма расхода</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.amount}
                    onChange={(event) => setEditForm({ ...editForm, amount: event.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-slate-600">Оплачено</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.paidAmount}
                    onChange={(event) => setEditForm({ ...editForm, paidAmount: event.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 lg:col-span-2">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Остаток к оплате</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {formatMoney(Math.max(0, Number(editForm.amount || 0) - Number(editForm.paidAmount || 0)))}
                  </p>
                </div>

                <div className="space-y-2 lg:col-span-2">
                  <label className="text-sm text-slate-600">Примечание</label>
                  <textarea
                    value={editForm.note}
                    onChange={(event) => setEditForm({ ...editForm, note: event.target.value })}
                    rows={4}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                  />
                </div>
              </div>

              <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:p-6">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="flex-1 rounded-2xl border border-slate-200 bg-white py-3.5 font-bold text-slate-700 transition-all hover:bg-slate-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingExpense}
                  className="flex-1 rounded-2xl bg-sky-600 py-3.5 font-black text-white shadow-lg shadow-sky-600/20 transition-all hover:bg-sky-700 disabled:opacity-50"
                >
                  {isUpdatingExpense ? 'Сохраняем...' : 'Сохранить изменения'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={Boolean(selectedExpenseForDelete)}
        onClose={() => setSelectedExpenseForDelete(null)}
        onConfirm={handleDeleteExpense}
        title="Удалить расход?"
        message={
          selectedExpenseForDelete
            ? `Расход "${selectedExpenseForDelete.title}" будет удалён из истории. Это действие нельзя отменить.`
            : ''
        }
        confirmText="Удалить"
        cancelText="Отмена"
        type="danger"
      />
    </div>
  );
}
