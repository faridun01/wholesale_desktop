import React, { useState, useEffect } from 'react';
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
  Printer
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

type EditInvoiceItem = {
  key: string;
  productId: number | '';
  productSearch: string;
  quantity: string;
  sellingPrice: string;
  unit: string;
  baseUnitName: string;
  packagings: Array<{
    id: number;
    packageName: string;
    baseUnitName: string;
    unitsPerPackage: number;
    isDefault?: boolean;
  }>;
  selectedPackagingId: number | '';
  packageQuantityInput: string;
  extraUnitQuantityInput: string;
  discount: string;
  isNew?: boolean;
};

type EditProductOption = {
  id: number;
  name: string;
  rawName?: string | null;
  sellingPrice?: number | string | null;
  baseUnitName?: string | null;
  unit?: string | null;
  packagings?: any[];
  stock?: number;
};

type ReturnMode = 'package' | 'unit';

type ReturnInvoiceItem = any & {
  returnQty: string;
  returnMode: ReturnMode;
};

const normalizeProductSearchValue = (value: unknown) => formatProductName(value).toLowerCase();
const normalizeDisplayBaseUnit = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'шт';
  if (['пачка', 'пачки', 'пачек', 'шт', 'штук', 'штука', 'штуки', 'pcs', 'piece', 'pieces'].includes(normalized)) {
    return 'шт';
  }
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

const getDefaultPackaging = (
  packagings: Array<{ id: number; isDefault?: boolean; unitsPerPackage?: number; packageName?: string; baseUnitName?: string }>,
) =>
  packagings.find((entry) => entry.isDefault) || packagings[0] || null;

const getProductStockParts = (product: EditProductOption) => {
  const totalStock = Math.max(0, Number(product?.stock || 0));
  const baseUnitName = normalizeDisplayBaseUnit(product?.baseUnitName || product?.unit || 'шт');
  const packagings = normalizePackagings(product);
  const packaging = getDefaultPackaging(packagings);

  if (!packaging || Number(packaging.unitsPerPackage || 0) <= 0) {
    return {
      primary: `${formatCount(totalStock)} ${baseUnitName}`,
      secondary: '',
    };
  }

  const unitsPerPackage = Number(packaging.unitsPerPackage || 0);
  const packageName = String(packaging.packageName || '').trim().toLowerCase() || 'уп';
  const packageCount = Math.floor(totalStock / unitsPerPackage);
  const extraUnits = totalStock - packageCount * unitsPerPackage;
  const primary =
    packageCount > 0
      ? `${formatCount(packageCount)} ${packageName}${extraUnits > 0 ? ` +${formatCount(extraUnits)} ${baseUnitName}` : ''}`
      : `${formatCount(totalStock)} ${baseUnitName}`;
  const secondary = packageCount > 0
    ? `${formatCount(packageCount)}*${formatCount(unitsPerPackage)}=${formatCount(packageCount * unitsPerPackage)} ${baseUnitName}`
    : '';

  return { primary, secondary };
};

export default function SalesView() {
  const PAYMENT_EPSILON = 0.01;
  const pageSize = 8;
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const hasLoadedCustomersRef = React.useRef(false);
  const hasLoadedWarehousesRef = React.useRef(false);
  const user = React.useMemo(() => getCurrentUser(), []);
  const isAdmin = isAdminUser(user);
  const userWarehouseId = getUserWarehouseId(user);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(userWarehouseId ? String(userWarehouseId) : '');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'partial' | 'unpaid'>('all');
  const [staffFilter, setStaffFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'createdAt',
    direction: 'desc',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [editCustomerId, setEditCustomerId] = useState<number | ''>('');
  const [editDiscount, setEditDiscount] = useState<string>('0');
  const [editInvoiceItems, setEditInvoiceItems] = useState<EditInvoiceItem[]>([]);
  const [editProducts, setEditProducts] = useState<any[]>([]);
  const [editInvoiceSearch, setEditInvoiceSearch] = useState('');
  const [openEditProductMenuKey, setOpenEditProductMenuKey] = useState<string | null>(null);
  const [editProductMenuSearch, setEditProductMenuSearch] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [returnItems, setReturnItems] = useState<any[]>([]);
  const [isPaying, setIsPaying] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isEditItemsDirty, setIsEditItemsDirty] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const closeDetailsModal = () => {
    setShowDetailsModal(false);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditCustomerId('');
    setEditDiscount('0');
    setEditInvoiceItems([]);
    setEditProducts([]);
    setEditInvoiceSearch('');
    setOpenEditProductMenuKey(null);
    setEditProductMenuSearch('');
    setIsEditItemsDirty(false);
  };

  const closePaymentModal = () => {
    setShowPaymentModal(false);
    setPaymentAmount('');
  };

  const closeReturnModal = () => {
    setShowReturnModal(false);
    setReturnReason('');
    setReturnItems([]);
  };

  const escapeHtml = (value: unknown) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  useEffect(() => {
    fetchInvoices();
  }, [selectedWarehouseId, isAdmin, userWarehouseId]);

  useEffect(() => {
    const incomingWarehouseId = location.state && typeof location.state === 'object'
      ? String((location.state as { warehouseId?: string | number | null }).warehouseId || '')
      : '';

    if (!incomingWarehouseId) {
      return;
    }

    setSelectedWarehouseId(incomingWarehouseId);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (hasLoadedWarehousesRef.current) {
      return;
    }

    hasLoadedWarehousesRef.current = true;
    fetchWarehouses();
  }, [isAdmin]);

  useEffect(() => {
    if (hasLoadedCustomersRef.current) {
      return;
    }

    hasLoadedCustomersRef.current = true;
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (!showDetailsModal && !showPaymentModal && !showReturnModal && !showEditModal) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (showPaymentModal) return closePaymentModal();
      if (showReturnModal) return closeReturnModal();
      if (showEditModal) return closeEditModal();
      if (showDetailsModal) return closeDetailsModal();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDetailsModal, showEditModal, showPaymentModal, showReturnModal]);

  const fetchInvoices = async () => {
    setIsLoading(true);
    try {
      const effectiveWarehouseId = !isAdmin && userWarehouseId ? String(userWarehouseId) : selectedWarehouseId;
      const query = effectiveWarehouseId ? `?warehouseId=${effectiveWarehouseId}` : '';
      const res = await client.get(`/invoices${query}`);
      setInvoices(Array.isArray(res.data) ? res.data.filter((invoice) => !invoice?.cancelled) : []);
    } catch (err) {
      toast.error('Ошибка при загрузке накладных');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const data = await getWarehouses();
      const filteredWarehouses = filterWarehousesForUser(Array.isArray(data) ? data : [], user);
      setWarehouses(filteredWarehouses);
      const defaultWarehouseId = getDefaultWarehouseId(filteredWarehouses);
      if (isAdmin && !selectedWarehouseId && defaultWarehouseId) {
        setSelectedWarehouseId(String(defaultWarehouseId));
      } else if (!isAdmin && filteredWarehouses[0]) {
        setSelectedWarehouseId(String(filteredWarehouses[0].id));
      }
    } catch (err) {
      hasLoadedWarehousesRef.current = false;
      console.error(err);
    }
  };

  const fetchInvoiceDetails = async (id: number) => {
    try {
      const res = await client.get(`/invoices/${id}`);
      setSelectedInvoice(res.data);
      setShowDetailsModal(true);
    } catch (err) {
      toast.error('Ошибка при загрузке деталей накладной');
    }
  };

  const handleDeleteInvoice = async (id: number) => {
    if (!window.confirm('Вы уверены, что хотите удалить эту накладную? Это действие нельзя отменить.')) return;
    try {
      await client.delete(`/invoices/${id}`);
      toast.success('Накладная удалена');
      if (Number(selectedInvoice?.id) === Number(id)) {
        closeDetailsModal();
        closeEditModal();
        closePaymentModal();
        closeReturnModal();
        setSelectedInvoice(null);
      }
      await fetchInvoices();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Ошибка при удалении накладной');
    }
  };

  const handlePayment = async () => {
    if (!selectedInvoice || !paymentAmount) return;
    const normalizedAmount = Number(paymentAmount);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      toast.error('Сумма оплаты должна быть больше нуля');
      return;
    }

    const currentBalance = getInvoiceBalance(selectedInvoice);
    const EPSILON = 0.01;
    if (normalizedAmount > currentBalance + EPSILON) {
      toast.error(`Сумма оплаты не может превышать остаток долга (${toFixedNumber(currentBalance)})`);
      return;
    }

    setIsPaying(true);
    try {
      await client.post('/payments', {
        customer_id: selectedInvoice.customerId,
        invoice_id: selectedInvoice.id,
        amount: normalizedAmount,
        method: 'cash'
      });
      toast.success('Оплата принята');
      closePaymentModal();
      await refreshSelectedInvoice(selectedInvoice.id);
      await fetchInvoices();
    } catch (err) {
      toast.error('Ошибка при приёме оплаты');
    } finally {
      setIsPaying(false);
    }
  };

  const handleReturn = async () => {
    if (!selectedInvoice || returnItems.length === 0) return;
    setIsReturning(true);
    try {
      const itemsToReturn = returnItems
        .map((item: ReturnInvoiceItem) => {
          const rawQuantity = Number(item.returnQty || 0);
          const packaging = getReturnItemPackaging(item);
          const quantity =
            item.returnMode === 'package' && packaging
              ? rawQuantity * packaging.unitsPerPackage
              : rawQuantity;

          return {
            invoiceItemId: Number(item.id),
            rawQuantity,
            quantity,
            item,
          };
        })
        .filter((item) => item.rawQuantity > 0);

      if (itemsToReturn.length === 0) {
        toast.error('Выберите товары для возврата');
        setIsReturning(false);
        return;
      }

      for (const item of itemsToReturn) {
        const remainingUnits = getReturnItemRemainingUnits(item.item);
        const packaging = getReturnItemPackaging(item.item);

        if (!Number.isFinite(item.rawQuantity) || item.rawQuantity <= 0) {
          toast.error('Введите корректное количество для возврата');
          setIsReturning(false);
          return;
        }

        if (item.item.returnMode === 'package') {
          const maxPackages = packaging ? Math.floor(remainingUnits / packaging.unitsPerPackage) : 0;
          if (!Number.isInteger(item.rawQuantity) || item.rawQuantity > maxPackages) {
            toast.error(`Можно вернуть не больше ${maxPackages} ${packaging?.packageName || 'упаковок'}`);
            setIsReturning(false);
            return;
          }
        } else if (item.quantity > remainingUnits) {
          toast.error(`Можно вернуть не больше ${remainingUnits} ${packaging?.baseUnitName || 'шт'}`);
          setIsReturning(false);
          return;
        }
      }

      await client.post(`/invoices/${selectedInvoice.id}/return`, {
        items: itemsToReturn.map(({ invoiceItemId, quantity }) => ({ invoiceItemId, quantity })),
        reason: returnReason
      });
      toast.success('Возврат оформлен');
      closeReturnModal();
      await refreshSelectedInvoice(selectedInvoice.id);
      await fetchInvoices();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Ошибка при оформлении возврата');
    } finally {
      setIsReturning(false);
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    if (inv?.cancelled) {
      return false;
    }

    const matchesSearch =
      inv.id.toString().includes(search) ||
      inv.customer_name.toLowerCase().includes(search.toLowerCase());

    const effectiveStatus = getEffectiveStatus(inv);
    const matchesStatus = statusFilter === 'all' || effectiveStatus === statusFilter;
    const matchesStaff = staffFilter === 'all' || String(inv.staff_name || '') === staffFilter;
    const invoiceDate = String(inv.createdAt || '').slice(0, 10);
    const matchesDateFrom = !dateFrom || invoiceDate >= dateFrom;
    const matchesDateTo = !dateTo || invoiceDate <= dateTo;

    if (isAdmin || !userWarehouseId) {
      return matchesSearch && matchesStatus && matchesStaff && matchesDateFrom && matchesDateTo;
    }

    const invoiceWarehouseId = inv.warehouseId || inv.warehouse?.id;
    return (
      matchesSearch &&
      matchesStatus &&
      matchesStaff &&
      matchesDateFrom &&
      matchesDateTo &&
      Number(invoiceWarehouseId) === userWarehouseId
    );
  });

  const handleSort = (key: string) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const getStatusBadge = (status: string, cancelled: boolean) => {
    if (cancelled) return <span className="rounded-full bg-rose-50 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-rose-500">Отменена</span>;
    switch (status) {
      case 'paid': return <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-500">Оплачено</span>;
      case 'partial': return <span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-amber-500">Частично</span>;
      default: return <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Не оплачено</span>;
    }
  };

  function getInvoiceSubtotal(invoice: any) {
    return Array.isArray(invoice?.items)
      ? invoice.items.reduce((sum: number, item: any) => sum + Number(item.totalPrice || 0), 0)
      : Number(invoice?.totalAmount || 0);
  }

  function getInvoiceDiscountAmount(invoice: any) {
    const subtotal = getInvoiceSubtotal(invoice);
    const discount = Number(invoice?.discount || 0);
    return subtotal * (discount / 100);
  }

  function getInvoiceNetAmount(invoice: any) {
    const storedNet = Number(invoice?.netAmount);
    if (Number.isFinite(storedNet) && storedNet >= 0) {
      return storedNet;
    }

    const subtotal = getInvoiceSubtotal(invoice);
    const discountAmount = getInvoiceDiscountAmount(invoice);
    const taxAmount = Number(invoice?.tax || 0);
    const returnedAmount = Number(invoice?.returnedAmount || 0);
    const calculatedNet = subtotal - discountAmount + taxAmount - returnedAmount;

    return Math.max(0, calculatedNet);
  }

  function getEffectiveStatus(invoice: any) {
    if (invoice?.cancelled) {
      return 'cancelled';
    }

    const paidAmount = Math.max(0, Number(invoice?.paidAmount || 0));
    const netAmount = getInvoiceNetAmount(invoice);

    if (paidAmount > 0 && paidAmount >= netAmount - PAYMENT_EPSILON) {
      return 'paid';
    }

    if (paidAmount > 0) {
      return 'partial';
    }

    return 'unpaid';
  }

  function getInvoiceBalance(invoice: any) {
    return getInvoiceNetAmount(invoice) - Math.max(0, Number(invoice?.paidAmount || 0));
  }

  const canEditInvoice = (invoice: any) => {
    if (!invoice) {
      return false;
    }

    if (isAdmin) {
      return true;
    }

    if (invoice.cancelled) {
      return false;
    }

    const hasReturns = Array.isArray(invoice.returns) && invoice.returns.length > 0;
    const hasReturnedAmount = Number(invoice.returnedAmount || 0) > PAYMENT_EPSILON;
    if (hasReturns || hasReturnedAmount) {
      return false;
    }

    if (!isAdmin && Number(invoice.userId || 0) !== Number(user?.id || 0)) {
      return false;
    }

    const hasPayments = Array.isArray(invoice.payments) && invoice.payments.length > 0;
    const hasPaidAmount = Number(invoice.paidAmount || 0) > PAYMENT_EPSILON;

    return !hasPayments && !hasPaidAmount;
  };

  const getEditBlockedReason = (invoice: any) => {
    if (!invoice) {
      return 'Накладную нельзя изменить';
    }

    if (isAdmin) {
      return 'Администратор может изменить накладную';
    }

    if (Array.isArray(invoice.returns) && invoice.returns.length > 0) {
      return 'Накладную с возвратом нельзя изменить';
    }

    if (Number(invoice.returnedAmount || 0) > PAYMENT_EPSILON) {
      return 'Накладную с возвратом нельзя изменить';
    }

    if (!isAdmin && Number(invoice.userId || 0) !== Number(user?.id || 0)) {
      return 'Можно редактировать только свои накладные';
    }

    if (invoice.cancelled) {
      return 'Отменённую накладную нельзя изменить';
    }

    if (Array.isArray(invoice.payments) && invoice.payments.length > 0) {
      return 'Оплаченную накладную нельзя изменить';
    }

    if (Number(invoice.paidAmount || 0) > PAYMENT_EPSILON) {
      return 'Оплаченную накладную нельзя изменить';
    }

    return 'Накладную можно изменить';
  };

  const fetchCustomers = async () => {
    try {
      const data = await getCustomers();
      setCustomers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  };

  const createEditInvoiceItem = (item?: any, productMeta?: any): EditInvoiceItem => {
    const product = productMeta || item?.product || null;
    const packagings = normalizePackagings(product);
    const defaultPackaging = getDefaultPackaging(packagings);
    const existingPackaging =
      item?.packagingId
        ? packagings.find((entry: any) => Number(entry.id) === Number(item.packagingId)) ||
          (item?.packageNameSnapshot && Number(item?.unitsPerPackageSnapshot || 0) > 0
            ? {
                id: Number(item.packagingId),
                packageName: String(item.packageNameSnapshot),
                baseUnitName: normalizeDisplayBaseUnit(
                  item?.baseUnitNameSnapshot || product?.baseUnitName || product?.unit || 'шт',
                ),
                unitsPerPackage: Number(item.unitsPerPackageSnapshot || 0),
                isDefault: false,
              }
            : null)
        : null;
    const isEmpty = !item && !product;
    const totalUnits =
      item?.totalBaseUnits !== undefined && item?.totalBaseUnits !== null
        ? Math.max(0, Number(item.totalBaseUnits) || 0)
        : item?.quantity !== undefined && item?.quantity !== null
        ? Math.max(0, Number(item.quantity) || 0)
        : isEmpty
          ? 0
          : defaultPackaging
          ? Number(defaultPackaging.unitsPerPackage || 0)
          : 1;
    const selectedPackaging = existingPackaging || defaultPackaging;
    const usePackaging = Boolean(selectedPackaging && Number(selectedPackaging.unitsPerPackage || 0) > 1);
    const unitsPerPackage = usePackaging ? Number(selectedPackaging?.unitsPerPackage || 0) : 0;
    const packageQuantity =
      item?.packageQuantity !== undefined && item?.packageQuantity !== null
        ? Math.max(0, Number(item.packageQuantity) || 0)
        : usePackaging && unitsPerPackage > 0
        ? Math.floor(totalUnits / unitsPerPackage)
        : 0;
    const extraUnitQuantity =
      item?.extraUnitQuantity !== undefined && item?.extraUnitQuantity !== null
        ? Math.max(0, Number(item.extraUnitQuantity) || 0)
        : usePackaging && unitsPerPackage > 0
        ? totalUnits % unitsPerPackage
        : totalUnits;
    const baseUnitName = normalizeDisplayBaseUnit(
      item?.unit || item?.baseUnitNameSnapshot || product?.baseUnitName || product?.unit || 'шт',
    );

    return {
      key: `${item?.id || 'new'}-${Math.random().toString(36).slice(2, 9)}`,
      productId: item?.productId ? Number(item.productId) : product?.id ? Number(product.id) : '',
      productSearch: String(item?.product_name || item?.productNameSnapshot || product?.name || ''),
      quantity: String(totalUnits),
      sellingPrice:
        item?.sellingPrice !== undefined && item?.sellingPrice !== null
          ? String(toFixedNumber(Number(item.sellingPrice)))
          : isEmpty
            ? ''
            : String(toFixedNumber(Number(product?.sellingPrice || 0))),
      unit: baseUnitName,
      baseUnitName,
      packagings: existingPackaging && !packagings.some((entry: any) => Number(entry.id) === Number(existingPackaging.id))
        ? [existingPackaging, ...packagings]
        : packagings,
      selectedPackagingId: usePackaging ? Number(selectedPackaging?.id || '') : '',
      packageQuantityInput: isEmpty ? '' : String(packageQuantity),
      extraUnitQuantityInput: isEmpty ? '' : String(extraUnitQuantity),
      discount: item?.discount !== undefined ? String(item.discount) : '',
      isNew: isEmpty,
    };
  };

  const getEditProductMeta = (productId: number | '') =>
    editProducts.find((product) => Number(product.id) === Number(productId));

  const findEditProductBySearch = (value: string) => {
    const normalized = normalizeProductSearchValue(value);
    if (!normalized) {
      return null;
    }

    return (
      editProducts.find((product) => normalizeProductSearchValue(product.name) === normalized) ||
      editProducts.find((product) => normalizeProductSearchValue(product.rawName) === normalized) ||
      editProducts.find((product) => normalizeProductSearchValue(product.name).includes(normalized)) ||
      editProducts.find((product) => normalizeProductSearchValue(product.rawName).includes(normalized)) ||
      null
    );
  };

  const updateEditInvoiceItem = (key: string, patch: Partial<EditInvoiceItem>) => {
    setEditInvoiceItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  };

  const getEditItemPackaging = (item: EditInvoiceItem) =>
    (Array.isArray(item.packagings) ? item.packagings : []).find((entry) => Number(entry.id) === Number(item.selectedPackagingId)) || null;

  const getEditItemDefaultBulkPackaging = (item: EditInvoiceItem) =>
    getDefaultPackaging((Array.isArray(item.packagings) ? item.packagings : []).filter((entry) => Number(entry.unitsPerPackage || 0) > 1));

  const normalizeEditInvoiceItem = (item: EditInvoiceItem): EditInvoiceItem => {
    const packaging = getEditItemPackaging(item);
    const unitsPerPackage = Number(packaging?.unitsPerPackage || 0);
    const packageQuantity = Math.max(0, Math.floor(Number(item.packageQuantityInput || 0) || 0));
    const extraUnitQuantity = Math.max(0, Number(item.extraUnitQuantityInput || 0) || 0);

    const totalUnits = packaging && unitsPerPackage > 0 ? packageQuantity * unitsPerPackage + extraUnitQuantity : extraUnitQuantity;

    return {
      ...item,
      quantity: String(totalUnits),
      baseUnitName: normalizeDisplayBaseUnit(item.baseUnitName || item.unit || 'шт'),
      unit: normalizeDisplayBaseUnit(item.baseUnitName || item.unit || 'шт'),
      packageQuantityInput: String(packageQuantity),
      extraUnitQuantityInput: String(extraUnitQuantity),
    };
  };

  const originalInvoiceQtyByProduct = React.useMemo(() => {
    const result = new Map<number, number>();
    for (const sourceItem of Array.isArray(selectedInvoice?.items) ? selectedInvoice.items : []) {
      const productId = Number(sourceItem?.productId);
      if (!productId) {
        continue;
      }

      const quantity = Math.max(0, Number(sourceItem?.totalBaseUnits ?? sourceItem?.quantity ?? 0));
      result.set(productId, (result.get(productId) || 0) + quantity);
    }

    return result;
  }, [selectedInvoice?.items]);

  const getAvailableForEditProduct = (productId: number | '') => {
    const numericProductId = Number(productId);
    if (!numericProductId) {
      return 0;
    }

    const product = getEditProductMeta(numericProductId);
    const availableNow = Math.max(0, Number(product?.stock || 0));
    const originalQty = Math.max(0, Number(originalInvoiceQtyByProduct.get(numericProductId) || 0));
    return availableNow + originalQty;
  };

  const getRequestedUnitsForProduct = (items: EditInvoiceItem[], productId: number, skipItemKey?: string) =>
    items.reduce((sum, currentItem) => {
      if (skipItemKey && currentItem.key === skipItemKey) {
        return sum;
      }

      if (Number(currentItem.productId) !== productId) {
        return sum;
      }

      return sum + Math.max(0, Number(normalizeEditInvoiceItem(currentItem).quantity || 0));
    }, 0);

  const applyEditItemQuantityCap = (item: EditInvoiceItem, allItems: EditInvoiceItem[]) => {
    const productId = Number(item.productId);
    const normalized = normalizeEditInvoiceItem(item);
    if (!productId) {
      return normalized;
    }

    const maxAvailableForProduct = getAvailableForEditProduct(productId);
    const requestedWithoutCurrent = getRequestedUnitsForProduct(allItems, productId, item.key);
    const maxAllowedForItem = Math.max(0, maxAvailableForProduct - requestedWithoutCurrent);
    const currentUnits = Math.max(0, Number(normalized.quantity || 0));

    if (currentUnits <= maxAllowedForItem) {
      return normalized;
    }

    const selectedPackaging = getEditItemPackaging(normalized);
    const unitsPerPackage = Math.max(0, Number(selectedPackaging?.unitsPerPackage || 0));

    if (selectedPackaging && unitsPerPackage > 0) {
      const packageQuantity = Math.floor(maxAllowedForItem / unitsPerPackage);
      const extraUnitQuantity = maxAllowedForItem % unitsPerPackage;
      return {
        ...normalized,
        quantity: String(maxAllowedForItem),
        packageQuantityInput: String(packageQuantity),
        extraUnitQuantityInput: String(extraUnitQuantity),
      };
    }

    return {
      ...normalized,
      quantity: String(maxAllowedForItem),
      extraUnitQuantityInput: String(maxAllowedForItem),
    };
  };

  const getEditItemMaxAllowedQuantity = (item: EditInvoiceItem, allItems: EditInvoiceItem[]) => {
    const productId = Number(item.productId);
    if (!productId) {
      return 0;
    }

    const maxAvailableForProduct = getAvailableForEditProduct(productId);
    const requestedWithoutCurrent = getRequestedUnitsForProduct(allItems, productId, item.key);
    return Math.max(0, maxAvailableForProduct - requestedWithoutCurrent);
  };

  const updateNormalizedEditInvoiceItem = (key: string, patch: Partial<EditInvoiceItem>) => {
    setIsEditItemsDirty(true);
    setEditInvoiceItems((current) =>
      current.map((item) => {
        if (item.key !== key) {
          return item;
        }

        return applyEditItemQuantityCap({ ...item, ...patch }, current);
      }),
    );
  };

  const selectEditProductForItem = (itemKey: string, product: EditProductOption) => {
    const packagings = normalizePackagings(product);
    const defaultPackaging = getDefaultPackaging(packagings);
    const usePackaging = Boolean(defaultPackaging && Number(defaultPackaging.unitsPerPackage || 0) > 1);

    updateNormalizedEditInvoiceItem(itemKey, {
      productSearch: formatProductName(product.name),
      productId: Number(product.id),
      sellingPrice: String(toFixedNumber(Number(product.sellingPrice || 0))),
      unit: normalizeDisplayBaseUnit(product.baseUnitName || product.unit || 'шт'),
      baseUnitName: normalizeDisplayBaseUnit(product.baseUnitName || product.unit || 'шт'),
      packagings,
      selectedPackagingId: usePackaging ? Number(defaultPackaging?.id || '') : '',
      packageQuantityInput: usePackaging ? '1' : '0',
      extraUnitQuantityInput: usePackaging ? '0' : '1',
      discount: '0',
      isNew: false,
    });
  };

  const addEditInvoiceItem = () => {
    setIsEditItemsDirty(true);
    setEditInvoiceItems((current) => [
      createEditInvoiceItem(),
      ...current,
    ]);
  };

  const removeEditInvoiceItem = (key: string) => {
    setIsEditItemsDirty(true);
    setEditInvoiceItems((current) => current.filter((item) => item.key !== key));
  };

  const filteredEditInvoiceItems = editInvoiceItems.filter((item) => {
    const query = editInvoiceSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }

    const product = getEditProductMeta(item.productId);
    const productName = String(product?.name || '').toLowerCase();
    return productName.includes(query) || String(item.productId || '').includes(query);
  });

  const editInvoiceSubtotal = React.useMemo(
    () =>
      editInvoiceItems.reduce((sum, item) => {
        const quantity = Number(item.quantity);
        const sellingPrice = Number(item.sellingPrice);
        const itemDiscount = Number(item.discount || 0);
        if (!Number.isFinite(quantity) || !Number.isFinite(sellingPrice) || quantity <= 0 || sellingPrice < 0) {
          return sum;
        }
        const unitPriceRounded = ceilMoney(sellingPrice * (1 - (Number.isFinite(itemDiscount) ? itemDiscount : 0) / 100));
        const itemDiscounted = quantity * unitPriceRounded;
        return sum + itemDiscounted;
      }, 0),
    [editInvoiceItems],
  );

  const editInvoiceDiscountAmount = React.useMemo(() => {
    const discountPercent = Number(editDiscount || 0);
    if (!Number.isFinite(discountPercent) || discountPercent <= 0) {
      return 0;
    }
    return roundMoney(editInvoiceSubtotal * (discountPercent / 100));
  }, [editInvoiceSubtotal, editDiscount]);

  const editInvoiceTaxAmount = React.useMemo(() => {
    const taxAmount = Number(selectedInvoice?.tax || 0);
    if (!Number.isFinite(taxAmount) || taxAmount <= 0) {
      return 0;
    }
    return taxAmount;
  }, [selectedInvoice?.tax]);

  const editInvoiceNetAmount = React.useMemo(
    () => roundMoney(Math.max(0, editInvoiceSubtotal - editInvoiceDiscountAmount + editInvoiceTaxAmount)),
    [editInvoiceDiscountAmount, editInvoiceSubtotal, editInvoiceTaxAmount],
  );

  const openEditInvoiceModal = async (invoice: any) => {
    if (!canEditInvoice(invoice)) {
      toast.error(getEditBlockedReason(invoice));
      return;
    }

    try {
      const res = await client.get(`/invoices/${invoice.id}`);
      const products = await getProducts(Number(res.data.warehouseId));
      setSelectedInvoice(res.data);
      setEditCustomerId(res.data.customerId || '');
      setEditDiscount(String(res.data.discount || 0));
      setEditProducts(Array.isArray(products) ? products : []);
      setEditInvoiceItems(
        Array.isArray(res.data.items) && res.data.items.length
          ? res.data.items.map((item: any) =>
              createEditInvoiceItem(
                item,
                (Array.isArray(products) ? products : []).find((product: any) => Number(product.id) === Number(item.productId)),
              ),
            )
          : [],
      );
      setIsEditItemsDirty(false);
      setShowEditModal(true);
    } catch (err) {
      toast.error('Ошибка при загрузке накладной');
    }
  };

  const handleUpdateInvoice = async () => {
    if (!selectedInvoice) return;

    if (editInvoiceItems.length === 0) {
      toast.error('Добавьте хотя бы один товар в накладную');
      return;
    }

    let payloadItems: any[] = [];

    try {
      payloadItems = editInvoiceItems.map((item) => {
        const normalizedItem = normalizeEditInvoiceItem(item);
        const quantity = Number(normalizedItem.quantity);
        const sellingPrice = Number(item.sellingPrice);
        const product = getEditProductMeta(normalizedItem.productId);

        if (!normalizedItem.productId || !product) {
          throw new Error('Выберите товар для каждой строки');
        }

        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error(`Укажите корректное количество для "${product.name}"`);
        }

        if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
          throw new Error(`Укажите корректную цену продажи для "${product.name}"`);
        }

        return {
          productId: Number(normalizedItem.productId),
          quantity,
          totalBaseUnits: quantity,
          sellingPrice,
          packagingId: normalizedItem.selectedPackagingId ? Number(normalizedItem.selectedPackagingId) : null,
          packageQuantity: normalizedItem.selectedPackagingId ? Math.max(0, Number(normalizedItem.packageQuantityInput || 0) || 0) : null,
          extraUnitQuantity: Math.max(0, Number(normalizedItem.extraUnitQuantityInput || 0) || 0),
          packageName: normalizedItem.selectedPackagingId ? getEditItemPackaging(normalizedItem)?.packageName || null : null,
          unitsPerPackage: normalizedItem.selectedPackagingId ? Number(getEditItemPackaging(normalizedItem)?.unitsPerPackage || 0) || null : null,
          baseUnitName: normalizeDisplayBaseUnit(product.baseUnitName || product.unit || normalizedItem.baseUnitName || normalizedItem.unit || 'шт'),
          productName: product.name,
          rawName: product.rawName || null,
          brand: product.brand || null,
          discount: Number(item.discount || 0),
        };
      });
    } catch (error: any) {
      toast.error(error.message || 'Проверьте строки накладной');
      return;
    }

    const requestedByProduct = new Map<number, number>();
    for (const item of payloadItems) {
      const productId = Number(item.productId);
      const quantity = Math.max(0, Number(item.totalBaseUnits ?? item.quantity ?? 0));
      requestedByProduct.set(productId, (requestedByProduct.get(productId) || 0) + quantity);
    }

    const originalByProduct = new Map<number, number>();
    for (const item of Array.isArray(selectedInvoice.items) ? selectedInvoice.items : []) {
      const productId = Number(item.productId);
      const quantity = Math.max(0, Number(item.totalBaseUnits ?? item.quantity ?? 0));
      originalByProduct.set(productId, (originalByProduct.get(productId) || 0) + quantity);
    }

    for (const [productId, requestedQty] of requestedByProduct.entries()) {
      const product = getEditProductMeta(productId);
      const availableNow = Math.max(0, Number(product?.stock || 0));
      const originalQty = Math.max(0, Number(originalByProduct.get(productId) || 0));
      const availableForEdit = availableNow + originalQty;

      if (requestedQty > availableForEdit) {
        const productName = formatProductName(product?.name || `Товар #${productId}`);
        const unit = normalizeDisplayBaseUnit(product?.baseUnitName || product?.unit || 'шт');
        toast.error(
          `Нельзя продать больше остатка для "${productName}". Доступно: ${availableForEdit} ${unit}, запрошено: ${requestedQty} ${unit}`,
        );
        return;
      }
    }

    setIsSavingEdit(true);
    try {
      const res = await client.put(`/invoices/${selectedInvoice.id}`, {
        customerId: editCustomerId || null,
        items: payloadItems,
        discount: Number(editDiscount || 0),
      });
      const updatedInvoice = res.data;
      
      // Update the main invoices list in-place for immediate feedback
      setInvoices(prev => prev.map(inv => inv.id === updatedInvoice.id ? {
        ...updatedInvoice,
        customer_name: updatedInvoice.customer_name || inv.customer_name,
        staff_name: updatedInvoice.staff_name || inv.staff_name
      } : inv));
      
      setSelectedInvoice(updatedInvoice);
      toast.success('Накладная обновлена');
      closeEditModal();
      
      // Still fetch in background to be 100% sure
      await fetchInvoices();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Ошибка при обновлении продажи');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const getInvoiceChangeAmount = (invoice: any) => {
    const change = Math.max(0, Number(invoice?.paidAmount || 0)) - getInvoiceNetAmount(invoice);
    if (change <= PAYMENT_EPSILON) {
      return 0;
    }

    return change;
  };

  const getInvoiceAppliedPaidAmount = (invoice: any) =>
    Math.max(0, Math.max(0, Number(invoice?.paidAmount || 0)) - getInvoiceChangeAmount(invoice));

  const normalizeDisplayPackageName = (value: unknown) => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized || 'уп';
  };

  const getReturnItemPackaging = (item: any) => {
    const unitsPerPackage = Math.max(0, Number(item?.unitsPerPackageSnapshot ?? item?.unitsPerPackage ?? 0));
    const packageName = String(item?.packageNameSnapshot || item?.packageName || '').trim();

    if (!packageName || unitsPerPackage <= 0) {
      return null;
    }

    return {
      packageName,
      unitsPerPackage,
      baseUnitName: normalizeDisplayBaseUnit(item?.unit || item?.baseUnitNameSnapshot || item?.baseUnitName || 'шт'),
    };
  };

  const getReturnItemRemainingUnits = (item: any) =>
    Math.max(0, Number(item?.quantity ?? item?.totalBaseUnits ?? 0) - Number(item?.returnedQty || 0));

  const createReturnInvoiceItems = (items: any[]): ReturnInvoiceItem[] =>
    (Array.isArray(items) ? items : [])
      .filter((item: any) => getReturnItemRemainingUnits(item) > PAYMENT_EPSILON)
      .map((item: any) => ({
        ...item,
        returnQty: '',
        returnMode: getReturnItemPackaging(item) ? 'package' : 'unit',
      }));

  const hasReturnableItems = (invoice: any) =>
    Array.isArray(invoice?.items) && invoice.items.some((item: any) => getReturnItemRemainingUnits(item) > PAYMENT_EPSILON);

  const getReturnItemDisplayName = (item: any) =>
    formatProductName(item?.product_name || item?.productNameSnapshot || item?.product?.name || 'Товар без названия');

  const getInvoiceItemQuantityParts = (item: any) => {
    const packageQuantity = Math.max(0, Number(item?.packageQuantity || 0));
    const extraUnitQuantity = Math.max(0, Number(item?.extraUnitQuantity || 0));
    const unitsPerPackage = Math.max(0, Number(item?.unitsPerPackageSnapshot ?? item?.unitsPerPackage ?? 0));
    const packageName = normalizeDisplayPackageName(item?.packageNameSnapshot || item?.packageName);
    const baseUnitName = normalizeDisplayBaseUnit(item?.unit || item?.baseUnitNameSnapshot || item?.baseUnitName || 'шт');

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

  const isInvoicePaidInFull = (invoice: any) => getEffectiveStatus(invoice) === 'paid';

  const isPaymentActionDisabled = (invoice: any) =>
    Boolean(invoice?.cancelled) ||
    isInvoicePaidInFull(invoice) ||
    getInvoiceBalance(invoice) <= PAYMENT_EPSILON;

  const isReturnActionDisabled = (invoice: any) =>
    Boolean(invoice?.cancelled) || !hasReturnableItems(invoice);

  const applyInvoiceToHistory = (updatedInvoice: any) => {
    if (!updatedInvoice?.id) {
      return;
    }

    setInvoices((current) =>
      current.map((invoice) =>
        Number(invoice.id) === Number(updatedInvoice.id)
          ? {
              ...invoice,
              ...updatedInvoice,
              customer_name: updatedInvoice.customer_name || updatedInvoice.customer?.name || invoice.customer_name,
              staff_name: updatedInvoice.staff_name || updatedInvoice.user?.username || invoice.staff_name,
              items: Array.isArray(updatedInvoice.items) ? updatedInvoice.items : invoice.items,
              totalAmount: updatedInvoice.totalAmount,
              netAmount: updatedInvoice.netAmount,
              paidAmount: updatedInvoice.paidAmount,
              returnedAmount: updatedInvoice.returnedAmount,
              discount: updatedInvoice.discount,
              tax: updatedInvoice.tax,
              status: updatedInvoice.status,
              cancelled: Boolean(updatedInvoice.cancelled),
            }
          : invoice,
      ),
    );
  };

  const refreshSelectedInvoice = async (invoiceId: number) => {
    try {
      const res = await client.get(`/invoices/${invoiceId}`);
      setSelectedInvoice(res.data);
      applyInvoiceToHistory(res.data);
      return res.data;
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  const openReturnInvoiceModal = async (invoice: any) => {
    if (!invoice || isReturnActionDisabled(invoice)) {
      return;
    }

    try {
      const res = await client.get(`/invoices/${invoice.id}`);
      setSelectedInvoice(res.data);
      setReturnItems(createReturnInvoiceItems(res.data.items || []));
      setShowReturnModal(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Ошибка при загрузке накладной');
    }
  };

  const handlePrintInvoice = async (invoice: any) => {
    if (!invoice) {
      return;
    }

    const effectiveStatus = getEffectiveStatus(invoice);
    const statusLabel = invoice?.cancelled
      ? 'Отменена'
      : effectiveStatus === 'paid'
        ? 'Оплачено'
        : effectiveStatus === 'partial'
          ? 'Частично оплачено'
          : 'Не оплачено';

    const { printSalesInvoice } = await import('../utils/print/salesInvoicePrint');
    const result = printSalesInvoice({
      invoice,
      statusLabel,
      subtotal: getInvoiceSubtotal(invoice),
      discountAmount: getInvoiceDiscountAmount(invoice),
      netAmount: getInvoiceNetAmount(invoice),
      balanceAmount: getInvoiceBalance(invoice),
      changeAmount: getInvoiceChangeAmount(invoice),
      appliedPaidAmount: getInvoiceAppliedPaidAmount(invoice),
    });

    if (!result.ok && result.reason === 'blocked') {
      toast.error('Разрешите всплывающие окна для печати накладной');
    }
  };

  const handleQuickPrintInvoice = async (invoiceId: number) => {
    try {
      const res = await client.get(`/invoices/${invoiceId}`);
      await handlePrintInvoice(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || '?????? ??? ?????????? ??????');
    }
  };

  const sortedInvoices = [...filteredInvoices].sort((a, b) => {
    const direction = sortConfig.direction === 'asc' ? 1 : -1;

    switch (sortConfig.key) {
      case 'id':
        return (Number(a.id) - Number(b.id)) * direction;
      case 'createdAt':
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * direction;
      case 'customer_name':
        return String(a.customer_name || '').localeCompare(String(b.customer_name || '')) * direction;
      case 'netAmount':
        return (getInvoiceNetAmount(a) - getInvoiceNetAmount(b)) * direction;
      case 'paidAmount':
        return (getInvoiceAppliedPaidAmount(a) - getInvoiceAppliedPaidAmount(b)) * direction;
      case 'balance':
        return (getInvoiceBalance(a) - getInvoiceBalance(b)) * direction;
      case 'status':
        return String(getEffectiveStatus(a)).localeCompare(String(getEffectiveStatus(b))) * direction;
      case 'staff_name':
        return String(a.staff_name || '').localeCompare(String(b.staff_name || '')) * direction;
      default:
        return 0;
    }
  });

  const totalPages = Math.max(1, Math.ceil(sortedInvoices.length / pageSize));
  const paginatedInvoices = sortedInvoices.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const staffOptions = Array.from(new Set(invoices.map((invoice) => String(invoice.staff_name || '').trim()).filter(Boolean)));

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedWarehouseId, sortConfig.key, sortConfig.direction, statusFilter, staffFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const clearInvoiceFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setStaffFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const renderSortLabel = (label: string, key: string) => (
    <button
      type="button"
      onClick={() => handleSort(key)}
      className="inline-flex items-center gap-1 transition-colors hover:text-slate-600"
    >
      <span>{label}</span>
      {sortConfig.key === key ? (
        sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
      ) : (
        <Filter size={13} className="opacity-40" />
      )}
    </button>
  );

  return (
    <div className="app-page-shell">
      <div className="flex flex-col space-y-4">
        <div className="rounded-[28px] border border-slate-100 bg-white/95 px-4 py-4 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.18)] sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-4xl font-medium tracking-tight text-slate-900">Продажи</h1>
          <p className="mt-1 text-slate-500">Управление накладными и заказами клиентов.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-4 mr-4">
             <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-slate-900 leading-none">{user.username}</p>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-widest text-slate-400">{user.role}</p>
             </div>
          </div>
          {isAdmin && (
          <>
          <select 
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            disabled={!isAdmin}
            className="min-w-[200px] rounded-2xl border border-slate-200 bg-[#f7f8fc] px-4 py-2.5 text-sm font-medium text-slate-700 outline-none transition-all focus:border-slate-400 focus:bg-white"
          >
            <option value="">Все склады</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <button 
            onClick={() => navigate('/pos')}
            className="flex items-center space-x-2 rounded-2xl bg-slate-800 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-slate-700"
          >
            <Plus size={18} />
            <span>Новая продажа</span>
          </button>
          </>
          )}
        </div>
      </div>
        </div>

      <div className="mt-1 flex flex-col overflow-hidden rounded-[28px] border border-slate-100 bg-white/95 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.18)] md:min-h-[860px]">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-[#fbfcfe] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-semibold text-slate-900">Накладные</h2>
            <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
              {formatCount(invoices.length)}
            </span>
          </div>
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Поиск по ID или клиенту..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm font-medium text-slate-600 outline-none transition-all focus:border-slate-300 focus:bg-white"
            />
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-100 bg-white px-4 py-4 md:grid-cols-2 xl:grid-cols-5">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="w-full rounded-2xl border border-slate-200 bg-[#f7f8fc] px-4 py-3 text-sm font-medium text-slate-700 outline-none transition-all focus:border-slate-400 focus:bg-white"
          >
            <option value="all">Все статусы</option>
            <option value="paid">Оплачено</option>
            <option value="partial">Частично</option>
            <option value="unpaid">Не оплачено</option>
          </select>

          <select
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-[#f7f8fc] px-4 py-3 text-sm font-medium text-slate-700 outline-none transition-all focus:border-slate-400 focus:bg-white"
          >
            <option value="all">Все сотрудники</option>
            {staffOptions.map((staffName) => (
              <option key={staffName} value={staffName}>
                {staffName}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-[#f7f8fc] px-3 py-3">
            <Calendar size={16} className="text-slate-400" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none"
            />
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-[#f7f8fc] px-3 py-3">
            <Calendar size={16} className="text-slate-400" />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none"
            />
          </div>

          <button
            type="button"
            onClick={clearInvoiceFilters}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50"
          >
            Сбросить фильтры
          </button>
        </div>

        <div className="flex-1 space-y-3 p-3 md:hidden">
          {paginatedInvoices.map((inv) => {
            const paymentDisabled = isPaymentActionDisabled(inv);
            const returnDisabled = isReturnActionDisabled(inv);

            return (
            <div key={`mobile-invoice-${inv.id}`} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base text-slate-900">{isAdmin ? `Накладная #${inv.id}` : 'Накладная'}</p>
                  <p className="mt-1 text-sm text-slate-500">{new Date(inv.createdAt).toLocaleDateString('ru-RU')}</p>
                  <p className="mt-2 break-words text-sm text-slate-700">{inv.customer_name}</p>
                  <p className="mt-1 text-xs text-slate-400">{inv.staff_name}</p>
                </div>
                <div className="shrink-0">{getStatusBadge(getEffectiveStatus(inv), inv.cancelled)}</div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Сумма</p>
                  <p className="mt-1 break-words text-sm text-slate-900">{formatMoney(getInvoiceNetAmount(inv))}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Оплачено</p>
                  <p className="mt-1 break-words text-sm text-emerald-600">{formatMoney(getInvoiceAppliedPaidAmount(inv))}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Остаток</p>
                  <p className="mt-1 break-words text-sm text-rose-600">{formatMoney(getInvoiceBalance(inv))}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Склад</p>
                  <p className="mt-1 break-words text-sm text-slate-900">{inv.warehouse?.name || '---'}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                    onClick={() => {
                      if (paymentDisabled) return;
                      setSelectedInvoice(inv);
                      setPaymentAmount(String(toFixedNumber(getInvoiceBalance(inv))));
                      setShowPaymentModal(true);
                    }}
                    disabled={paymentDisabled}
                    className={`rounded-2xl border px-3 py-2 text-xs font-medium transition-all ${
                      paymentDisabled
                        ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    Оплата
                  </button>
                <button
                    onClick={() => {
                      void openReturnInvoiceModal(inv);
                    }}
                    disabled={returnDisabled}
                    className={`rounded-2xl border px-3 py-2 text-xs font-medium transition-all ${
                      returnDisabled
                        ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                        : 'border-amber-200 bg-amber-50 text-amber-700'
                    }`}
                  >
                    Возврат
                  </button>
                <button
                  onClick={() => {
                    if (!canEditInvoice(inv)) return;
                    openEditInvoiceModal(inv);
                  }}
                  disabled={!canEditInvoice(inv)}
                  title={getEditBlockedReason(inv)}
                  className={`rounded-2xl border px-3 py-2 text-xs font-medium transition-all ${
                    canEditInvoice(inv)
                      ? 'border-violet-200 bg-violet-50 text-violet-700'
                      : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                  }`}
                >
                  Изменить
                </button>
                <button
                  onClick={() => fetchInvoiceDetails(inv.id)}
                  className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700"
                >
                  Детали
                </button>
                <button
                  onClick={() => handleQuickPrintInvoice(inv.id)}
                  className="rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700"
                >
                  Печать
                </button>
                {isAdmin && (
                  <button
                    onClick={() => handleDeleteInvoice(inv.id)}
                    className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
                  >
                  Удалить
                  </button>
                )}
              </div>
            </div>
          )})}
        </div>

        <div className="mt-auto border-t border-slate-100 bg-white/95 md:hidden">
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={sortedInvoices.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            className="border-t-0"
          />
        </div>

        <div className="hidden min-h-[560px] flex-1 overflow-x-auto md:block">
          <table className="w-full border-collapse text-left [&_th]:px-4 [&_th]:py-3 [&_td]:px-4 [&_td]:py-3 [&_th]:text-[10px] [&_th]:tracking-[0.14em]">
            <thead>
              <tr className="bg-[#fafbfe] text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
                {isAdmin && <th className="px-4 py-3">{renderSortLabel('ID', 'id')}</th>}
                <th className="px-4 py-3">{renderSortLabel("Дата", "createdAt")}</th>
                <th className="px-4 py-3">{renderSortLabel("Клиент", "customer_name")}</th>
                <th className="px-4 py-3">{renderSortLabel("Сумма", "netAmount")}</th>
                <th className="px-4 py-3">{renderSortLabel("Оплачено", "paidAmount")}</th>
                <th className="px-4 py-3">{renderSortLabel("Остаток", "balance")}</th>
                <th className="px-4 py-3">{renderSortLabel("Статус", "status")}</th>
                <th className="px-4 py-3">{renderSortLabel("Сотрудник", "staff_name")}</th>
                <th className="px-4 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedInvoices.map((inv) => {
                const paymentDisabled = isPaymentActionDisabled(inv);
                const returnDisabled = isReturnActionDisabled(inv);

                return (
                <tr
                  key={inv.id}
                  onClick={() => fetchInvoiceDetails(inv.id)}
                  className="cursor-pointer transition-all duration-300 hover:bg-[#fafbfe]"
                >
                  {isAdmin && <td className="px-4 py-3 text-sm text-slate-400">#{inv.id}</td>}
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {new Date(inv.createdAt).toLocaleDateString('ru-RU')}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{inv.customer_name}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatMoney(getInvoiceNetAmount(inv))}</td>
                  <td className="px-4 py-3 text-sm text-emerald-500">{formatMoney(getInvoiceAppliedPaidAmount(inv))}</td>
                  <td className="px-4 py-3 text-sm text-rose-500">{formatMoney(getInvoiceBalance(inv))}</td>
                  <td className="px-4 py-3">{getStatusBadge(getEffectiveStatus(inv), inv.cancelled)}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{inv.staff_name}</td>
                  <td className="px-4 py-3 text-right align-middle">
                    <div className={`ml-auto grid gap-2 ${isAdmin ? 'w-[136px] grid-cols-3' : 'w-[90px] grid-cols-2'}`}>
                      {isAdmin && (
                        <>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (paymentDisabled) return;
                            setSelectedInvoice(inv);
                            setPaymentAmount(String(toFixedNumber(getInvoiceBalance(inv))));
                            setShowPaymentModal(true);
                          }}
                          disabled={paymentDisabled}
                          className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all ${
                            paymentDisabled
                              ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                              : 'border-slate-200 bg-white text-emerald-500 hover:border-emerald-100 hover:bg-emerald-50'
                          }`}
                          title="Принять оплату"
                        >
                          <Banknote size={16} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            void openReturnInvoiceModal(inv);
                          }}
                          disabled={returnDisabled}
                          className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all ${
                            returnDisabled
                              ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                              : 'border-slate-200 bg-white text-amber-500 hover:border-amber-100 hover:bg-amber-50'
                          }`}
                          title="Возврат"
                        >
                          <RotateCcw size={16} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!canEditInvoice(inv)) return;
                            openEditInvoiceModal(inv);
                          }}
                          disabled={!canEditInvoice(inv)}
                          className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all ${
                            canEditInvoice(inv)
                              ? 'border-slate-200 bg-white text-violet-500 hover:border-violet-100 hover:bg-violet-50'
                              : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                          }`}
                          title={canEditInvoice(inv) ? 'Изменить продажу' : getEditBlockedReason(inv)}
                        >
                          <Pencil size={16} />
                        </button>
                        </>
                      )}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          fetchInvoiceDetails(inv.id);
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition-all hover:border-sky-100 hover:bg-sky-50 hover:text-sky-500" 
                        title="Просмотр"
                      >
                        <Eye size={16} />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuickPrintInvoice(inv.id);
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-indigo-500 transition-all hover:border-indigo-100 hover:bg-indigo-50" 
                        title="Печать"
                      >
                        <Printer size={16} />
                      </button>
                      {isAdmin && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteInvoice(inv.id);
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition-all hover:border-rose-100 hover:bg-rose-50 hover:text-rose-500" 
                          title="Удалить"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )})}
              {sortedInvoices.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center justify-center space-y-6">
                      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#f4f5fb] text-slate-300">
                        <Receipt size={48} />
                      </div>
                      <p className="text-slate-400 font-bold">Накладные не найдены</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-auto hidden border-t border-slate-100 bg-white/95 md:block">
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={sortedInvoices.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            className="border-t-0"
          />
        </div>
      </div>

      <AnimatePresence>
        {showDetailsModal && selectedInvoice && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDetailsModal}
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center sm:p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:max-h-[92vh] md:rounded-[2.5rem]"
            >
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-4 md:p-8">
                <div className="flex items-center space-x-4">
                  <div className="rounded-2xl bg-indigo-600 p-2.5 text-white md:p-3">
                    <Receipt size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900">Накладная #{selectedInvoice.id}</h3>
                    <p className="text-slate-500 font-bold">{new Date(selectedInvoice.createdAt).toLocaleString('ru-RU')}</p>
                  </div>
                </div>
                <button onClick={closeDetailsModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-5 md:p-8 md:space-y-8">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-6">
                  <div className="rounded-[22px] bg-slate-50 p-4 md:rounded-3xl md:p-6">
                    <div className="flex items-center space-x-3 text-slate-400 mb-4">
                      <UserIcon size={18} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Клиент</span>
                    </div>
                    <p className="text-lg font-black text-slate-900">{selectedInvoice.customer_name}</p>
                    <p className="text-sm font-bold text-slate-500 mt-1">{selectedInvoice.customer_phone || 'Нет телефона'}</p>
                  </div>
                  <div className="rounded-[22px] bg-slate-50 p-4 md:rounded-3xl md:p-6">
                    <div className="flex items-center space-x-3 text-slate-400 mb-4">
                      <WarehouseIcon size={18} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Склад</span>
                    </div>
                    <p className="text-lg font-black text-slate-900">{selectedInvoice.warehouse?.name}</p>
                    <p className="text-sm font-bold text-slate-500 mt-1">{selectedInvoice.warehouse?.address || '---'}</p>
                  </div>
                  <div className="rounded-[22px] bg-slate-50 p-4 md:rounded-3xl md:p-6">
                    <div className="flex items-center space-x-3 text-slate-400 mb-4">
                      <Clock size={18} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Статус</span>
                    </div>
                    <div>{getStatusBadge(getEffectiveStatus(selectedInvoice), selectedInvoice.cancelled)}</div>
                    <p className="text-sm font-bold text-slate-500 mt-2">Сотрудник: {selectedInvoice.staff_name}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest ml-2">Товары</h4>
                  <div className="overflow-hidden rounded-[22px] border border-slate-100 bg-white md:rounded-3xl">
                    <div className="space-y-3 p-3 md:hidden">
                      {selectedInvoice.items.map((item: any) => {
                        const quantityInfo = getInvoiceItemQuantityParts(item);

                        return (
                          <div key={`mobile-item-${item.id}`} className="rounded-2xl bg-slate-50 p-3">
                            <p className="break-words text-sm font-black text-slate-900">{formatProductName(item.product_name)}</p>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                              <div className="rounded-xl bg-white px-2.5 py-2">
                                <p className="text-[9px] uppercase tracking-[0.14em] text-slate-400">Кол-во</p>
                                <p className="mt-1 whitespace-nowrap text-xs font-semibold text-slate-700">{quantityInfo.primary}</p>
                                {quantityInfo.secondary && (
                                  <p className="mt-0.5 whitespace-nowrap text-[10px] text-slate-400">{quantityInfo.secondary}</p>
                                )}
                              </div>
                              <div className="rounded-xl bg-white px-2.5 py-2">
                                <p className="text-[9px] uppercase tracking-[0.14em] text-slate-400">Цена</p>
                                <p className="mt-1 font-bold text-slate-700">{formatMoney(item.sellingPrice)}</p>
                              </div>
                              <div className="rounded-xl bg-white px-2.5 py-2">
                                <p className="text-[9px] uppercase tracking-[0.14em] text-slate-400">Итого</p>
                                <p className="mt-1 font-black text-slate-900">{formatMoney(item.totalPrice)}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <table className="hidden w-full text-left md:table">
                      <thead>
                        <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">
                          <th className="px-6 py-4">Товар</th>
                          <th className="px-6 py-4">Кол-во</th>
                          <th className="px-6 py-4">Цена</th>
                          <th className="px-6 py-4 text-right">Итого</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {selectedInvoice.items.map((item: any) => {
                          const quantityInfo = getInvoiceItemQuantityParts(item);

                          return (
                            <tr key={item.id}>
                              <td className="px-6 py-4">
                                <p className="font-black text-slate-900">{formatProductName(item.product_name)}</p>
                                {item.saleAllocations && item.saleAllocations.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {item.saleAllocations.map((sa: any) => (
                                      <span key={sa.id} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 text-[8px] rounded font-black uppercase tracking-tighter">
                                        Партия #{sa.batchId} ({sa.quantity} {item.unit})
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-[11px] text-slate-500">
                                <p className="whitespace-nowrap text-xs font-semibold text-slate-700">{quantityInfo.primary}</p>
                                {quantityInfo.secondary && (
                                  <p className="mt-0.5 whitespace-nowrap text-[10px] text-slate-400">{quantityInfo.secondary}</p>
                                )}
                              </td>
                              <td className="px-6 py-4 font-bold text-slate-500">{formatMoney(item.sellingPrice)}</td>
                              <td className="px-6 py-4 text-right font-black text-slate-900">{formatMoney(item.totalPrice)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-end">
                  <div className="w-full max-w-xs space-y-3">
                    <div className="flex items-center justify-between text-sm text-slate-500">
                      <span className="font-bold">Подытог:</span>
                      <span className="font-black">{formatMoney(getInvoiceSubtotal(selectedInvoice))}</span>
                    </div>
                    {getInvoiceChangeAmount(selectedInvoice) > PAYMENT_EPSILON && (
                      <div className="flex items-center justify-between text-sm text-slate-500">
                        <span className="font-bold">Сдача клиенту:</span>
                        <span className="font-black text-amber-600">{formatMoney(getInvoiceChangeAmount(selectedInvoice))}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm text-slate-500">
                      <span className="font-bold">Скидка ({selectedInvoice.discount}%):</span>
                      <span className="font-black">-{formatMoney(getInvoiceDiscountAmount(selectedInvoice))}</span>
                    </div>
                    {selectedInvoice.returnedAmount > 0 && (
                      <div className="flex items-center justify-between text-sm text-rose-500">
                        <span className="font-bold">Возвращено:</span>
                        <span className="font-black">-{formatMoney(selectedInvoice.returnedAmount || 0)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xl font-black text-slate-900 md:text-2xl">
                      <span>Итого:</span>
                      <span>{formatMoney(getInvoiceNetAmount(selectedInvoice))}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm text-slate-500">
                      <span className="font-bold">Оплачено:</span>
                      <span className="font-black text-emerald-600">{formatMoney(getInvoiceAppliedPaidAmount(selectedInvoice))}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-slate-500">
                      <span className="font-bold">Остаток (Долг):</span>
                      <span className="font-black text-rose-600">{formatMoney(getInvoiceBalance(selectedInvoice))}</span>
                    </div>
                  </div>
                </div>

                {selectedInvoice.payments && selectedInvoice.payments.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest ml-2">История платежей</h4>
                    <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                            <th className="px-6 py-4">Дата</th>
                            <th className="px-6 py-4">Сумма</th>
                            <th className="px-6 py-4">Сотрудник</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {selectedInvoice.payments.map((p: any) => (
                            <tr key={p.id}>
                              <td className="px-6 py-4 font-bold text-slate-500">{new Date(p.createdAt).toLocaleString('ru-RU')}</td>
                              <td className="px-6 py-4 font-black text-emerald-600">{formatMoney(p.amount)}</td>
                              <td className="px-6 py-4 text-slate-500">{p.staff_name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {selectedInvoice.returns && selectedInvoice.returns.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest ml-2">История возвратов</h4>
                    <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                            <th className="px-6 py-4">Дата</th>
                            <th className="px-6 py-4">Сумма</th>
                            <th className="px-6 py-4">Причина</th>
                            <th className="px-6 py-4">Сотрудник</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {selectedInvoice.returns.map((r: any) => (
                            <tr key={r.id}>
                              <td className="px-6 py-4 font-bold text-slate-500">{new Date(r.createdAt).toLocaleString('ru-RU')}</td>
                              <td className="px-6 py-4 font-black text-rose-600">-{formatMoney(r.totalValue)}</td>
                              <td className="px-6 py-4 text-slate-500 italic">{r.reason}</td>
                              <td className="px-6 py-4 text-slate-500">{r.staff_name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 bg-slate-50 p-4 md:p-8">
                <button
                    onClick={() => {
                      if (isPaymentActionDisabled(selectedInvoice)) return;
                      setPaymentAmount(String(toFixedNumber(getInvoiceBalance(selectedInvoice))));
                      setShowPaymentModal(true);
                    }}
                    disabled={isPaymentActionDisabled(selectedInvoice)}
                    className={`inline-flex items-center gap-2 rounded-2xl border px-6 py-3 text-sm font-bold transition-all md:px-8 md:py-4 ${
                      isPaymentActionDisabled(selectedInvoice)
                        ? 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-300'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    <Banknote size={18} />
                    <span>Оплата</span>
                  </button>
                <button
                    onClick={() => {
                      void openReturnInvoiceModal(selectedInvoice);
                    }}
                    disabled={isReturnActionDisabled(selectedInvoice)}
                    className={`inline-flex items-center gap-2 rounded-2xl border px-6 py-3 text-sm font-bold transition-all md:px-8 md:py-4 ${
                      isReturnActionDisabled(selectedInvoice)
                        ? 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-300'
                        : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                    }`}
                  >
                    <RotateCcw size={18} />
                    <span>Возврат</span>
                  </button>
                <button
                  onClick={() => handlePrintInvoice(selectedInvoice)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-6 py-3 text-sm font-bold text-indigo-700 transition-all hover:bg-indigo-100 md:px-8 md:py-4"
                >
                  <Printer size={18} />
                  <span>Печать</span>
                </button>
                <button 
                  onClick={closeDetailsModal}
                  className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 md:px-10 md:py-4"
                >
                  Закрыть
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEditModal && selectedInvoice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeEditModal}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center sm:p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-[2.5rem]"
            >
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-4 sm:p-8">
                <div className="flex items-center space-x-4">
                  <div className="rounded-2xl bg-violet-600 p-3 text-white">
                    <Pencil size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900">Изменить продажу</h3>
                    <p className="text-sm font-bold text-slate-500">Накладная #{selectedInvoice.id}</p>
                  </div>
                </div>
                <button onClick={closeEditModal} className="text-slate-400 transition-colors hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:space-y-6 sm:p-8">
                <div>
                  <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Клиент</label>
                  <select
                    value={editCustomerId}
                    onChange={(e) => setEditCustomerId(e.target.value ? Number(e.target.value) : '')}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-slate-900 outline-none transition-all focus:border-violet-300 focus:ring-8 focus:ring-violet-500/5"
                  >
                    <option value="">Без названия</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-3 text-sm text-slate-500">
                    При смене клиента переносится только текущая накладная (и ее оплаты/возвраты).
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Товары в накладной</p>
                      <p className="mt-1 text-sm text-slate-500">Удалите неверную строку, выберите другой товар и сохраните накладную.</p>
                    </div>
                    <button
                      type="button"
                      onClick={addEditInvoiceItem}
                      className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-4 py-2 text-sm font-bold text-violet-700 transition-all hover:bg-violet-50"
                    >
                      <Plus size={16} />
                      <span>Добавить товар</span>
                    </button>
                  </div>

                  <div className="relative">
                    <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={editInvoiceSearch}
                      onChange={(e) => setEditInvoiceSearch(e.target.value)}
                      placeholder="Поиск товара внутри накладной..."
                      className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition-all focus:border-violet-300 focus:ring-8 focus:ring-violet-500/5"
                    />
                  </div>

                  <div className="space-y-3">
                    {filteredEditInvoiceItems.map((item) => {
                      const index = editInvoiceItems.findIndex((entry) => entry.key === item.key);
                      const selectedProduct = getEditProductMeta(item.productId);
                      const itemMaxAllowedQuantity = getEditItemMaxAllowedQuantity(item, editInvoiceItems);
                      const selectedPackagingForRow = getEditItemPackaging(item);
                      const unitsPerPackageForRow = Math.max(0, Number(selectedPackagingForRow?.unitsPerPackage || 0));
                      const maxPackageCount =
                        selectedPackagingForRow && unitsPerPackageForRow > 0
                          ? Math.floor(itemMaxAllowedQuantity / unitsPerPackageForRow)
                          : 0;
                      const visibleEditProducts = editProducts
                        .filter((product) => {
                          const productId = Number(product.id);
                          const isSelectedProduct = productId === Number(item.productId || 0);
                          const hasStock = Math.max(0, Number(product.stock || 0)) > 0;
                          return isSelectedProduct || hasStock;
                        })
                        .filter((product) => {
                          const query = editProductMenuSearch.trim().toLowerCase();
                          if (!query) return true;
                          return formatProductName(product.name).toLowerCase().includes(query);
                        });

                      return (
                        <div
                          key={item.key}
                          className={`rounded-3xl border p-3.5 shadow-sm transition-all ${
                            item.isNew
                              ? 'border-violet-200 bg-violet-50/60 shadow-violet-100'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="mb-2.5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Строка #{index + 1}</p>
                              {item.isNew ? (
                                <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">
                                  Новая
                                </span>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeEditInvoiceItem(item.key)}
                              disabled={editInvoiceItems.length === 1}
                              className="inline-flex items-center gap-1 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Trash2 size={14} />
                              <span>Убрать</span>
                            </button>
                          </div>

                          <div className="space-y-3">
                            <div className="space-y-2">
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Товар</p>
                              <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenEditProductMenuKey((current) => {
                                        const nextKey = current === item.key ? null : item.key;
                                        setEditProductMenuSearch('');
                                        return nextKey;
                                      });
                                    }}
                                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-900 transition-all hover:border-violet-200 focus:border-violet-300 focus:ring-8 focus:ring-violet-500/5"
                                  >
                                  <span className="truncate">
                                    {selectedProduct ? formatProductName(selectedProduct.name) : 'Выберите товар из списка'}
                                  </span>
                                  <ChevronDown size={18} className="shrink-0 text-slate-400" />
                                </button>

                                {openEditProductMenuKey === item.key ? (
                                  <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
                                    <div className="border-b border-slate-100 p-3">
                                      <div className="relative">
                                        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                          type="text"
                                          value={editProductMenuSearch}
                                          onChange={(e) => setEditProductMenuSearch(e.target.value)}
                                          placeholder="Поиск товара..."
                                          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition-all focus:border-violet-300 focus:bg-white"
                                        />
                                      </div>
                                    </div>
                                    <div className="max-h-64 overflow-y-auto py-2">
                                      {visibleEditProducts
                                        .map((product, productIndex) => {
                                          const stockInfo = getProductStockParts(product as EditProductOption);

                                          return (
                                            <button
                                              key={product.id}
                                              type="button"
                                              onClick={() => {
                                                selectEditProductForItem(item.key, product);
                                                setOpenEditProductMenuKey(null);
                                                setEditProductMenuSearch('');
                                              }}
                                              className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-all hover:bg-slate-50"
                                            >
                                              <div className="min-w-0">
                                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">#{productIndex + 1}</p>
                                                <p className="truncate text-sm font-bold text-slate-900">
                                                  {formatProductName(product.name)}
                                                </p>
                                                <p className="mt-1 text-xs font-medium text-slate-600">{stockInfo.primary}</p>
                                                {stockInfo.secondary && (
                                                  <p className="mt-0.5 text-[10px] text-slate-400">{stockInfo.secondary}</p>
                                                )}
                                              </div>
                                            </button>
                                          );
                                        })}
                                      {!visibleEditProducts.length ? (
                                        <div className="px-4 py-6 text-center text-sm font-medium text-slate-400">
                                          Ничего не найдено
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                              <p className={`break-words text-sm font-semibold leading-6 ${selectedProduct ? 'text-slate-900' : 'text-violet-700'}`}>
                                {selectedProduct ? formatProductName(selectedProduct.name) : 'Сначала выберите товар, потом укажите тип продажи и количество'}
                              </p>
                            </div>

                            <div className="space-y-2">
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Тип продажи и количество</p>
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_1.1fr]">
                                  <select
                                    value={item.selectedPackagingId ? 'bulk' : 'piece'}
                                    onChange={(e) => {
                                      const bulkPackaging = getEditItemDefaultBulkPackaging(item);
                                      const isBulk = e.target.value === 'bulk' && bulkPackaging;
                                      updateNormalizedEditInvoiceItem(item.key, {
                                        selectedPackagingId: isBulk ? Number(bulkPackaging?.id || '') : '',
                                        packageQuantityInput: isBulk ? (item.packageQuantityInput || '1') : '0',
                                        extraUnitQuantityInput: isBulk ? item.extraUnitQuantityInput || '0' : item.quantity || '1',
                                      });
                                    }}
                                    disabled={!selectedProduct}
                                    className="w-full rounded-2xl border border-white bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition-all focus:border-violet-300 focus:ring-8 focus:ring-violet-500/5"
                                  >
                                    <option value="piece">Розница</option>
                                    {getEditItemDefaultBulkPackaging(item) ? (
                                      <option value="bulk">Оптом</option>
                                    ) : null}
                                  </select>
                                  <div className="flex items-center rounded-2xl bg-white px-4 py-3 text-xs font-semibold leading-5 text-slate-500">
                                    {!selectedProduct
                                      ? 'Выберите товар, чтобы появился режим продажи'
                                      : item.selectedPackagingId && getEditItemPackaging(item)
                                      ? `По умолчанию: ${getEditItemPackaging(item)?.packageName} x ${getEditItemPackaging(item)?.unitsPerPackage}`
                                      : 'Продажа в розницу'}
                                  </div>
                                </div>
                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                {item.selectedPackagingId ? (
                                  <>
                                    <input
                                      type="number"
                                      min="0"
                                      max={maxPackageCount}
                                      step="1"
                                      value={item.packageQuantityInput}
                                      onChange={(e) => updateNormalizedEditInvoiceItem(item.key, { packageQuantityInput: e.target.value })}
                                      placeholder="Кол-во упаковок"
                                      disabled={!selectedProduct}
                                      className="rounded-2xl border border-white bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition-all focus:border-violet-300 focus:ring-8 focus:ring-violet-500/5"
                                    />
                                    <input
                                      type="number"
                                      min="0"
                                      max={itemMaxAllowedQuantity}
                                      step="0.01"
                                      value={item.extraUnitQuantityInput}
                                      onChange={(e) => updateNormalizedEditInvoiceItem(item.key, { extraUnitQuantityInput: e.target.value })}
                                      placeholder="+ шт"
                                      disabled={!selectedProduct}
                                      className="rounded-2xl border border-white bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition-all focus:border-violet-300 focus:ring-8 focus:ring-violet-500/5"
                                    />
                                  </>
                                ) : (
                                  <input
                                    type="number"
                                    min="0"
                                    max={itemMaxAllowedQuantity}
                                    step="1"
                                    value={item.extraUnitQuantityInput}
                                    onChange={(e) => updateNormalizedEditInvoiceItem(item.key, { extraUnitQuantityInput: e.target.value })}
                                    placeholder="Кол-во, шт"
                                    disabled={!selectedProduct}
                                    className="sm:col-span-2 rounded-2xl border border-white bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition-all focus:border-violet-300 focus:ring-8 focus:ring-violet-500/5"
                                  />
                                )}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-4">
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Кол-во</p>
                              <p className="mt-1 text-sm font-bold text-slate-900">
                                {item.selectedPackagingId
                                  ? (() => {
                                      const selectedPackaging = getEditItemPackaging(item);
                                      const packageCount = Math.max(0, Number(item.packageQuantityInput || 0) || 0);
                                      const extraCount = Math.max(0, Number(item.extraUnitQuantityInput || 0) || 0);
                                      const lines = [];
                                      if (packageCount > 0 && selectedPackaging) {
                                        lines.push(`${packageCount} ${selectedPackaging.packageName}`);
                                      }
                                      if (extraCount > 0 || lines.length === 0) {
                                        lines.push(`${extraCount} ${item.baseUnitName || 'шт'}`);
                                      }
                                      return lines.join(' + ');
                                    })()
                                  : (Number(item.quantity || 0) > 0 ? `${item.quantity} ${item.baseUnitName || 'шт'}` : '0')}
                              </p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Цена</p>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.sellingPrice}
                                onChange={(e) => updateNormalizedEditInvoiceItem(item.key, { sellingPrice: e.target.value })}
                                placeholder="Цена"
                                disabled={!selectedProduct}
                                className="mt-1 w-full rounded-xl border border-white bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none transition-all focus:border-violet-300 focus:ring-8 focus:ring-violet-500/5"
                              />
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Скидка %</p>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={item.discount}
                                onChange={(e) => updateNormalizedEditInvoiceItem(item.key, { discount: e.target.value })}
                                placeholder="%"
                                disabled={!selectedProduct}
                                className="mt-1 w-full rounded-xl border border-white bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none transition-all focus:border-violet-300 focus:ring-8 focus:ring-violet-500/5"
                              />
                            </div>
                            <div className="rounded-2xl bg-violet-50 px-4 py-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-500">Итого</p>
                              <p className="mt-1 text-sm font-black text-violet-700">
                                {(() => {
                                  const q = Math.max(0, Number(item.quantity || 0));
                                  const p = Math.max(0, Number(item.sellingPrice || 0));
                                  const d = Math.max(0, Number(item.discount || 0));
                                  return formatMoney(q * ceilMoney(p * (1 - d / 100)));
                                })()}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            <span>Ед.: {item.baseUnitName || selectedProduct?.baseUnitName || selectedProduct?.unit || item.unit || 'шт'}</span>
                            {item.selectedPackagingId && getEditItemPackaging(item) ? (
                              <span>
                                По умолчанию: {getEditItemPackaging(item)?.packageName} x {getEditItemPackaging(item)?.unitsPerPackage}
                              </span>
                            ) : null}
                            {selectedProduct ? (
                              <span>
                                Остаток сейчас: {getProductStockParts(selectedProduct as EditProductOption).primary}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    {!filteredEditInvoiceItems.length && (
                      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                        По этому поиску товары в накладной не найдены.
                      </div>
                    )}
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Товаров</p>
                        <p className="mt-1 text-lg font-black text-slate-900">{editInvoiceItems.length}</p>
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Сумма</p>
                        <p className="mt-1 text-lg font-black text-slate-900">{formatMoney(editInvoiceSubtotal)}</p>
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Скидка %</p>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={editDiscount}
                          onChange={(e) => {
                            const value = e.target.value;
                            setEditDiscount(value === '' ? '' : String(Math.max(0, Math.min(100, Number(value) || 0))));
                          }}
                          className="mt-1 w-full text-lg font-black text-violet-600 outline-none transition-all"
                          placeholder="0"
                        />
                      </div>
                      <div className="rounded-2xl bg-violet-600 px-4 py-3 text-white">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-100">Итого</p>
                        <p className="mt-1 text-lg font-black">{formatMoney(editInvoiceNetAmount)}</p>
                      </div>
                    </div>
                  </div>
                  {Number(selectedInvoice?.tax || 0) > 0 ? (
                    <p className="mt-3 text-sm text-slate-500">
                      Налог: +{formatMoney(editInvoiceTaxAmount)}
                    </p>
                  ) : null}
                </div> {/* container of summary and list (space-y-4 line 2004) */}
              </div> {/* scrollable area (line 1985) */}

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50 p-4 sm:flex-row sm:p-8">
                <button
                  onClick={closeEditModal}
                  className="flex-1 rounded-2xl border border-slate-200 bg-white py-4 font-bold text-slate-700 transition-all hover:bg-slate-50"
                >
                  Отмена
                </button>
                <button
                  onClick={handleUpdateInvoice}
                  disabled={isSavingEdit}
                  className="flex-1 rounded-2xl bg-violet-600 py-4 font-black uppercase tracking-widest text-white shadow-lg shadow-violet-600/20 transition-all hover:bg-violet-700 disabled:opacity-50"
                >
                  {isSavingEdit ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPaymentModal && selectedInvoice && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closePaymentModal}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center sm:p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2.5rem]"
            >
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-4 sm:p-8">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-emerald-600 text-white rounded-2xl">
                    <Banknote size={24} />
                  </div>
                  <h3 className="text-2xl font-black text-slate-900">Принять оплату</h3>
                </div>
                <button onClick={closePaymentModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="space-y-5 p-4 sm:space-y-6 sm:p-8">
                <div>
                    <p className="text-sm font-bold text-slate-500 mb-1">Накладная #{selectedInvoice.id}</p>
                  <p className="text-lg font-black text-slate-900">{selectedInvoice.customer_name}</p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="p-4 bg-slate-50 rounded-2xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Итого</p>
                    <p className="text-lg font-black text-slate-900">{formatMoney(getInvoiceNetAmount(selectedInvoice))}</p>
                  </div>
                  <div className="p-4 bg-rose-50 rounded-2xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Долг</p>
                    <p className="text-lg font-black text-rose-600">{formatMoney(getInvoiceBalance(selectedInvoice))}</p>
                  </div>
                </div>

                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Сумма оплаты</label>
                  <input 
                    type="number" 
                    min={0}
                    value={paymentAmount}
                    onChange={(e) => {
                      const value = e.target.value;
                      setPaymentAmount(value === '' ? '' : String(Math.max(0, Number(value) || 0)));
                    }}
                    className="w-full mt-1 px-5 py-4 rounded-2xl border border-slate-200 focus:ring-8 focus:ring-emerald-500/5 focus:border-emerald-500 outline-none transition-all font-black text-2xl text-slate-900 shadow-sm"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
              </div>
              
              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50 p-4 sm:flex-row sm:p-8">
                <button 
                  onClick={closePaymentModal}
                  className="flex-1 py-4 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold hover:bg-slate-50 transition-all"
                >
                  Отмена
                </button>
                <button 
                  onClick={handlePayment}
                  disabled={isPaying || !paymentAmount}
                  className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isPaying ? 'Сохранение...' : 'Внести'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showReturnModal && selectedInvoice && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeReturnModal}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center sm:p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-[2.5rem]"
            >
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-4 sm:p-8">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-amber-600 text-white rounded-2xl">
                    <RotateCcw size={24} />
                  </div>
                  <h3 className="text-2xl font-black text-slate-900">Оформить возврат</h3>
                </div>
                <button onClick={closeReturnModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:space-y-6 sm:p-8">
                <div>
                    <p className="text-sm font-bold text-slate-500 mb-1">Накладная #{selectedInvoice.id}</p>
                  <p className="text-lg font-black text-slate-900">{selectedInvoice.customer_name}</p>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Выберите товары для возврата</h4>
                  <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden">
                    <table className="w-full table-fixed text-left text-sm">
                      <colgroup>
                        <col className="w-[38%]" />
                        <col className="w-[40%]" />
                        <col className="w-[22%]" />
                      </colgroup>
                      <thead>
                        <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                          <th className="px-6 py-4">Товар</th>
                          <th className="px-6 py-4">Продано</th>
                          <th className="px-6 py-4">Возврат</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {returnItems.map((item: ReturnInvoiceItem, idx: number) => {
                          const quantityInfo = getInvoiceItemQuantityParts(item);
                          const packaging = getReturnItemPackaging(item);
                          const remainingUnits = getReturnItemRemainingUnits(item);
                          const maxPackages = packaging ? Math.floor(remainingUnits / packaging.unitsPerPackage) : 0;
                          const inputMax = item.returnMode === 'package' ? maxPackages : remainingUnits;
                          const itemMeta = [
                            `Строка #${idx + 1}`,
                            item?.product?.sku ? `Артикул: ${item.product.sku}` : null,
                            item?.brandSnapshot || item?.product?.brand ? `Бренд: ${item.brandSnapshot || item.product.brand}` : null,
                          ].filter(Boolean).join(' · ');

                          return (
                            <tr key={item.id}>
                              <td className="px-6 py-4">
                                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                                  {itemMeta}
                                </p>
                                <p className="break-words text-sm font-black leading-5 text-slate-900">
                                  {getReturnItemDisplayName(item)}
                                </p>
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-[11px] text-slate-500">
                                <p className="whitespace-nowrap text-xs font-semibold text-slate-700">{quantityInfo.primary}</p>
                                {quantityInfo.secondary && (
                                  <p className="mt-0.5 whitespace-nowrap text-[10px] text-slate-400">{quantityInfo.secondary}</p>
                                )}
                                <p className="mt-1 whitespace-nowrap text-[10px] text-slate-400">
                                  Доступно: {packaging ? `${maxPackages} ${packaging.packageName} или ` : ''}{formatCount(remainingUnits)} {packaging?.baseUnitName || 'шт'}
                                </p>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-2 sm:flex-row">
                                  {packaging ? (
                                    <select
                                      value={item.returnMode}
                                      onChange={(e) => {
                                        const newItems = [...returnItems] as ReturnInvoiceItem[];
                                        newItems[idx] = {
                                          ...newItems[idx],
                                          returnMode: e.target.value === 'package' ? 'package' : 'unit',
                                          returnQty: '',
                                        };
                                        setReturnItems(newItems);
                                      }}
                                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500"
                                    >
                                      <option value="package">{packaging.packageName}</option>
                                      <option value="unit">{packaging.baseUnitName}</option>
                                    </select>
                                  ) : null}
                                  <input 
                                    type="number" 
                                    min="0"
                                    step="0.01"
                                    max={inputMax}
                                    value={item.returnQty}
                                    onChange={(e) => {
                                      const newItems = [...returnItems] as ReturnInvoiceItem[];
                                      newItems[idx] = {
                                        ...newItems[idx],
                                        returnQty: e.target.value,
                                      };
                                      setReturnItems(newItems);
                                    }}
                                    placeholder={item.returnMode === 'package' ? 'Кол-во коробок' : 'Кол-во шт'}
                                    className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-black text-center outline-none focus:ring-2 focus:ring-amber-500"
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Причина возврата</label>
                  <textarea 
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="w-full mt-1 px-5 py-4 rounded-2xl border border-slate-200 focus:ring-8 focus:ring-amber-500/5 focus:border-amber-500 outline-none transition-all font-bold text-slate-900 shadow-sm min-h-[100px]"
                    placeholder="Укажите причину возврата..."
                  />
                </div>
              </div>
              
              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50 p-4 sm:flex-row sm:p-8">
                <button 
                  onClick={closeReturnModal}
                  className="flex-1 py-4 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold hover:bg-slate-50 transition-all"
                >
                  Отмена
                </button>
                <button 
                  onClick={handleReturn}
                  disabled={isReturning || returnItems.every((item: ReturnInvoiceItem) => !item.returnQty || parseFloat(item.returnQty) === 0)}
                  className="flex-1 py-4 bg-amber-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-amber-600/20 hover:bg-amber-700 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isReturning ? 'Оформление...' : 'Оформить возврат'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}


