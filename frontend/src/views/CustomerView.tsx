import React, { useEffect, useState } from 'react';
import { Search, Plus, Edit2, Trash2, FileText, Phone, MapPin, X, User, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { Card, Badge } from '../components/UI';
import client from '../api/client';
import { createCustomer, deleteCustomer, getCustomers, updateCustomer } from '../api/customers.api';
import { formatCount, formatMoney, formatPercent } from '../utils/format';
import ConfirmationModal from '../components/common/ConfirmationModal';
import PaginationControls from '../components/common/PaginationControls';
import { useMemo } from 'react';
import { getCurrentUser, isAdminUser } from '../utils/userAccess';
import { NavLink, useLocation } from 'react-router-dom';

interface Customer {
  id: number;
  customerType?: 'individual' | 'company';
  name: string;
  customerCategory?: string;
  companyName?: string;
  contactName?: string;
  phone: string;
  country?: string;
  region?: string;
  city?: string;
  address: string;
  notes: string;
  total_invoiced: number;
  total_paid: number;
  balance: number;
  invoice_count?: number;
  average_invoice?: number;
  customer_segment?: 'VIP' | 'Постоянный' | 'Обычный' | 'Новый' | string;
  last_purchase_at?: string | null;
  payment_efficiency?: number;
}

interface StatementPayment {
  id: number;
  amount: number;
  method: string;
  createdAt: string;
  staff_name: string;
}

interface StatementReturn {
  id: number;
  totalValue: number;
  reason?: string;
  createdAt: string;
  staff_name: string;
}

interface StatementItem {
  id: number;
  product?: { name?: string };
  quantity: number;
  totalBaseUnits?: number;
  packageQuantity?: number;
  extraUnitQuantity?: number;
  unitsPerPackageSnapshot?: number;
  unitsPerPackage?: number;
  packageNameSnapshot?: string;
  baseUnitNameSnapshot?: string;
  packageName?: string;
  baseUnitName?: string;
  returnedQty?: number;
  sellingPrice: number;
}

interface StatementInvoice {
  id: number;
  createdAt: string;
  totalAmount: number;
  discount: number;
  netAmount: number;
  paidAmount: number;
  returnedAmount: number;
  status: string;
  warehouse?: { name?: string };
  items?: StatementItem[];
  invoiceBalance: number;
  paymentEvents: StatementPayment[];
  returnEvents: StatementReturn[];
}

const emptyForm = {
  customerType: 'individual',
  name: '',
  customerCategory: '',
  companyName: '',
  contactName: '',
  phone: '',
  country: 'Таджикистан',
  region: '',
  city: '',
  address: '',
  notes: '',
};

const sectionTabClassName = ({ isActive }: { isActive: boolean }) =>
  [
    'inline-flex items-center rounded-2xl px-4 py-2 text-sm font-medium transition-all',
    isActive ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100',
  ].join(' ');

const getCustomerEfficiencyMetrics = (customer: Customer) => {
  const totalInvoiced = Number(customer.total_invoiced || 0);
  const totalPaid = Number(customer.total_paid || 0);
  const balance = Number(customer.balance || 0);
  const paymentEfficiency = totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : 0;

  let label = 'Риск';
  let className = 'bg-rose-100 text-rose-700';

  if (paymentEfficiency >= 95 && balance <= 0) {
    label = 'Сильный';
    className = 'bg-emerald-100 text-emerald-700';
  } else if (paymentEfficiency >= 75) {
    label = 'Нормальный';
    className = 'bg-amber-100 text-amber-700';
  }

  return {
    paymentEfficiency,
    label,
    className,
  };
};

export default function CustomerView() {
  const location = useLocation();
  const user = useMemo(() => getCurrentUser(), []);
  const isAdmin = isAdminUser(user);
  const pageSize = 6;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [segmentFilter, setSegmentFilter] = useState('all');
  const [sortBy, setSortBy] = useState('strength');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [isInvoiceDetailsOpen, setIsInvoiceDetailsOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<StatementInvoice | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [statementData, setStatementData] = useState<StatementInvoice[]>([]);
  const [formData, setFormData] = useState(emptyForm);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAYMENT_EPSILON = 0.01;
  const customerCategories = useMemo(
    () =>
      Array.from(
        new Set(
          customers
            .map((customer) => String(customer.customerCategory || '').trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b, 'ru')),
    [customers],
  );
  const formatMoneyByRole = (value: unknown, trimCurrency = false) => {
    if (!isAdmin) {
      return 'Скрыто';
    }

    const formatted = formatMoney(value);
    return trimCurrency ? formatted.replace(' TJS', '') : formatted;
  };

  const closeCustomerModal = () => {
    setIsModalOpen(false);
    setSelectedCustomer(null);
    setFormData(emptyForm);
  };

  const closeStatementModal = () => {
    setIsStatementOpen(false);
    setIsInvoiceDetailsOpen(false);
    setSelectedInvoice(null);
    setStatementData([]);
    setSelectedCustomer(null);
  };

  const closeInvoiceDetailsModal = () => {
    setIsInvoiceDetailsOpen(false);
    setSelectedInvoice(null);
  };

  useEffect(() => {
    fetchCustomers();
  }, [location.key]);

  useEffect(() => {
    const handleWindowFocus = () => {
      fetchCustomers();
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, []);

  useEffect(() => {
    if (!isModalOpen && !isStatementOpen && !isInvoiceDetailsOpen && !showDeleteConfirm) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (showDeleteConfirm) {
        setShowDeleteConfirm(false);
        setSelectedCustomer(null);
        return;
      }

      if (isInvoiceDetailsOpen) return closeInvoiceDetailsModal();
      if (isStatementOpen) return closeStatementModal();
      if (isModalOpen) return closeCustomerModal();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInvoiceDetailsOpen, isModalOpen, isStatementOpen, showDeleteConfirm]);

  const fetchCustomers = async () => {
    try {
      const data = await getCustomers();
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Ошибка при загрузке клиентов');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      name: formData.name.trim(),
      customerCategory: formData.customerCategory.trim(),
      companyName: formData.companyName.trim(),
      contactName: formData.contactName.trim(),
      phone: formData.phone.trim(),
      country: formData.country.trim() || 'Таджикистан',
      region: formData.region.trim(),
      city: formData.city.trim(),
      address: formData.address.trim(),
      notes: formData.notes.trim(),
    };

    const resolvedName = payload.customerType === 'company'
      ? payload.companyName || payload.contactName || payload.name
      : payload.contactName || payload.name;

    if (!resolvedName) {
      toast.error('Введите название клиента');
      return;
    }

    try {
      if (selectedCustomer) {
        await updateCustomer(selectedCustomer.id, payload);
        toast.success('Клиент обновлен');
      } else {
        await createCustomer(payload);
        toast.success('Клиент добавлен');
      }

      closeCustomerModal();
      fetchCustomers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Ошибка при сохранении');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Вы уверены?')) return;

    try {
      await deleteCustomer(id);
      toast.success('Клиент удален');
      fetchCustomers();
    } catch {
      toast.error('Ошибка при удалении');
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!selectedCustomer) return;

    try {
      await deleteCustomer(selectedCustomer.id);
      toast.success('Клиент удален');
      setShowDeleteConfirm(false);
      setSelectedCustomer(null);
      fetchCustomers();
    } catch {
      toast.error('Ошибка при удалении');
    }
  };

  const openStatement = async (customer: Customer) => {
    setSelectedCustomer(customer);

    try {
      const res = await client.get(`/customers/${customer.id}/history`);
      setStatementData(Array.isArray(res.data) ? res.data : []);
      setIsStatementOpen(true);
    } catch {
      toast.error('Ошибка при загрузке истории клиента');
    }
  };

  const openInvoiceDetails = (invoice: StatementInvoice) => {
    setSelectedInvoice(invoice);
    setIsInvoiceDetailsOpen(true);
  };

  const getInvoiceSubtotal = (invoice: StatementInvoice) =>
    Array.isArray(invoice?.items)
      ? invoice.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.sellingPrice || 0), 0)
      : Number(invoice?.totalAmount || 0);

  const getInvoiceDiscountAmount = (invoice: StatementInvoice) => {
    const subtotal = getInvoiceSubtotal(invoice);
    const discount = Number(invoice?.discount || 0);
    return subtotal * (discount / 100);
  };

  const getInvoiceNetAmount = (invoice: StatementInvoice) => {
    const subtotal = getInvoiceSubtotal(invoice);
    const discountAmount = getInvoiceDiscountAmount(invoice);
    const returnedAmount = Number(invoice?.returnedAmount || 0);
    const calculatedNet = subtotal - discountAmount - returnedAmount;
    const storedNet = Number(invoice?.netAmount || 0);

    if (Math.abs(calculatedNet - storedNet) <= PAYMENT_EPSILON) {
      return storedNet;
    }

    return Math.max(0, calculatedNet);
  };

  const getInvoiceChangeAmount = (invoice: StatementInvoice) => {
    const change = Math.max(0, Number(invoice?.paidAmount || 0)) - getInvoiceNetAmount(invoice);
    return change > PAYMENT_EPSILON ? change : 0;
  };

  const getInvoiceAppliedPaidAmount = (invoice: StatementInvoice) =>
    Math.max(0, Math.max(0, Number(invoice?.paidAmount || 0)) - getInvoiceChangeAmount(invoice));

  const normalizeDisplayBaseUnit = (value: unknown) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return 'шт';
    if (['штук', 'штука', 'штуки', 'шт', 'pcs', 'piece', 'pieces'].includes(normalized)) {
      return 'шт';
    }
    return normalized;
  };

  const normalizeDisplayPackageName = (value: unknown) => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized || 'уп';
  };

  const getInvoiceItemQuantityParts = (item: StatementItem) => {
    const packageQuantity = Math.max(0, Number(item?.packageQuantity || 0));
    const extraUnitQuantity = Math.max(0, Number(item?.extraUnitQuantity || 0));
    const unitsPerPackage = Math.max(0, Number(item?.unitsPerPackageSnapshot ?? item?.unitsPerPackage ?? 0));
    const packageName = normalizeDisplayPackageName(item?.packageNameSnapshot || item?.packageName);
    const baseUnitName = normalizeDisplayBaseUnit(item?.baseUnitNameSnapshot || item?.baseUnitName || 'шт');

    if (packageQuantity > 0 && unitsPerPackage > 0) {
      const packagedUnits = packageQuantity * unitsPerPackage;
      let secondary = `${formatCount(packageQuantity)}*${formatCount(unitsPerPackage)}=${formatCount(packagedUnits)} ${baseUnitName}`;
      if (extraUnitQuantity > 0) {
        secondary += ` +${formatCount(extraUnitQuantity)} ${baseUnitName}`;
      }
      return {
        primary: `${formatCount(packageQuantity)} ${packageName}`,
        secondary,
      };
    }

    const totalBaseUnits = Math.max(0, Number(item?.totalBaseUnits ?? item?.quantity ?? 0));
    return {
      primary: `${formatCount(totalBaseUnits)} ${baseUnitName}`,
      secondary: '',
    };
  };

  const handlePrintInvoiceDirect = async (invoice: StatementInvoice) => {
    try {
      const res = await client.get(`/invoices/${invoice.id}`);
      const fullInvoice = res.data;
      const statusLabel = fullInvoice?.cancelled
        ? 'Отменена'
        : fullInvoice?.status === 'paid'
          ? 'Оплачено'
          : Number(fullInvoice?.paidAmount || 0) > PAYMENT_EPSILON
            ? 'Частично оплачено'
            : 'Не оплачено';

      const { printSalesInvoice } = await import('../utils/print/salesInvoicePrint');
      const result = printSalesInvoice({
        invoice: fullInvoice,
        statusLabel,
        subtotal: getInvoiceSubtotal(fullInvoice),
        discountAmount: getInvoiceDiscountAmount(fullInvoice),
        netAmount: getInvoiceNetAmount(fullInvoice),
        appliedPaidAmount: getInvoiceAppliedPaidAmount(fullInvoice),
        changeAmount: getInvoiceChangeAmount(fullInvoice),
        balanceAmount: fullInvoice.invoiceBalance || 0,
      });

      if (!result.ok && result.reason === 'blocked') {
        toast.error('Разрешите всплывающие окна для печати накладной');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || '?????? ??? ?????????? ??????');
    }
  };

  const handlePrintInvoice = async (invoice: StatementInvoice) => {
    if (!selectedCustomer) {
      return;
    }

    const { printCustomerInvoice } = await import('../utils/print/customerInvoicePrint');
    const result = printCustomerInvoice({
      invoice,
      customer: selectedCustomer,
      statusLabel: invoice.status === 'paid' ? 'Оплачено' : invoice.invoiceBalance > PAYMENT_EPSILON ? 'Есть долг' : 'Закрыто',
      subtotal: getInvoiceSubtotal(invoice),
      discountAmount: getInvoiceDiscountAmount(invoice),
      netAmount: getInvoiceNetAmount(invoice),
      appliedPaidAmount: getInvoiceAppliedPaidAmount(invoice),
      changeAmount: getInvoiceChangeAmount(invoice),
    });

    if (!result.ok && result.reason === 'blocked') {
      toast.error('Разрешите всплывающие окна для печати накладной');
    }
  };

  const filteredCustomers = customers.filter((customer) =>
    (customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone?.includes(searchTerm)) &&
    (segmentFilter === 'all' || customer.customer_segment === segmentFilter),
  );

  const segmentRank: Record<string, number> = {
    VIP: 4,
    Постоянный: 3,
    Обычный: 2,
    Новый: 1,
  };

  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    if (sortBy === 'amount') {
      return Number(b.total_invoiced || 0) - Number(a.total_invoiced || 0);
    }

    if (sortBy === 'invoices') {
      return Number(b.invoice_count || 0) - Number(a.invoice_count || 0);
    }

    if (sortBy === 'balance') {
      return Number(b.balance || 0) - Number(a.balance || 0);
    }

    if (sortBy === 'lastPurchase') {
      return new Date(b.last_purchase_at || 0).getTime() - new Date(a.last_purchase_at || 0).getTime();
    }

    const rankDiff = (segmentRank[b.customer_segment || ''] || 0) - (segmentRank[a.customer_segment || ''] || 0);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    const amountDiff = Number(b.total_invoiced || 0) - Number(a.total_invoiced || 0);
    if (amountDiff !== 0) {
      return amountDiff;
    }

    return Number(b.invoice_count || 0) - Number(a.invoice_count || 0);
  });

  const segmentTone: Record<string, string> = {
    VIP: 'bg-violet-100 text-violet-700',
    Постоянный: 'bg-sky-100 text-sky-700',
    Обычный: 'bg-emerald-100 text-emerald-700',
    Новый: 'bg-amber-100 text-amber-700',
  };

  const totalPages = Math.max(1, Math.ceil(sortedCustomers.length / pageSize));
  const paginatedCustomers = useMemo(
    () => sortedCustomers.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, sortedCustomers],
  );
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, segmentFilter, sortBy]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="app-page-shell">
      <div className="w-full space-y-6">
        <div className="app-surface app-surface-header">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-4xl font-medium tracking-tight text-slate-900">Клиенты</h1>
                <p className="mt-1 text-slate-500">Только накладные формируют историю операций и баланс клиента.</p>
              </div>
              <button
                onClick={() => {
                  setSelectedCustomer(null);
                  setFormData(emptyForm);
                  setIsModalOpen(true);
                }}
                className="flex items-center justify-center space-x-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition-all hover:bg-slate-800"
              >
                <Plus size={18} />
                <span>Новый клиент</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-2 rounded-[24px] bg-slate-100 p-2">
              <NavLink to="/customers" end className={sectionTabClassName}>
                База клиентов
              </NavLink>
              <NavLink to="/customers/debts" className={sectionTabClassName}>
                Долги и оплаты
              </NavLink>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-white bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <div className="mb-3 flex flex-col gap-3 md:flex-row">
              <select
                value={segmentFilter}
                onChange={(e) => setSegmentFilter(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-[#f7f8fc] px-4 py-3 text-sm text-slate-700 outline-none transition-all focus:border-slate-400 focus:bg-white md:max-w-60"
              >
                <option value="all">Все категории</option>
                <option value="VIP">VIP</option>
                <option value="Постоянный">Постоянный</option>
                <option value="Обычный">Обычный</option>
                <option value="Новый">Новый</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-[#f7f8fc] px-4 py-3 text-sm text-slate-700 outline-none transition-all focus:border-slate-400 focus:bg-white md:max-w-65"
              >
                <option value="strength">Сильные сверху</option>
                <option value="invoices">По числу накладных</option>
                {isAdmin && <option value="amount">По сумме покупок</option>}
                {isAdmin && <option value="balance">По долгу</option>}
                <option value="lastPurchase">По последней покупке</option>
              </select>
            </div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Поиск по имени или телефону..."
                className="w-full rounded-2xl border border-slate-200 bg-[#f7f8fc] py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition-all focus:border-slate-400 focus:bg-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2 2xl:grid-cols-3">
            {paginatedCustomers.map((customer) => (
              <motion.div layout key={customer.id} className="h-full">
                <Card className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white shadow-sm transition-all duration-300 group hover:-translate-y-1 hover:shadow-lg">
                  <div className="mb-6 flex items-start justify-between">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 transition-colors duration-300 group-hover:bg-sky-500 group-hover:text-white">
                      <User size={28} strokeWidth={2.2} />
                    </div>
                    <div className="flex space-x-1">
                      <button
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setFormData({
                            customerType: customer.customerType || 'individual',
                            name: customer.name || '',
                            customerCategory: customer.customerCategory || '',
                            companyName: customer.companyName || '',
                            contactName: customer.contactName || '',
                            phone: customer.phone || '',
                            country: customer.country || 'Таджикистан',
                            region: customer.region || '',
                            city: customer.city || '',
                            address: customer.address || '',
                            notes: customer.notes || '',
                          });
                          setIsModalOpen(true);
                        }}
                        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setShowDeleteConfirm(true);
                        }}
                        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  <h3 className="mb-3 wrap-break-word text-xl font-medium leading-7 text-slate-900">{customer.name}</h3>
                  {customer.customerCategory && (
                    <p className="mb-3 inline-flex max-w-full rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {customer.customerCategory}
                    </p>
                  )}
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${segmentTone[customer.customer_segment || ''] || 'bg-slate-100 text-slate-600'}`}>
                      {customer.customer_segment || 'Новый'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getCustomerEfficiencyMetrics(customer).className}`}>
                        {getCustomerEfficiencyMetrics(customer).label}
                      </span>
                      <span className="text-xs text-slate-400">
                        Накладных: {formatCount(customer.invoice_count || 0)}
                      </span>
                    </div>
                  </div>
                  {customer.last_purchase_at && (
                    <p className="mb-4 text-xs text-slate-400">
                      Последняя покупка: {new Date(customer.last_purchase_at).toLocaleDateString('ru-RU')}
                    </p>
                  )}
                  <div className="mb-6 space-y-3">
                    <div className="flex items-start text-sm text-slate-500">
                      <Phone size={14} className="mr-2" /> {customer.phone || 'Нет телефона'}
                    </div>
                    <div className="flex items-center text-sm text-slate-500">
                      <MapPin size={14} className="mr-2" /> {customer.address || 'Нет адреса'}
                    </div>
                  </div>

                  <div className="mb-6 grid grid-cols-1 gap-3 rounded-2xl bg-[#f4f5fb] p-4 lg:grid-cols-4">
                    <div className="min-w-0 rounded-2xl border border-sky-100 bg-sky-50 px-3 py-3">
                      <p className="mb-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">Накладные</p>
                      <p className="whitespace-nowrap text-[10px] leading-4 tabular-nums text-slate-900 xl:text-[11px]">{formatMoneyByRole(customer.total_invoiced, true)}</p>
                    </div>
                    <div className="min-w-0 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3">
                      <p className="mb-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">Оплачено</p>
                      <p className="whitespace-nowrap text-[10px] leading-4 tabular-nums text-emerald-600 xl:text-[11px]">{formatMoneyByRole(customer.total_paid, true)}</p>
                    </div>
                    <div className="min-w-0 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3">
                      <p className="mb-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">Долг</p>
                      <p className={`whitespace-nowrap text-[10px] leading-4 tabular-nums xl:text-[11px] ${isAdmin && customer.balance > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{formatMoneyByRole(customer.balance, true)}</p>
                    </div>
                    <div className="min-w-0 rounded-2xl border border-violet-100 bg-violet-50 px-3 py-3">
                      <p className="mb-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">Эффективность</p>
                      <p className="whitespace-nowrap text-[10px] leading-4 tabular-nums text-violet-700 xl:text-[11px]">
                        {isAdmin ? formatPercent(getCustomerEfficiencyMetrics(customer).paymentEfficiency, 1) : 'Скрыто'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => openStatement(customer)}
                    className="mt-auto flex w-full items-center justify-center space-x-2 rounded-2xl border border-violet-200 bg-violet-50 py-3 text-sm font-medium text-violet-700 transition-all hover:border-violet-300 hover:bg-violet-100"
                  >
                    <FileText size={16} />
                    <span>Накладные клиента</span>
                  </button>
                </Card>
              </motion.div>
            ))}
          </div>

          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={sortedCustomers.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
          />
        </div>

        <ConfirmationModal
          isOpen={showDeleteConfirm}
          title="Удалить клиента?"
          message={selectedCustomer ? `Клиент "${selectedCustomer.name}" будет скрыт из активного списка.` : 'Клиент будет скрыт из активного списка.'}
          confirmText="Удалить"
          cancelText="Отмена"
          onConfirm={handleDeleteConfirmed}
          onClose={() => {
            setShowDeleteConfirm(false);
            setSelectedCustomer(null);
          }}
        />

        <AnimatePresence>
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeCustomerModal}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-t-4xl bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-[2.5rem]"
              >
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-4 sm:px-10 sm:py-8">
                  <h2 className="text-2xl font-medium tracking-tight text-slate-900">
                    {selectedCustomer ? 'Редактировать клиента' : 'Новый клиент'}
                  </h2>
                  <button onClick={closeCustomerModal} className="rounded-xl p-2 transition-colors hover:bg-white">
                    <X />
                  </button>
                </div>
                <form onSubmit={handleSave} className="flex-1 space-y-4 overflow-y-auto p-4 sm:space-y-6 sm:p-10">
                  <div className="space-y-2">
                    <label className="ml-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">Тип клиента</label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, customerType: 'individual', companyName: '' })}
                        className={`rounded-2xl border px-5 py-4 text-sm font-medium transition-all ${formData.customerType === 'individual' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                      >
                        Частное лицо
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, customerType: 'company' })}
                        className={`rounded-2xl border px-5 py-4 text-sm font-medium transition-all ${formData.customerType === 'company' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                      >
                        Компания
                      </button>
                    </div>
                  </div>

                  {formData.customerType === 'company' && (
                    <div className="space-y-2">
                      <label className="ml-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">Название компании</label>
                      <input
                        required
                        className="w-full rounded-2xl bg-slate-50 px-6 py-4 outline-none transition-all focus:ring-4 focus:ring-slate-500/10"
                        value={formData.companyName}
                        onChange={(e) => setFormData({ ...formData, companyName: e.target.value, name: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="ml-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">
                      {formData.customerType === 'company' ? 'Контактное лицо' : 'Имя клиента'}
                    </label>
                    <input
                      required={formData.customerType !== 'company'}
                      className="w-full rounded-2xl bg-slate-50 px-6 py-4 outline-none transition-all focus:ring-4 focus:ring-slate-500/10"
                      value={formData.customerType === 'company' ? formData.contactName : formData.name}
                      onChange={(e) =>
                        setFormData(
                          formData.customerType === 'company'
                            ? { ...formData, contactName: e.target.value }
                            : { ...formData, name: e.target.value, contactName: e.target.value },
                        )
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="ml-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">Категория клиента</label>
                    <input
                      list="customer-category-options"
                      className="w-full rounded-2xl bg-slate-50 px-6 py-4 outline-none transition-all focus:ring-4 focus:ring-slate-500/10"
                      value={formData.customerCategory}
                      onChange={(e) => setFormData({ ...formData, customerCategory: e.target.value })}
                      placeholder="Например: VIP, Оптовик, Магазин, Партнер"
                    />
                    <datalist id="customer-category-options">
                      {customerCategories.map((category) => (
                        <option key={category} value={category} />
                      ))}
                    </datalist>
                  </div>

                  <div className="space-y-2">
                    <label className="ml-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">Телефон</label>
                    <input
                      className="w-full rounded-2xl bg-slate-50 px-6 py-4 outline-none transition-all focus:ring-4 focus:ring-slate-500/10"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="ml-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">Регион</label>
                      <input
                        className="w-full rounded-2xl bg-slate-50 px-6 py-4 outline-none transition-all focus:ring-4 focus:ring-slate-500/10"
                        value={formData.region}
                        onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="ml-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">Город</label>
                      <input
                        className="w-full rounded-2xl bg-slate-50 px-6 py-4 outline-none transition-all focus:ring-4 focus:ring-slate-500/10"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="ml-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">Адрес</label>
                    <input
                      className="w-full rounded-2xl bg-slate-50 px-6 py-4 outline-none transition-all focus:ring-4 focus:ring-slate-500/10"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="ml-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">Заметки</label>
                    <textarea
                      className="min-h-25 w-full rounded-2xl bg-slate-50 px-6 py-4 outline-none transition-all focus:ring-4 focus:ring-slate-500/10"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    />
                  </div>
                  <button type="submit" className="w-full rounded-2xl bg-slate-900 py-5 text-white transition-all hover:bg-slate-800">
                    Сохранить
                  </button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isStatementOpen && selectedCustomer && (
            <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeStatementModal}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
                className="relative flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-4xl bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-[3rem]"
              >
                <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-4 sm:px-10 sm:py-10">
                  <div className="mb-5 flex items-start justify-between gap-4 sm:mb-6">
                    <div>
                      <h2 className="text-3xl font-medium tracking-tight text-slate-900">{selectedCustomer.name}</h2>
                      <p className="mt-1 text-slate-500">История и баланс строятся только по накладным.</p>
                    </div>
                    <button onClick={closeStatementModal} className="rounded-2xl p-3 shadow-sm transition-colors hover:bg-white">
                      <X />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-6">
                    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                      <p className="mb-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">Всего по накладным</p>
                      <p className="text-lg font-medium text-slate-900 md:text-xl">{formatMoneyByRole(selectedCustomer.total_invoiced)}</p>
                    </div>
                    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                      <p className="mb-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">Всего оплачено</p>
                      <p className="text-xl font-medium text-emerald-600">{formatMoneyByRole(selectedCustomer.total_paid)}</p>
                    </div>
                    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                      <p className="mb-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">Текущий долг</p>
                      <p className="text-xl font-medium text-rose-600">{formatMoneyByRole(selectedCustomer.balance)}</p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-10">
                  <div className="space-y-3">
                    {statementData.length === 0 && (
                      <div className="rounded-3xl bg-slate-50 p-8 text-center text-sm text-slate-500">
                        У клиента пока нет накладных.
                      </div>
                    )}

                    {statementData.map((invoice) => (
                      <div
                        key={invoice.id}
                        onClick={() => openInvoiceDetails(invoice)}
                        className="flex cursor-pointer flex-col items-start gap-4 rounded-3xl bg-slate-50 p-4 transition-colors hover:bg-slate-100 sm:flex-row sm:items-center sm:justify-between md:rounded-3xl md:p-6"
                      >
                        <div className="flex w-full min-w-0 items-center space-x-4 md:space-x-6">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 md:h-14 md:w-14">
                            <FileText size={20} />
                          </div>
                          <div>
                            <p className="text-base font-medium text-slate-900 md:text-lg">Накладная #{invoice.id}</p>
                            <p className="text-xs text-slate-400 md:text-sm">
                              {new Date(invoice.createdAt).toLocaleDateString('ru-RU', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              Оплаты: {formatCount(invoice.paymentEvents?.length || 0)} · Возвраты: {formatCount(invoice.returnEvents?.length || 0)}
                            </p>
                          </div>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              handlePrintInvoiceDirect(invoice);
                            }}
                            className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700 transition-all hover:bg-indigo-100"
                          >
                            <Printer size={16} />
                            <span>Печать</span>
                          </button>
                        </div>
                        <div className="w-full text-left sm:w-auto sm:text-right">
                          <p className="text-lg font-medium text-slate-900 md:text-xl">{formatMoneyByRole(invoice.netAmount)}</p>
                          <div className="mt-1.5 flex justify-end">
                            <Badge variant={invoice.status === 'paid' ? 'success' : invoice.invoiceBalance > 0 ? 'warning' : 'default'}>
                              {invoice.status === 'paid' ? 'Оплачено' : invoice.invoiceBalance > 0 ? 'Есть долг' : 'Закрыто'}
                            </Badge>
                          </div>
                          <p className="mt-1.5 text-[11px] text-slate-500">Остаток: {formatMoneyByRole(invoice.invoiceBalance)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isInvoiceDetailsOpen && selectedInvoice && (
            <div className="fixed inset-0 z-60 flex items-end justify-center p-3 sm:items-center sm:p-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeInvoiceDetailsModal}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-4xl bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-[2.5rem]"
              >
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-5 sm:p-8">
                  <h3 className="text-2xl font-medium text-slate-900">Накладная #{selectedInvoice.id}</h3>
                  <button onClick={closeInvoiceDetailsModal} className="rounded-xl p-2 transition-colors hover:bg-white">
                    <X />
                  </button>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto p-5 sm:p-8">
                  <div className="flex flex-col gap-1 text-sm text-slate-500 sm:flex-row sm:justify-between">
                    <span>Дата: {new Date(selectedInvoice.createdAt).toLocaleString('ru-RU')}</span>
                    <span>Склад: {selectedInvoice.warehouse?.name || '---'}</span>
                  </div>

                  <div className="space-y-4">
                    {selectedInvoice.items?.map((item) => {
                      const quantityInfo = getInvoiceItemQuantityParts(item);

                      return (
                        <div key={item.id} className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-medium text-slate-900">{item.product?.name}</p>
                            <p className="whitespace-nowrap text-xs font-medium text-slate-700">{quantityInfo.primary}</p>
                            <p className="mt-0.5 whitespace-nowrap text-[10px] text-slate-400">
                              {quantityInfo.secondary || ''}
                            </p>
                            <p className="whitespace-nowrap text-[10px] text-slate-400">x {formatMoney(item.sellingPrice)}</p>
                            {Number(item.returnedQty || 0) > 0 && (
                              <p className="mt-1 text-xs text-amber-600">Возвращено: {formatCount(item.returnedQty || 0)}</p>
                            )}
                          </div>
                          <p className="font-medium text-slate-900">{formatMoney(Number(item.quantity || 0) * Number(item.sellingPrice || 0))}</p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-2 border-t border-slate-100 pt-6">
                    <div className="flex justify-between text-sm text-slate-500">
                      <span>Сумма</span>
                      <span>{formatMoneyByRole(selectedInvoice.totalAmount)}</span>
                    </div>
                    {Number(selectedInvoice.discount || 0) > 0 && (
                      <div className="flex justify-between text-sm text-rose-500">
                        <span>Скидка ({selectedInvoice.discount}%)</span>
                        <span>-{formatMoneyByRole((Number(selectedInvoice.totalAmount || 0) * Number(selectedInvoice.discount || 0)) / 100)}</span>
                      </div>
                    )}
                    {Number(selectedInvoice.returnedAmount || 0) > 0 && (
                      <div className="flex justify-between text-sm text-amber-600">
                        <span>Возвраты</span>
                        <span>-{formatMoneyByRole(selectedInvoice.returnedAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 text-lg font-medium text-slate-900 md:text-xl">
                      <span>Итого</span>
                      <span>{formatMoneyByRole(selectedInvoice.netAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-emerald-600">
                      <span>Оплачено</span>
                      <span>{formatMoneyByRole(getInvoiceAppliedPaidAmount(selectedInvoice))}</span>
                    </div>
                    <div className="flex justify-between text-sm text-rose-600">
                      <span>Остаток</span>
                      <span>{formatMoneyByRole(selectedInvoice.invoiceBalance)}</span>
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-slate-100 pt-6">
                    <h4 className="text-sm font-medium text-slate-900">Оплаты по накладной</h4>
                    {selectedInvoice.paymentEvents?.length ? (
                      selectedInvoice.paymentEvents.map((payment) => (
                        <div key={payment.id} className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-emerald-700">{formatMoneyByRole(payment.amount)}</p>
                            <p className="text-xs text-emerald-600">
                              {new Date(payment.createdAt).toLocaleString('ru-RU')} · {payment.staff_name}
                            </p>
                          </div>
                          <span className="text-xs uppercase tracking-wider text-emerald-600">{payment.method}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 md:text-sm">Оплат по этой накладной нет.</p>
                    )}
                  </div>

                  <div className="space-y-3 border-t border-slate-100 pt-6">
                    <h4 className="text-sm font-medium text-slate-900">Возвраты по накладной</h4>
                    {selectedInvoice.returnEvents?.length ? (
                      selectedInvoice.returnEvents.map((itemReturn) => (
                        <div key={itemReturn.id} className="rounded-2xl bg-amber-50 px-4 py-3">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm font-medium text-amber-700">{formatMoneyByRole(itemReturn.totalValue)}</p>
                            <p className="text-xs text-amber-600">{new Date(itemReturn.createdAt).toLocaleString('ru-RU')}</p>
                          </div>
                          <p className="mt-1 text-xs text-amber-700">{itemReturn.staff_name}</p>
                          {itemReturn.reason && <p className="mt-1 text-xs text-amber-600">{itemReturn.reason}</p>}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 md:text-sm">Возвратов по этой накладной нет.</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 bg-slate-50 p-5 sm:p-8">
                  <button
                    onClick={() => handlePrintInvoiceDirect(selectedInvoice)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-6 py-3 text-sm font-bold text-indigo-700 transition-all hover:bg-indigo-100"
                  >
                    <Printer size={18} />
                    <span>Печать</span>
                  </button>
                  <button
                    onClick={closeInvoiceDetailsModal}
                    className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50"
                  >
                    Закрыть
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}



