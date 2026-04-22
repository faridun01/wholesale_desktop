import React, { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Printer, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Card } from '../components/UI';
import PaginationControls from '../components/common/PaginationControls';
import { getCustomerHistory, getCustomers } from '../api/customers.api';
import { formatCount, formatMoney } from '../utils/format';
import { getCurrentUser, isAdminUser } from '../utils/userAccess';
import {
  customerMatchesPaymentFilter,
  customerPaymentStatusMeta,
  getCustomerDebtTotal,
  getCustomerInvoicesByStatus,
  getCustomerPaidTotalByFilter,
  getCustomerPaidTotal,
  getCustomerPaymentStatus,
  getCustomerPurchasedTotalByFilter,
  getCustomerPurchasedTotal,
  hasCustomerPurchases,
  type DebtCustomer,
} from '../utils/customerDebt';
import { printCustomerInvoicesBatch } from '../utils/print/customerInvoicePrint';

const pageSize = 10;
const PAYMENT_EPSILON = 0.01;

type DebtFilter = 'all' | 'paid' | 'partial' | 'unpaid';

type StatementInvoice = {
  id: number;
  createdAt: string;
  totalAmount: number;
  discount: number;
  netAmount: number;
  paidAmount: number;
  returnedAmount: number;
  status?: string;
  invoiceBalance: number;
  warehouse?: { id?: number; name?: string };
  items?: any[];
  paymentEvents?: any[];
  returnEvents?: any[];
};

const getDebtFilterLabel = (filter: Exclude<DebtFilter, 'all'>) => {
  if (filter === 'paid') {
    return 'Оплачено';
  }

  if (filter === 'partial') {
    return 'Частично оплачено';
  }

  return 'Не оплачено';
};

const filterTabs: Array<{ key: DebtFilter; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'paid', label: 'Оплачено' },
  { key: 'partial', label: 'Частично оплачено' },
  { key: 'unpaid', label: 'Не оплачено' },
];

const sortOptions = [
  { value: 'debt', label: 'Сначала должники' },
  { value: 'paid', label: 'По сумме оплат' },
  { value: 'purchased', label: 'По сумме покупок' },
  { value: 'lastPurchase', label: 'По последней покупке' },
  { value: 'name', label: 'По имени' },
] as const;

type SortMode = (typeof sortOptions)[number]['value'];

const sectionTabClassName = ({ isActive }: { isActive: boolean }) =>
  [
    'inline-flex items-center rounded-2xl px-4 py-2 text-sm font-medium transition-all',
    isActive ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100',
  ].join(' ');

export default function CustomerDebtsView() {
  const user = useMemo(() => getCurrentUser(), []);
  const isAdmin = isAdminUser(user);
  const [customers, setCustomers] = useState<DebtCustomer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<DebtFilter>('all');
  const [sortBy, setSortBy] = useState<SortMode>('debt');
  const [currentPage, setCurrentPage] = useState(1);
  const [isExportingInvoices, setIsExportingInvoices] = useState(false);
  const [customerHistories, setCustomerHistories] = useState<Record<number, StatementInvoice[]>>({});

  const formatMoneyByRole = (value: unknown) => {
    if (!isAdmin) {
      return 'Скрыто';
    }

    return formatMoney(value);
  };

  const fetchCustomers = async () => {
    try {
      const data = await getCustomers({ force: true });
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Ошибка при загрузке клиентов');
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    const handleWindowFocus = () => {
      fetchCustomers();
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, []);

  const customersWithPurchases = useMemo(
    () => customers.filter((customer) => hasCustomerPurchases(customer)),
    [customers],
  );

  const filteredCustomers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return customersWithPurchases.filter((customer) => {
      const matchesSearch =
        !normalizedSearch ||
        String(customer.name || '').toLowerCase().includes(normalizedSearch) ||
        String(customer.phone || '').includes(normalizedSearch);

      if (!matchesSearch) {
        return false;
      }

      if (statusFilter === 'all' || !isAdmin) {
        return true;
      }

      return customerMatchesPaymentFilter(customer, statusFilter);
    });
  }, [customersWithPurchases, isAdmin, searchTerm, statusFilter]);

  const searchMatchedCustomers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return customersWithPurchases.filter((customer) => {
      if (!normalizedSearch) {
        return true;
      }

      return (
        String(customer.name || '').toLowerCase().includes(normalizedSearch) ||
        String(customer.phone || '').includes(normalizedSearch)
      );
    });
  }, [customersWithPurchases, searchTerm]);

  const filterCounts = useMemo(
    () => ({
      all: customersWithPurchases.length,
      paid: customersWithPurchases.filter((customer) => customerMatchesPaymentFilter(customer, 'paid')).length,
      partial: customersWithPurchases.filter((customer) => customerMatchesPaymentFilter(customer, 'partial')).length,
      unpaid: customersWithPurchases.filter((customer) => customerMatchesPaymentFilter(customer, 'unpaid')).length,
    }),
    [customersWithPurchases],
  );

  const sortedCustomers = useMemo(() => {
    return [...filteredCustomers].sort((a, b) => {
      if (statusFilter !== 'all') {
        const matchingInvoiceDiff = getCustomerInvoicesByStatus(b, statusFilter) - getCustomerInvoicesByStatus(a, statusFilter);
        if (matchingInvoiceDiff !== 0) {
          return matchingInvoiceDiff;
        }
      }

      if (sortBy === 'name') {
        return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
      }

      if (sortBy === 'paid') {
        return getCustomerPaidTotal(b) - getCustomerPaidTotal(a);
      }

      if (sortBy === 'purchased') {
        return getCustomerPurchasedTotal(b) - getCustomerPurchasedTotal(a);
      }

      if (sortBy === 'lastPurchase') {
        return new Date(b.last_purchase_at || 0).getTime() - new Date(a.last_purchase_at || 0).getTime();
      }

      const debtDiff = getCustomerDebtTotal(b) - getCustomerDebtTotal(a);
      if (debtDiff !== 0) {
        return debtDiff;
      }

      return getCustomerPurchasedTotal(b) - getCustomerPurchasedTotal(a);
    });
  }, [filteredCustomers, sortBy, statusFilter]);

  const summary = useMemo(() => {
    if (statusFilter === 'all') {
      return filteredCustomers.reduce(
        (acc, customer) => {
          acc.totalDebt += getCustomerDebtTotal(customer);
          acc.totalPaid += getCustomerPaidTotal(customer);

          if (customerMatchesPaymentFilter(customer, 'paid')) {
            acc.fullyPaidCount += 1;
          }

          if (customerMatchesPaymentFilter(customer, 'partial')) {
            acc.partialCount += 1;
          }

          if (customerMatchesPaymentFilter(customer, 'unpaid')) {
            acc.unpaidCount += 1;
          }

          return acc;
        },
        {
          totalDebt: 0,
          totalPaid: 0,
          fullyPaidCount: 0,
          partialCount: 0,
          unpaidCount: 0,
        },
      );
    }

    return filteredCustomers.reduce(
      (acc, customer) => {
        const purchasedTotal = getCustomerPurchasedTotalByFilter(customer, statusFilter);
        const paidTotal = getCustomerPaidTotalByFilter(customer, statusFilter);
        const debtTotal = Math.max(0, purchasedTotal - paidTotal);

        acc.totalDebt += debtTotal;
        acc.totalPaid += paidTotal;

        if (statusFilter === 'paid') {
          acc.fullyPaidCount += 1;
        } else if (statusFilter === 'partial') {
          acc.partialCount += 1;
        } else {
          acc.unpaidCount += 1;
        }

        return acc;
      },
      {
        totalDebt: 0,
        totalPaid: 0,
        fullyPaidCount: 0,
        partialCount: 0,
        unpaidCount: 0,
      },
    );
  }, [filteredCustomers, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(sortedCustomers.length / pageSize));
  const paginatedCustomers = useMemo(
    () => sortedCustomers.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, sortedCustomers],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, sortBy]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!isAdmin || paginatedCustomers.length === 0) {
      return;
    }

    let isCancelled = false;

    const fetchVisibleHistories = async () => {
      const results = await Promise.allSettled(
        paginatedCustomers.map(async (customer) => ({
          customerId: customer.id,
          invoices: (await getCustomerHistory(customer.id)) as StatementInvoice[],
        })),
      );

      if (isCancelled) {
        return;
      }

      setCustomerHistories((prev) => {
        const next = { ...prev };
        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            next[result.value.customerId] = Array.isArray(result.value.invoices) ? result.value.invoices : [];
          }
        });
        return next;
      });
    };

    fetchVisibleHistories();

    return () => {
      isCancelled = true;
    };
  }, [isAdmin, paginatedCustomers]);

  const getInvoiceSubtotal = (invoice: StatementInvoice) => {
    const storedTotal = Number(invoice?.totalAmount || 0);
    const itemsSubtotal = Array.isArray(invoice?.items)
      ? invoice.items.reduce((sum: number, item: any) => {
          const quantity = Number(item?.quantity || 0);
          const price = Number(item?.sellingPrice ?? item?.totalPrice ?? 0);
          return sum + quantity * price;
        }, 0)
      : 0;

    if (itemsSubtotal > PAYMENT_EPSILON) {
      return itemsSubtotal;
    }

    return storedTotal;
  };

  const getInvoiceDiscountAmount = (invoice: StatementInvoice) => {
    const subtotal = getInvoiceSubtotal(invoice);
    const discount = Number(invoice?.discount || 0);
    return subtotal * (discount / 100);
  };

  const getInvoiceNetAmount = (invoice: StatementInvoice) => {
    const storedNet = Math.max(0, Number(invoice?.netAmount || 0));
    if (storedNet > PAYMENT_EPSILON) {
      return storedNet;
    }

    const subtotal = getInvoiceSubtotal(invoice);
    const discountAmount = getInvoiceDiscountAmount(invoice);
    const returnedAmount = Number(invoice?.returnedAmount || 0);
    const calculatedNet = subtotal - discountAmount - returnedAmount;

    return Math.max(0, calculatedNet);
  };

  const getInvoicePaidAmount = (invoice: StatementInvoice) => Math.max(0, Number(invoice?.paidAmount || 0));

  const getInvoiceChangeAmount = (invoice: StatementInvoice) => {
    const change = getInvoicePaidAmount(invoice) - getInvoiceNetAmount(invoice);
    return change > PAYMENT_EPSILON ? change : 0;
  };

  const getInvoiceAppliedPaidAmount = (invoice: StatementInvoice) =>
    Math.max(0, getInvoicePaidAmount(invoice) - getInvoiceChangeAmount(invoice));

  const getInvoicesDebtTotal = (invoices: StatementInvoice[]) =>
    invoices.reduce((sum, invoice) => {
      const storedBalance = Math.max(0, Number(invoice?.invoiceBalance || 0));
      if (storedBalance > PAYMENT_EPSILON) {
        return sum + storedBalance;
      }

      const computedBalance = getInvoiceNetAmount(invoice) - getInvoiceAppliedPaidAmount(invoice);
      return sum + (computedBalance > PAYMENT_EPSILON ? computedBalance : 0);
    }, 0);

  const getInvoicesNetTotal = (invoices: StatementInvoice[]) =>
    invoices.reduce((sum, invoice) => sum + getInvoiceNetAmount(invoice), 0);

  const getInvoicesPaidTotal = (invoices: StatementInvoice[]) =>
    invoices.reduce((sum, invoice) => sum + getInvoiceAppliedPaidAmount(invoice), 0);

  const getVisibleInvoicesForCustomer = (customer: DebtCustomer) => {
    const historyInvoices = customerHistories[customer.id];
    if (!Array.isArray(historyInvoices)) {
      return null;
    }

    return historyInvoices.filter((invoice) => statusFilter === 'all' || getStatementInvoiceStatus(invoice) === statusFilter);
  };

  const getStatementInvoiceStatus = (invoice: StatementInvoice): Exclude<DebtFilter, 'all'> => {
    if (String(invoice?.status || '').toLowerCase() === 'paid') {
      return 'paid';
    }

    const paidAmount = Math.max(0, Number(invoice?.paidAmount || 0));
    const balance = Math.max(0, Number(invoice?.invoiceBalance || 0));

    if (balance <= PAYMENT_EPSILON) {
      return 'paid';
    }

    if (paidAmount > PAYMENT_EPSILON) {
      return 'partial';
    }

    return 'unpaid';
  };

  const getBatchCustomerStatusLabel = (invoices: StatementInvoice[]) => {
    const uniqueStatuses = Array.from(new Set(invoices.map((invoice) => getStatementInvoiceStatus(invoice))));

    if (uniqueStatuses.length === 1) {
      return getDebtFilterLabel(uniqueStatuses[0]);
    }

    return 'Смешанные статусы';
  };

  const handlePrint = async () => {
    if (searchMatchedCustomers.length === 0) {
      toast.error('Нет клиентов для выгрузки');
      return;
    }

    setIsExportingInvoices(true);
    try {
      const selectedFilter = filterTabs.find((tab) => tab.key === statusFilter)?.label || 'Все';
      const printableCustomers = searchMatchedCustomers
        .filter((customer) => {
          if (statusFilter === 'all' || !isAdmin) {
            return true;
          }

          return customerMatchesPaymentFilter(customer, statusFilter);
        })
        .map((customer) => {
          const customerStatus = getCustomerPaymentStatus(customer);
          const purchasedTotal =
            statusFilter === 'all' ? getCustomerPurchasedTotal(customer) : getCustomerPurchasedTotalByFilter(customer, statusFilter);
          const paidTotal = statusFilter === 'all' ? getCustomerPaidTotal(customer) : getCustomerPaidTotalByFilter(customer, statusFilter);
          const debtTotal = statusFilter === 'all' ? getCustomerDebtTotal(customer) : Math.max(0, purchasedTotal - paidTotal);

          return {
            id: customer.id,
            name: customer.name || 'Без имени',
            phone: customer.phone || undefined,
            purchasedTotal,
            paidTotal,
            debtTotal,
            statusLabel:
              statusFilter === 'all'
                ? customerPaymentStatusMeta[customerStatus].label
                : getDebtFilterLabel(statusFilter),
            invoices: [],
          };
        });

      if (printableCustomers.length === 0) {
        toast.error(`По фильтру "${selectedFilter}" список пуст`);
        return;
      }

      const result = printCustomerInvoicesBatch({
        customers: printableCustomers,
        filterLabel: selectedFilter,
      });

      if (!result.ok) {
        toast.error('Не удалось подготовить печать списка');
        return;
      }
    } catch {
      toast.error('Не удалось подготовить список долгов');
    } finally {
      setIsExportingInvoices(false);
    }
  };

  return (
    <div className="app-page-shell">
      <div className="w-full space-y-6">
        <div className="app-surface app-surface-header">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-4xl font-medium tracking-tight text-slate-900">Долги и оплаты</h1>
                <p className="mt-1 text-slate-500">Финансовая аналитика по клиентам строится на основе уже оформленных накладных.</p>
                {!isAdmin && (
                  <p className="mt-2 text-sm text-amber-600">Финансовые суммы и статусы оплаты скрыты для вашей роли.</p>
                )}
              </div>
              <button
                type="button"
                onClick={handlePrint}
                disabled={isExportingInvoices || filteredCustomers.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Printer size={18} />
                <span>{isExportingInvoices ? 'Подготовка...' : 'Печать списка долгов'}</span>
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card className="rounded-[28px] border border-white shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Общий долг</p>
            <p className="mt-3 text-2xl font-medium text-rose-600">{formatMoneyByRole(summary.totalDebt)}</p>
          </Card>
          <Card className="rounded-[28px] border border-white shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Общая сумма оплат</p>
            <p className="mt-3 text-2xl font-medium text-emerald-600">{formatMoneyByRole(summary.totalPaid)}</p>
          </Card>
          <Card className="rounded-[28px] border border-white shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Оплачено</p>
            <p className="mt-3 text-2xl font-medium text-slate-900">{isAdmin ? formatCount(summary.fullyPaidCount) : 'Скрыто'}</p>
          </Card>
          <Card className="rounded-[28px] border border-white shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Частично оплачено</p>
            <p className="mt-3 text-2xl font-medium text-slate-900">{isAdmin ? formatCount(summary.partialCount) : 'Скрыто'}</p>
          </Card>
          <Card className="rounded-[28px] border border-white shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Не оплачено</p>
            <p className="mt-3 text-2xl font-medium text-slate-900">{isAdmin ? formatCount(summary.unpaidCount) : 'Скрыто'}</p>
          </Card>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-white bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <div className="mb-4 flex flex-wrap gap-2">
              {(isAdmin ? filterTabs : filterTabs.slice(0, 1)).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={
                    statusFilter === tab.key
                      ? 'inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white'
                      : 'inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50'
                  }
                >
                  <span>{tab.label}</span>
                  <span
                    className={
                      statusFilter === tab.key
                        ? 'rounded-full bg-white/15 px-1.5 py-0.5 text-[11px] font-medium text-white'
                        : 'rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500'
                    }
                  >
                    {formatCount(filterCounts[tab.key])}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3 lg:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Поиск по имени или телефону..."
                  className="w-full rounded-2xl border border-slate-200 bg-[#f7f8fc] py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition-all focus:border-slate-400 focus:bg-white"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortMode)}
                className="w-full rounded-2xl border border-slate-200 bg-[#f7f8fc] px-4 py-3 text-sm text-slate-700 outline-none transition-all focus:border-slate-400 focus:bg-white lg:max-w-64"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr className="text-left text-[9px] uppercase tracking-[0.12em] text-slate-400">
                  <th className="px-4 py-2.5 font-medium">Клиент</th>
                  <th className="px-4 py-2.5 font-medium">Склад</th>
                  <th className="px-4 py-2.5 font-medium">Телефон</th>
                  <th className="px-4 py-2.5 font-medium">Накладных</th>
                  <th className="px-4 py-2.5 font-medium">Купил всего</th>
                  <th className="px-4 py-2.5 font-medium">Оплатил всего</th>
                  <th className="px-4 py-2.5 font-medium">Долг</th>
                  <th className="px-4 py-2.5 font-medium">Последняя покупка</th>
                  <th className="px-4 py-2.5 font-medium">Статус оплаты</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-xs text-slate-500">
                      По текущим фильтрам клиентов не найдено.
                    </td>
                  </tr>
                ) : (
                  paginatedCustomers.map((customer) => {
                    const aggregateStatus = getCustomerPaymentStatus(customer);
                    const displayStatus = statusFilter === 'all' ? aggregateStatus : statusFilter;
                    const statusMeta = customerPaymentStatusMeta[displayStatus];
                    const warehouseNames =
                      Array.isArray(customer.warehouse_names) && customer.warehouse_names.length > 0
                        ? customer.warehouse_names.join(', ')
                        : '---';
                    const visibleHistoryInvoices = getVisibleInvoicesForCustomer(customer);
                    const visibleInvoiceCount =
                      visibleHistoryInvoices !== null
                        ? visibleHistoryInvoices.length
                        : statusFilter === 'all'
                          ? Number(customer.invoice_count || 0)
                          : getCustomerInvoicesByStatus(customer, statusFilter);
                    const visiblePurchasedTotal =
                      visibleHistoryInvoices !== null
                        ? getInvoicesNetTotal(visibleHistoryInvoices)
                        : getCustomerPurchasedTotalByFilter(customer, statusFilter);
                    const visiblePaidTotal =
                      visibleHistoryInvoices !== null
                        ? getInvoicesPaidTotal(visibleHistoryInvoices)
                        : getCustomerPaidTotalByFilter(customer, statusFilter);
                    const visibleDebtTotal =
                      visibleHistoryInvoices !== null
                        ? getInvoicesDebtTotal(visibleHistoryInvoices)
                        : statusFilter === 'paid'
                          ? 0
                          : getCustomerDebtTotal(customer);

                    return (
                      <tr key={customer.id} className="text-xs text-slate-700">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{customer.name}</div>
                        </td>
                        <td className="px-4 py-3">{warehouseNames}</td>
                        <td className="px-4 py-3">{customer.phone || 'Нет телефона'}</td>
                        <td className="px-4 py-3">{formatCount(visibleInvoiceCount)}</td>
                        <td className="px-4 py-3">{formatMoneyByRole(visiblePurchasedTotal)}</td>
                        <td className="px-4 py-3">{formatMoneyByRole(visiblePaidTotal)}</td>
                        <td className="px-4 py-3">
                          <span className={isAdmin && visibleDebtTotal > 0 ? 'font-medium text-rose-600' : ''}>
                            {formatMoneyByRole(visibleDebtTotal)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {customer.last_purchase_at ? new Date(customer.last_purchase_at).toLocaleDateString('ru-RU') : 'Нет покупок'}
                        </td>
                        <td className="px-4 py-3">
                          {isAdmin ? <Badge variant={statusMeta.badgeVariant}>{statusMeta.label}</Badge> : <span className="text-slate-400">Скрыто</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={sortedCustomers.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
          />
        </div>
      </div>
    </div>
  );
}
