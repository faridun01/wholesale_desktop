import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import client from '../api/client';
import * as ProductsApi from '../api/products.api';
const {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  restockProduct,
  getProductHistory,
  mergeProduct,
  reverseIncomingTransaction,
  reverseCorrectionWriteOffTransaction,
  deleteProductBatch,
  writeOffProduct,
  returnWriteOffTransaction,
  deleteWriteOffTransactionPermanently
} = ProductsApi as any;
import {
  Plus,
  PlusCircle,
  Search,
  Filter,
  Package,
  ArrowRightLeft,
  Edit,
  Trash2,
  Camera,
  Loader2,
  ChevronUp,
  ChevronDown,
  Scissors,
  X,
  History,
  Tag,
  FileText,
  DollarSign,
  Layers,
  GitMerge,
  Image as ImageIcon,
  RotateCcw,
  AlertTriangle,
  Store,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { formatDollar, formatMoney, formatPercent, roundMoney, toFixedNumber } from '../utils/format';
import {
  calculateEffectiveCost,
  calculateLineTotal,
  calculateUnitCostFromLineTotal,
  calculateUnitCostFromPackage,
} from '../utils/money';
import { getProductBatches } from '../api/products.api';
import { getWarehouses } from '../api/warehouses.api';
import { createSettingsCategory, getSettingsCategories } from '../api/settings-reference.api';
import { filterWarehousesForUser, getCurrentUser, getUserWarehouseId, isAdminUser } from '../utils/userAccess';
import { handleBrokenImage, resolveMediaUrl } from '../utils/media';
import { formatProductName } from '../utils/productName';
import { getDefaultWarehouseId } from '../utils/warehouse';
import ConfirmationModal from '../components/common/ConfirmationModal';
import PaginationControls from '../components/common/PaginationControls';

const normalizeVolumeSpacing = (value: string) =>
  value
    .replace(/(\d)\s*[.,]\s*(\d)/gu, '$1.$2')
    .replace(/(\d)\s+(\d)(?=\s*(?:гр|г|кг|л|мл)\b)/giu, '$1.$2')
    .replace(/(\d(?:\.\d+)?)\s*(гр|г|кг|л|мл|шт)\b/giu, '$1 $2');

const normalizeCatalogName = (name: string) =>
  normalizeVolumeSpacing(String(name || ''))
    .replace(/\s*\[[^\]]*\]\s*$/u, '')
    .replace(/[«»“”„‟"']/gu, '')
    .replace(/[(),]/gu, ' ')
    .replace(/[ёЁ]/g, 'е')
    .replace(/plasticковых/gi, 'пластиковых')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const normalizeProductFamilyName = (name: string) =>
  normalizeCatalogName(name)
    .replace(/\bмассой\s+\d+(?:\.\d+)?\s*(?:гр|г|кг|л|мл|шт)\b/giu, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:гр|г|кг|л|мл|шт)\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const extractMassKey = (name: string) => {
  const match = normalizeVolumeSpacing(String(name || '').toLowerCase()).match(/(\d+(?:\.\d+)?)\s*(гр|г|кг|л|мл|шт)\b/u);
  return match ? `${match[1]} ${match[2]}` : '';
};

const detectCategoryName = (name: string) => {
  const normalized = String(name || '').toLowerCase().replace(/[ё]/g, 'е');

  if (normalized.includes('порошок') && normalized.includes('автомат')) return 'Стиральные порошки';
  if (normalized.includes('порошок')) return 'Стиральные средства';
  if (normalized.includes('жидк') && normalized.includes('стира')) return 'Жидкие средства для стирки';
  if (normalized.includes('гель') && normalized.includes('посуд')) return 'Гели для посуды';
  if (normalized.includes('капля') && normalized.includes('посуд')) return 'Средства для мытья посуды';
  if (normalized.includes('посуд')) return 'Средства для мытья посуды';
  if (normalized.includes('чистящее средство')) return 'Чистящие средства';

  const words = String(name || '').trim().split(/\s+/).filter(Boolean);

  return 'Прочее';
};

const normalizeBaseUnit = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'шт';
  if (['шт', 'штук', 'штука', 'штуки', 'pcs', 'piece', 'pieces'].includes(normalized)) return 'шт';
  if (['пачка', 'пачки', 'пачек'].includes(normalized)) return 'пачка';
  if (['флакон', 'флакона', 'флаконов'].includes(normalized)) return 'флакон';
  if (['емкость', 'ёмкость', 'емкости', 'ёмкости', 'емкостей', 'ёмкостей'].includes(normalized)) return 'ёмкость';
  if (['бутылка', 'бутылки', 'бутылок'].includes(normalized)) return 'бутылка';
  return normalized;
};

const normalizePackageName = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (['мешок', 'мешка', 'мешков', 'bag'].includes(normalized)) return 'мешок';
  if (['коробка', 'коробки', 'коробок', 'box'].includes(normalized)) return 'коробка';
  if (['упаковка', 'упаковки', 'упаковок', 'pack'].includes(normalized)) return 'упаковка';
  if (['пачка', 'пачки', 'пачек'].includes(normalized)) return 'пачка';
  return normalized;
};

const normalizeDisplayBaseUnit = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'шт';
  if (['пачка', 'пачки', 'пачек', 'шт', 'штук', 'штука', 'штуки', 'pcs', 'piece', 'pieces'].includes(normalized)) {
    return 'шт';
  }
  return normalized;
};

const formatPriceInput = (value: unknown): string => {
  if (value === '' || value === null || value === undefined) {
    return '';
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(toFixedNumber(numeric)) : '';
};

type PackagingOption = {
  id: number;
  packageName: string;
  baseUnitName: string;
  unitsPerPackage: number;
  isDefault?: boolean;
};

type ProductFormData = {
  name: string;
  unit: string;
  baseUnitName: string;
  packagingEnabled: boolean;
  packageName: string;
  unitsPerPackage: string;
  categoryId: string;
  warehouseId: string;
  costPrice: string;
  expensePercent: string;
  sellingPrice: string;
  minStock: string;
  initialStock: string;
  photoUrl: string;
};

const createEmptyProductForm = (): ProductFormData => ({
  name: '',
  unit: 'шт',
  baseUnitName: 'шт',
  packagingEnabled: true,
  packageName: 'коробка',
  unitsPerPackage: '',
  categoryId: '',
  warehouseId: '',
  costPrice: '',
  expensePercent: '0',
  sellingPrice: '',
  minStock: '0',
  initialStock: '0',
  photoUrl: ''
});

const buildProductFormData = (product?: any): ProductFormData => {
  if (!product) {
    return createEmptyProductForm();
  }

  const defaultPackaging = getDefaultPackaging(normalizePackagings(product));
  const baseUnitName = normalizeBaseUnit(product.baseUnitName || product.unit || 'шт');
  const unitsPerPackage = Number(defaultPackaging?.unitsPerPackage || 0);

  return {
    name: product.name || '',
    unit: baseUnitName,
    baseUnitName,
    packagingEnabled: unitsPerPackage > 0,
    packageName: normalizePackageName(defaultPackaging?.packageName || 'коробка') || 'коробка',
    unitsPerPackage: unitsPerPackage > 0 ? String(unitsPerPackage) : '',
    categoryId: product.categoryId?.toString() || '',
    warehouseId: product.warehouseId?.toString() || '',
    costPrice: formatPriceInput(product.purchaseCostPrice ?? product.costPrice),
    expensePercent: String(product.expensePercent ?? 0),
    sellingPrice: formatPriceInput(product.sellingPrice),
    minStock: product.minStock?.toString() || '0',
    initialStock: product.initialStock?.toString() || '0',
    photoUrl: product.photoUrl || ''
  };
};

const buildProductSubmitPayload = (formData: ProductFormData, categoryId: number) => {
  const baseUnitName = normalizeBaseUnit(formData.baseUnitName || formData.unit || 'шт');
  const unitsPerPackage = Number(formData.unitsPerPackage || 0);
  const packagingEnabled = formData.packagingEnabled && unitsPerPackage > 0;

  return {
    name: formData.name,
    unit: baseUnitName,
    baseUnitName,
    categoryId,
    warehouseId: Number(formData.warehouseId),
    costPrice: roundMoney(formData.costPrice),
    purchaseCostPrice: roundMoney(formData.costPrice),
    expensePercent: parseFloat(formData.expensePercent || '0'),
    sellingPrice: roundMoney(formData.sellingPrice),
    minStock: parseFloat(formData.minStock),
    initialStock: parseFloat(formData.initialStock),
    photoUrl: formData.photoUrl,
    packaging: packagingEnabled
      ? {
        packageName: normalizePackageName(formData.packageName || 'коробка'),
        baseUnitName,
        unitsPerPackage,
        isDefault: true,
      }
      : null,
  };
};

const normalizePackagings = (product: any): PackagingOption[] =>
  Array.isArray(product?.packagings)
    ? product.packagings
      .map((entry: any) => ({
        id: Number(entry.id),
        packageName: String(entry.packageName || '').trim(),
        baseUnitName: String(entry.baseUnitName || product?.unit || 'шт').trim() || 'шт',
        unitsPerPackage: Number(entry.unitsPerPackage || 0),
        isDefault: Boolean(entry.isDefault),
      }))
      .filter((entry: PackagingOption) => entry.id > 0 && entry.packageName && entry.unitsPerPackage > 0)
    : [];

const getDefaultPackaging = (packagings: PackagingOption[]) =>
  packagings.find((entry) => entry.isDefault) || packagings[0] || null;

const getPreferredPackaging = (product: any) => {
  const packagings = Array.isArray(product?.packagings) ? product.packagings : [];
  return (
    packagings.find((packaging: any) => packaging?.isDefault && Number(packaging?.unitsPerPackage || 0) > 1) ||
    packagings.find((packaging: any) => Number(packaging?.unitsPerPackage || 0) > 1) ||
    null
  );
};

const pluralizeRu = (count: number, forms: [string, string, string]) => {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;

  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
};

const formatCountWithUnit = (count: number, unit: string) => {
  const normalized = String(unit || '').trim().toLowerCase();
  const formsMap: Record<string, [string, string, string]> = {
    'шт': ['шт', 'шт', 'шт'],
    'штука': ['штука', 'штуки', 'штук'],
    'пачка': ['пачка', 'пачки', 'пачек'],
    'мешок': ['мешок', 'мешка', 'мешков'],
    'коробка': ['коробка', 'коробки', 'коробок'],
    'упаковка': ['упаковка', 'упаковки', 'упаковок'],
    'флакон': ['флакон', 'флакона', 'флаконов'],
    'ёмкость': ['ёмкость', 'ёмкости', 'ёмкостей'],
    'емкость': ['ёмкость', 'ёмкости', 'ёмкостей'],
    'бутылка': ['бутылка', 'бутылки', 'бутылок'],
  };

  const forms = formsMap[normalized] || [unit, unit, unit];
  return `${count} ${pluralizeRu(count, forms)}`;
};

const getStockBreakdown = (product: any) => {
  const totalUnits = Number(product?.stock || 0);
  const preferredPackaging = getPreferredPackaging(product);
  const unitsPerPackage = Number(preferredPackaging?.unitsPerPackage || 0);
  const packageName = preferredPackaging?.packageName || preferredPackaging?.name || '';
  const displayBaseUnit = normalizeDisplayBaseUnit(product?.unit || 'шт');

  if (!preferredPackaging || unitsPerPackage <= 1 || totalUnits <= 0) {
    return {
      primary: formatCountWithUnit(totalUnits, displayBaseUnit),
      secondary: null,
    };
  }

  const packageCount = Math.floor(totalUnits / unitsPerPackage);
  const remainderUnits = totalUnits % unitsPerPackage;
  const piecesLabel = displayBaseUnit;
  const normalizedPackageName = normalizePackageName(packageName || 'упаковка');

  return {
    primary:
      remainderUnits > 0
        ? `${formatCountWithUnit(packageCount, normalizedPackageName)}\n${formatCountWithUnit(remainderUnits, piecesLabel)}`
        : formatCountWithUnit(packageCount, normalizedPackageName),
    secondary: `${formatCountWithUnit(totalUnits, piecesLabel)} всего`,
  };
};

const getStockSortMetrics = (product: any) => {
  const totalUnits = Number(product?.stock || 0);
  const preferredPackaging = getPreferredPackaging(product);
  const unitsPerPackage = Number(preferredPackaging?.unitsPerPackage || 0);

  if (!preferredPackaging || unitsPerPackage <= 1) {
    return {
      packageCount: totalUnits,
      remainderUnits: 0,
      totalUnits,
    };
  }

  return {
    packageCount: Math.floor(totalUnits / unitsPerPackage),
    remainderUnits: totalUnits % unitsPerPackage,
    totalUnits,
  };
};

const getProductEfficiencyMetrics = (product: any) => {
  const costPrice = Number(product?.costPrice || 0);
  const sellingPrice = Number(product?.sellingPrice || 0);
  const profitPerUnit = sellingPrice - costPrice;
  const marginPercent = sellingPrice > 0 ? (profitPerUnit / sellingPrice) * 100 : 0;

  let label = 'Слабая';
  let className = 'bg-rose-50 text-rose-700 border-rose-100';

  if (marginPercent >= 25) {
    label = 'Высокая';
    className = 'bg-emerald-50 text-emerald-700 border-emerald-100';
  } else if (marginPercent >= 12) {
    label = 'Нормальная';
    className = 'bg-amber-50 text-amber-700 border-amber-100';
  }

  return {
    profitPerUnit,
    marginPercent,
    label,
    className,
  };
};

const compareValues = (aValue: any, bValue: any, direction: 'asc' | 'desc') => {
  if (aValue < bValue) return direction === 'asc' ? -1 : 1;
  if (aValue > bValue) return direction === 'asc' ? 1 : -1;
  return 0;
};

const compareProductsBySort = (a: any, b: any, sortConfig: { key: string; direction: 'asc' | 'desc' | null }) => {
  if (!sortConfig.direction) return 0;
  const numericSortKeys = new Set(['costPrice', 'sellingPrice', 'stock', 'totalIncoming', 'minStock', 'initialStock']);

  if (sortConfig.key === 'stock') {
    const aStock = getStockSortMetrics(a);
    const bStock = getStockSortMetrics(b);

    return (
      compareValues(aStock.packageCount, bStock.packageCount, sortConfig.direction) ||
      compareValues(aStock.remainderUnits, bStock.remainderUnits, sortConfig.direction) ||
      compareValues(aStock.totalUnits, bStock.totalUnits, sortConfig.direction)
    );
  }

  const aValue = numericSortKeys.has(sortConfig.key) ? Number(a[sortConfig.key] || 0) : a[sortConfig.key];
  const bValue = numericSortKeys.has(sortConfig.key) ? Number(b[sortConfig.key] || 0) : b[sortConfig.key];
  return compareValues(aValue, bValue, sortConfig.direction);
};

export default function ProductsView() {
  const pageSize = 12;
  const writeOffReasonPresets = ['Брак', 'Потеря', 'Внутреннее использование', 'Корректировка'];
  const ProductHistoryModal = React.lazy(() => import('../components/products/ProductHistoryModal'));
  const ProductBatchesModal = React.lazy(() => import('../components/products/ProductBatchesModal'));
  const hasLoadedReferenceDataRef = React.useRef(false);
  const latestProductsRequestRef = React.useRef(0);
  const initialSortAppliedRef = React.useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const user = React.useMemo(() => getCurrentUser(), []);
  const isAdmin = isAdminUser(user);
  const userWarehouseId = getUserWarehouseId(user);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [showWriteOffModal, setShowWriteOffModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showBatchesModal, setShowBatchesModal] = useState(false);
  const [showReturnWriteOffModal, setShowReturnWriteOffModal] = useState(false);
  const [showDeleteWriteOffConfirm, setShowDeleteWriteOffConfirm] = useState(false);
  const [productHistory, setProductHistory] = useState<any[]>([]);
  const [productBatches, setProductBatches] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedHistoryTransaction, setSelectedHistoryTransaction] = useState<any>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [isMergingDuplicates, setIsMergingDuplicates] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(userWarehouseId ? String(userWarehouseId) : '');
  const [forceWarehouseLowStockView, setForceWarehouseLowStockView] = useState(false);
  const [transferData, setTransferData] = useState({
    fromWarehouseId: '',
    toWarehouseId: '',
    quantity: '',
    selectedPackagingId: '',
    packageQuantityInput: '',
  });
  const [restockData, setRestockData] = useState({
    warehouseId: '',
    quantity: '',
    selectedPackagingId: '',
    packageQuantityInput: '',
    costPrice: '',
    sellingPrice: '',
    expensePercent: '0',
    reason: '',
  });
  const [writeOffData, setWriteOffData] = useState({
    productId: '',
    quantity: '1',
    reason: 'брак',
  });
  const [returnWriteOffData, setReturnWriteOffData] = useState({
    quantity: '1',
    reason: 'ошибка ввода',
  });
  const [isCategoryManual, setIsCategoryManual] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' | null }>({ key: 'name', direction: 'asc' });
  const [isPhotoUploading, setIsPhotoUploading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedMobileActionsId, setExpandedMobileActionsId] = useState<number | null>(null);
  const [isReferenceDataReady, setIsReferenceDataReady] = useState(false);
  const [categoryInput, setCategoryInput] = useState('');
  const emptyTransferData = {
    fromWarehouseId: '',
    toWarehouseId: '',
    quantity: '',
    selectedPackagingId: '',
    packageQuantityInput: '',
  };
  const emptyRestockData = {
    warehouseId: '',
    quantity: '',
    selectedPackagingId: '',
    packageQuantityInput: '',
    costPrice: '',
    sellingPrice: '',
    expensePercent: '0',
    reason: '',
  };

  const closeHistoryModal = () => {
    setShowHistoryModal(false);
    setShowWriteOffModal(false);
    setShowReturnWriteOffModal(false);
    setShowDeleteWriteOffConfirm(false);
    setProductHistory([]);
    setSelectedHistoryTransaction(null);
    setSelectedProduct(null);
  };

  const closeBatchesModal = () => {
    setShowBatchesModal(false);
    setProductBatches([]);
    setSelectedProduct(null);
  };

  const closeDeleteConfirm = () => {
    setShowDeleteConfirm(false);
    setSelectedProduct(null);
  };

  const closeProductFormModal = () => {
    setShowAddModal(false);
    setShowEditModal(false);
    resetForm();
  };

  const closeTransferModal = () => {
    setShowTransferModal(false);
    setTransferData(emptyTransferData);
    setSelectedProduct(null);
  };

  const closeRestockModal = () => {
    setShowRestockModal(false);
    setRestockData(emptyRestockData);
    setSelectedProduct(null);
  };

  const closeWriteOffModal = () => {
    setShowWriteOffModal(false);
    setWriteOffData({
      productId: '',
      quantity: '1',
      reason: 'брак',
    });
  };

  const closeReturnWriteOffModal = () => {
    setShowReturnWriteOffModal(false);
    setSelectedHistoryTransaction(null);
    setReturnWriteOffData({
      quantity: '1',
      reason: 'ошибка ввода',
    });
  };

  const closeDeleteWriteOffConfirm = () => {
    setShowDeleteWriteOffConfirm(false);
    setSelectedHistoryTransaction(null);
  };

  const closeMergeModal = () => {
    setShowMergeModal(false);
    setMergeTargetId('');
    setSelectedProduct(null);
  };

  const availableTransferStock = selectedProduct && transferData.fromWarehouseId
    ? String(selectedProduct.warehouseId || '') === transferData.fromWarehouseId || selectedWarehouseId === transferData.fromWarehouseId
      ? Number(selectedProduct.stock || 0)
      : null
    : selectedProduct
      ? Number(selectedProduct.stock || 0)
      : null;
  const transferPackagings = normalizePackagings(selectedProduct);
  const selectedTransferPackaging =
    transferPackagings.find((entry) => String(entry.id) === String(transferData.selectedPackagingId || '')) ||
    getDefaultPackaging(transferPackagings);
  const transferPackageQuantity = Math.max(0, Math.floor(Number(transferData.packageQuantityInput || 0) || 0));
  const transferUnitsPerPackage = Number(selectedTransferPackaging?.unitsPerPackage || 0);
  const transferAvailableFullPackages =
    selectedTransferPackaging && transferUnitsPerPackage > 0 && Number.isFinite(Number(availableTransferStock))
      ? Math.floor(Number(availableTransferStock || 0) / transferUnitsPerPackage)
      : 0;
  const transferRemainderUnits =
    selectedTransferPackaging && transferUnitsPerPackage > 0 && Number.isFinite(Number(availableTransferStock))
      ? Number(availableTransferStock || 0) % transferUnitsPerPackage
      : 0;
  const totalTransferUnits =
    selectedTransferPackaging && transferUnitsPerPackage > 0
      ? transferPackageQuantity * transferUnitsPerPackage
      : Number(transferData.quantity || 0);

  const [formData, setFormData] = useState<ProductFormData>(createEmptyProductForm());
  const numericSortKeys = new Set(['costPrice', 'sellingPrice', 'stock', 'totalIncoming', 'minStock', 'initialStock']);
  const effectiveFormCostPrice = (() => {
    return calculateEffectiveCost(formData.costPrice, formData.expensePercent);
  })();
  const restockPackagings = normalizePackagings(selectedProduct);
  const selectedRestockPackaging =
    restockPackagings.find((entry) => String(entry.id) === String(restockData.selectedPackagingId || '')) || null;
  const restockPackageQuantity = Math.max(0, Math.floor(Number(restockData.packageQuantityInput || 0) || 0));
  const totalRestockUnits =
    selectedRestockPackaging && selectedRestockPackaging.unitsPerPackage > 0
      ? restockPackageQuantity * selectedRestockPackaging.unitsPerPackage
      : Number(restockData.quantity || 0);

  useEffect(() => {
    if (!isReferenceDataReady) {
      return;
    }

    fetchInitialData();
  }, [isReferenceDataReady, selectedWarehouseId]);

  useEffect(() => {
    if (!showAddModal || showEditModal || isCategoryManual) {
      return;
    }

    const suggestedCategoryName = detectCategoryName(formData.name);
    const suggestedCategory = categories.find(
      (category) =>
        String(category.name || '').trim().toLowerCase() === suggestedCategoryName.trim().toLowerCase() &&
        String(category.name || '').trim().toLowerCase() !== 'прочее'
    );

    setFormData((prev) => {
      const nextCategoryId = suggestedCategory?.id ? String(suggestedCategory.id) : '';
      if (prev.categoryId === nextCategoryId) {
        return prev;
      }

      return {
        ...prev,
        categoryId: nextCategoryId,
      };
    });
    setCategoryInput(suggestedCategory?.name || '');
  }, [categories, formData.name, isCategoryManual, showAddModal, showEditModal]);

  useEffect(() => {
    if ((!showAddModal && !showEditModal) || categoryInput.trim()) {
      return;
    }

    const selectedCategory = categories.find((category) => String(category?.id) === String(formData.categoryId || ''));
    if (selectedCategory?.name) {
      setCategoryInput(String(selectedCategory.name));
    }
  }, [categories, categoryInput, formData.categoryId, showAddModal, showEditModal]);

  useEffect(() => {
    const hasOpenModal =
      showAddModal ||
      showEditModal ||
      showTransferModal ||
      showRestockModal ||
      showWriteOffModal ||
      showReturnWriteOffModal ||
      showMergeModal ||
      showDeleteConfirm ||
      showDeleteWriteOffConfirm ||
      showHistoryModal ||
      showBatchesModal;

    if (!hasOpenModal) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (showWriteOffModal) return closeWriteOffModal();
      if (showReturnWriteOffModal) return closeReturnWriteOffModal();
      if (showDeleteConfirm) return closeDeleteConfirm();
      if (showDeleteWriteOffConfirm) return closeDeleteWriteOffConfirm();
      if (showHistoryModal) return closeHistoryModal();
      if (showBatchesModal) return closeBatchesModal();
      if (showMergeModal) return closeMergeModal();
      if (showTransferModal) return closeTransferModal();
      if (showRestockModal) return closeRestockModal();
      if (showAddModal || showEditModal) return closeProductFormModal();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    showAddModal,
    showBatchesModal,
    showDeleteConfirm,
    showDeleteWriteOffConfirm,
    showEditModal,
    showHistoryModal,
    showMergeModal,
    showReturnWriteOffModal,
    showRestockModal,
    showWriteOffModal,
    showTransferModal,
  ]);

  const refreshSelectedProduct = async (productId: number) => {
    try {
      const resp = await client.get(`/products/${productId}`);
      if (resp.data) {
        setSelectedProduct(resp.data);
      }
    } catch (err) {
      console.error('Failed to refresh selected product:', err);
    }
  };

  const fetchInitialData = async (warehouseIdOverride?: string) => {
    const requestId = latestProductsRequestRef.current + 1;
    latestProductsRequestRef.current = requestId;
    setIsLoading(true);
    try {
      const effectiveWarehouseId = warehouseIdOverride !== undefined ? warehouseIdOverride : selectedWarehouseId;
      const productsData = await getProducts(effectiveWarehouseId ? Number(effectiveWarehouseId) : undefined);
      if (latestProductsRequestRef.current !== requestId) {
        return;
      }
      setProducts(Array.isArray(productsData) ? productsData : []);
    } catch (err) {
      if (latestProductsRequestRef.current !== requestId) {
        return;
      }
      console.error(err);
      toast.error('Ошибка при загрузке данных');
    } finally {
      if (latestProductsRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    try {
      const targetWarehouseId = Number(transferData.toWarehouseId);
      const response = await client.post(`/products/${selectedProduct.id}/transfer`, {
        fromWarehouseId: Number(transferData.fromWarehouseId),
        toWarehouseId: targetWarehouseId,
        quantity: totalTransferUnits
      });

      closeTransferModal();

      if (targetWarehouseId) {
        setSelectedWarehouseId(String(targetWarehouseId));
      }

      await fetchInitialData(targetWarehouseId ? String(targetWarehouseId) : undefined);

      const destinationProductName = response?.data?.destinationProduct?.name;
      toast.success(
        destinationProductName
          ? `Товар перенесён: ${formatProductName(destinationProductName)}`
          : 'Товар успешно перенесён!'
      );
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Ошибка при переносе товара');
    }
  };

  useEffect(() => {
    if (hasLoadedReferenceDataRef.current) {
      return;
    }

    hasLoadedReferenceDataRef.current = true;

    Promise.all([
      getWarehouses(),
      getSettingsCategories(),
    ])
      .then(([warehousesData, categoriesData]) => {
        const filteredWarehouses = filterWarehousesForUser(Array.isArray(warehousesData) ? warehousesData : [], user);
        setWarehouses(filteredWarehouses);
        const defaultWarehouseId = getDefaultWarehouseId(filteredWarehouses);
        if (isAdmin && defaultWarehouseId) {
          setSelectedWarehouseId((currentValue) => currentValue || String(defaultWarehouseId));
        } else if (!isAdmin && filteredWarehouses[0]) {
          setSelectedWarehouseId(String(filteredWarehouses[0].id));
        }
        setCategories(Array.isArray(categoriesData) ? categoriesData : []);
        setIsReferenceDataReady(true);
      })
      .catch((error) => {
        hasLoadedReferenceDataRef.current = false;
        setIsReferenceDataReady(true);
        console.error(error);
        toast.error('Ошибка при загрузке данных');
      });
  }, [isAdmin, user]);

  const handleRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    try {
      await restockProduct(selectedProduct.id, {
        warehouseId: Number(restockData.warehouseId),
        quantity: selectedRestockPackaging ? totalRestockUnits : Number(restockData.quantity),
        costPrice: roundMoney(restockData.costPrice),
        purchaseCostPrice: roundMoney(restockData.costPrice),
        sellingPrice: roundMoney(restockData.sellingPrice || 0),
        expensePercent: Number(restockData.expensePercent || 0),
        reason: restockData.reason
      });
      closeRestockModal();
      await Promise.all([fetchInitialData(), refreshSelectedProduct(selectedProduct.id)]);
      toast.success('Товар успешно пополнен!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Ошибка при пополнении товара');
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Для фото поддерживаются JPG, PNG и WEBP');
      e.target.value = '';
      return;
    }

    try {
      setIsPhotoUploading(true);
      const uploadFormData = new FormData();
      uploadFormData.append('photo', file);
      const res = await client.post('/ocr/upload', uploadFormData);

      if (res.data?.photoUrl) {
        setFormData((prev) => ({ ...prev, photoUrl: res.data.photoUrl }));
        toast.success('Фото успешно загружено');
      } else {
        toast.error('Не удалось получить ссылку на фото');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Ошибка при загрузке фото');
    } finally {
      setIsPhotoUploading(false);
      e.target.value = '';
    }
  };

  const handleShowHistory = async (product: any) => {
    setShowBatchesModal(false);
    setSelectedProduct(product);
    try {
      const history = await getProductHistory(product.id);
      setProductHistory(history);
      setShowHistoryModal(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Ошибка при загрузке истории');
    }
  };

  const handleShowBatches = async (product: any) => {
    setShowHistoryModal(false);
    setSelectedProduct(product);
    try {
      const batches = await getProductBatches(product.id);
      setProductBatches(batches);
      setShowBatchesModal(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Ошибка при загрузке партий');
    }
  };

  const refreshSelectedProductBatches = async () => {
    if (!selectedProduct?.id) {
      return;
    }

    const batches = await getProductBatches(selectedProduct.id);
    setProductBatches(batches);
  };

  const handleDeleteBatch = async (batchId: number) => {
    const confirmed = window.confirm('Удалить эту партию? Это действие нельзя отменить.');
    if (!confirmed) {
      return;
    }

    setProductBatches((prev) => prev.filter((batch) => batch.id !== batchId));

    try {
      await deleteProductBatch(batchId);
      await Promise.allSettled([refreshSelectedProductBatches(), fetchInitialData(), refreshSelectedProduct(selectedProduct.id)]);
      toast.success('Партия удалена');
    } catch (err: any) {
      await Promise.allSettled([refreshSelectedProductBatches(), fetchInitialData(), refreshSelectedProduct(selectedProduct.id)]);
      toast.error(err.response?.data?.error || 'Ошибка при удалении партии');
    }
  };

  const visibleCategories = React.useMemo(
    () => categories.filter((category) => String(category?.name || '').trim().toLowerCase() !== 'прочее'),
    [categories],
  );

  const resolveCategoryIdForSubmit = async () => {
    const typedCategoryName = String(categoryInput || '').trim();
    const existingCategory = visibleCategories.find(
      (category) => String(category?.name || '').trim().toLowerCase() === typedCategoryName.toLowerCase()
    );

    if (existingCategory?.id) {
      return Number(existingCategory.id);
    }

    if (formData.categoryId) {
      return Number(formData.categoryId);
    }

    if (!typedCategoryName) {
      throw new Error('Укажите категорию');
    }

    const createdCategory = await createSettingsCategory(typedCategoryName);
    const nextCategories = [...categories, createdCategory];
    setCategories(nextCategories);
    setCategoryInput(String(createdCategory?.name || typedCategoryName));
    setFormData((prev) => ({ ...prev, categoryId: String(createdCategory?.id || '') }));
    return Number(createdCategory.id);
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const categoryId = await resolveCategoryIdForSubmit();
      await createProduct(buildProductSubmitPayload(formData, categoryId));
      toast.success('Товар успешно добавлен!');
      setShowAddModal(false);
      resetForm();
      fetchInitialData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Ошибка при добавлении товара');
    }
  };

  const handleEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    try {
      const categoryId = await resolveCategoryIdForSubmit();
      await updateProduct(selectedProduct.id, buildProductSubmitPayload(formData, categoryId));
      toast.success('Товар успешно обновлён!');
      setShowEditModal(false);
      resetForm();
      await Promise.all([fetchInitialData(), refreshSelectedProduct(selectedProduct.id)]);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Ошибка при обновлении товара');
    }
  };

  const handleDeleteProduct = async (productId: number) => {
    try {
      await deleteProduct(productId, { force: true });
      toast.success('Товар успешно удалён!');
      await fetchInitialData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Ошибка при удалении товара');
      throw err;
    }
  };

  const handleConfirmDeleteProduct = () => {
    if (!selectedProduct?.id) {
      return Promise.resolve();
    }

    const productId = selectedProduct.id;
    closeDeleteConfirm();

    return new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        void handleDeleteProduct(productId).then(resolve).catch(reject);
      }, 0);
    });
  };

  const handleReverseIncoming = async (transactionId: number) => {
    if (!selectedProduct || !transactionId) return;

    const confirmed = window.confirm('Отменить этот приход? Количество будет снято со склада, а в истории появится корректирующая запись.');
    if (!confirmed) {
      return;
    }

    try {
      await reverseIncomingTransaction(transactionId);
      const history = await getProductHistory(selectedProduct.id);
      setProductHistory(history);
      await Promise.all([fetchInitialData(), refreshSelectedProduct(selectedProduct.id)]);
      toast.success('Приход успешно отменён');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Не удалось отменить приход');
    }
  };

  const handleReverseCorrectionWriteOff = async (transactionId: number) => {
    if (!selectedProduct || !transactionId) return;

    const confirmed = window.confirm(
      'Отменить корректировочное списание? Система вернёт товар на склад и восстановит приход по этой корректировке.'
    );
    if (!confirmed) {
      return;
    }

    try {
      await reverseCorrectionWriteOffTransaction(transactionId);
      const history = await getProductHistory(selectedProduct.id);
      setProductHistory(history);
      await Promise.all([fetchInitialData(), refreshSelectedProduct(selectedProduct.id)]);
      toast.success('Корректировочное списание успешно отменено');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Не удалось отменить корректировку');
    }
  };

  const handleOpenReturnWriteOffModal = (transaction: any) => {
    const originalQuantity = Math.abs(Number(transaction?.qtyChange || 0));
    if (!transaction?.transactionId || originalQuantity <= 0) {
      toast.error('Некорректное списание для возврата');
      return;
    }

    setSelectedHistoryTransaction(transaction);
    setReturnWriteOffData({
      quantity: String(originalQuantity),
      reason: 'ошибка ввода',
    });
    setShowReturnWriteOffModal(true);
  };

  const handleSubmitReturnWriteOff = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedProduct?.id || !selectedHistoryTransaction?.transactionId) {
      return;
    }

    const quantity = Number(String(returnWriteOffData.quantity || '').trim());
    const reason = String(returnWriteOffData.reason || '').trim();

    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error('Введите целое количество для возврата');
      return;
    }

    try {
      await returnWriteOffTransaction(Number(selectedHistoryTransaction.transactionId), { quantity, reason });
      const history = await getProductHistory(selectedProduct.id);
      setProductHistory(history);
      await Promise.all([fetchInitialData(), refreshSelectedProduct(selectedProduct.id)]);
      closeReturnWriteOffModal();
      toast.success('Списание возвращено на склад');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Не удалось вернуть списание');
    }
  };

  const handleOpenDeleteWriteOffConfirm = (transaction: any) => {
    if (!transaction?.transactionId) {
      toast.error('Некорректное списание для удаления');
      return;
    }

    setSelectedHistoryTransaction(transaction);
    setShowDeleteWriteOffConfirm(true);
  };

  const handleDeleteWriteOffPermanently = async () => {
    if (!selectedProduct?.id || !selectedHistoryTransaction?.transactionId) {
      return;
    }

    try {
      await deleteWriteOffTransactionPermanently(Number(selectedHistoryTransaction.transactionId));
      const history = await getProductHistory(selectedProduct.id);
      setProductHistory(history);
      await Promise.all([fetchInitialData(), refreshSelectedProduct(selectedProduct.id)]);
      closeDeleteWriteOffConfirm();
      toast.success('Списание удалено без возможности восстановления');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Не удалось удалить списание');
    }
  };

  const handleOpenWriteOffModal = (productArg?: any) => {
    if (!selectedWarehouseId) {
      toast.error('Сначала выберите склад');
      return;
    }

    const baseProduct = productArg || selectedProduct;
    if (!baseProduct?.id) {
      toast.error('Выберите товар из списка и нажмите списание');
      return;
    }

    const availableStock = Number(baseProduct.stock || 0);
    if (availableStock <= 0) {
      toast.error('У этого товара нет остатка для списания');
      return;
    }

    setSelectedProduct(baseProduct);
    setWriteOffData({
      productId: String(baseProduct.id),
      quantity: String(Math.min(1, availableStock) || 1),
      reason: 'брак',
    });
    setShowWriteOffModal(true);
  };

  const handleSubmitWriteOff = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProduct?.id) {
      return;
    }

    const quantity = Number(String(writeOffData.quantity || '').trim());
    const reason = String(writeOffData.reason || '').trim();
    const availableStock = Number(selectedProduct.stock || 0);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error('Введите целое количество для списания');
      return;
    }

    if (quantity > availableStock) {
      toast.error(`Нельзя списать больше остатка. Сейчас доступно: ${availableStock}`);
      return;
    }

    if (!reason) {
      toast.error('Нужно указать причину списания');
      return;
    }

    try {
      await writeOffProduct(selectedProduct.id, { quantity, reason });
      const history = await getProductHistory(selectedProduct.id);
      setProductHistory(history);
      await Promise.all([fetchInitialData(), refreshSelectedProduct(selectedProduct.id)]);
      closeWriteOffModal();
      toast.success('Списание успешно проведено');
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Не удалось выполнить списание');
    }
  };

  const handleSetWriteOffQuantity = (value: number) => {
    if (!selectedProduct) {
      return;
    }

    const availableStock = Number(selectedProduct.stock || 0);
    const nextValue = Math.max(0, Math.min(value, availableStock));
    setWriteOffData((prev) => ({ ...prev, quantity: String(nextValue) }));
  };

  const getMergeCandidates = (product: any) => {
    const sourceFamily = normalizeProductFamilyName(String(product?.name || ''));
    const sourceWarehouseId = Number(product?.warehouseId || selectedWarehouseId || 0);
    const sourceCategoryId = Number(product?.categoryId || 0);
    const sourceMassKey = extractMassKey(String(product?.name || ''));

    return products.filter((candidate) => {
      if (!candidate || candidate.id === product?.id) {
        return false;
      }

      const candidateWarehouseId = Number(candidate.warehouseId || 0);
      if (sourceWarehouseId && candidateWarehouseId && candidateWarehouseId !== sourceWarehouseId) {
        return false;
      }

      const candidateFamily = normalizeProductFamilyName(String(candidate.name || ''));
      const candidateMassKey = extractMassKey(String(candidate.name || ''));
      const candidateCategoryId = Number(candidate.categoryId || 0);

      return candidateFamily === sourceFamily || (sourceCategoryId > 0 && candidateCategoryId === sourceCategoryId && sourceMassKey && candidateMassKey === sourceMassKey);
    });
  };

  const getDuplicateHintCount = (product: any) => {
    const sourceWarehouseId = Number(product?.warehouseId || selectedWarehouseId || 0);
    const sourceCategoryId = Number(product?.categoryId || 0);
    const sourceMassKey = extractMassKey(String(product?.name || ''));

    if (!sourceCategoryId || !sourceMassKey) {
      return 0;
    }

    return products.filter((candidate) => {
      if (!candidate || candidate.id === product?.id) {
        return false;
      }

      const candidateWarehouseId = Number(candidate.warehouseId || 0);
      const candidateCategoryId = Number(candidate.categoryId || 0);
      const candidateMassKey = extractMassKey(String(candidate.name || ''));

      if (sourceWarehouseId && candidateWarehouseId && candidateWarehouseId !== sourceWarehouseId) {
        return false;
      }

      return candidateCategoryId === sourceCategoryId && candidateMassKey === sourceMassKey;
    }).length;
  };

  const handleOpenMergeModal = (product: any) => {
    const candidates = getMergeCandidates(product);
    if (!candidates.length) {
      toast.error('Похожих товаров для объединения не найдено');
      return;
    }

    setSelectedProduct(product);
    setMergeTargetId(String(candidates[0].id));
    setShowMergeModal(true);
  };

  const handleMergeProduct = async () => {
    if (!selectedProduct || !mergeTargetId) {
      return;
    }

    try {
      await mergeProduct(selectedProduct.id, Number(mergeTargetId));
      toast.success('Товары объединены');
      setShowMergeModal(false);
      setMergeTargetId('');
      setSelectedProduct(null);
      fetchInitialData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Ошибка при объединении товаров');
    }
  };

  const getRobustDuplicateKey = (product: any) => {
    const warehouseId =
      selectedWarehouseId || forceWarehouseLowStockView
        ? Number(product?.warehouseId || selectedWarehouseId || 0)
        : 0;
    const fallbackName = normalizeCatalogName(String(product?.name || ''));
    return `${warehouseId}::${fallbackName}`;
  };

  const resetForm = () => {
    setFormData(createEmptyProductForm());
    setCategoryInput('');
    setIsCategoryManual(false);
    setSelectedProduct(null);
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = null;
    }
    setSortConfig({ key, direction });
  };

  const sortedProducts = [...products].sort((a, b) => {
    return compareProductsBySort(a, b, sortConfig);
  });

  const aggregatedProducts: any[] = Object.values(
    products.reduce((acc, product) => {
      const key = normalizeCatalogName(product.name);
      if (!acc[key]) {
        acc[key] = {
          ...product,
          name: String(product.name || '').replace(/\s*\[[^\]]*\]\s*$/u, '').trim(),
          stock: Number(product.stock || 0),
          totalIncoming: Number(product.totalIncoming || 0),
          packagings: Array.isArray(product.packagings) ? product.packagings : [],
          isAggregateRow: true,
        };
      } else {
        acc[key].stock += Number(product.stock || 0);
        acc[key].totalIncoming += Number(product.totalIncoming || 0);
        if (!acc[key].photoUrl && product.photoUrl) {
          acc[key].photoUrl = product.photoUrl;
        }
        if ((!Array.isArray(acc[key].packagings) || acc[key].packagings.length === 0) && Array.isArray(product.packagings)) {
          acc[key].packagings = product.packagings;
        }
      }
      return acc;
    }, {} as Record<string, any>)
  );

  const sortedAggregatedProducts = [...aggregatedProducts].sort((a, b) => {
    return compareProductsBySort(a, b, sortConfig);
  });

  const baseProducts = selectedWarehouseId || forceWarehouseLowStockView ? sortedProducts : sortedAggregatedProducts;
  const isAggregateMode = !selectedWarehouseId && !forceWarehouseLowStockView;
  const normalizedSearch = normalizeCatalogName(search);

  const filteredProducts = baseProducts.filter(p => {
    const productSearchValue = normalizeCatalogName(String(p.name || ''));
    const matchesSearch = !normalizedSearch || productSearchValue.includes(normalizedSearch);
    const matchesWarehouse = !selectedWarehouseId || p.stock > 0 || p.warehouseId === Number(selectedWarehouseId);
    return matchesSearch && matchesWarehouse;
  });

  const groupedProducts = React.useMemo(() => {
    const groups = new Map<string, any[]>();
    filteredProducts.forEach((product) => {
      const key = getRobustDuplicateKey(product);
      const current = groups.get(key) || [];
      current.push(product);
      groups.set(key, current);
    });
    return Array.from(groups.values())
      .map((group) =>
        [...group].sort(
          (a, b) =>
            compareProductsBySort(a, b, { key: 'stock', direction: 'desc' }) ||
            Number(b.totalIncoming || 0) - Number(a.totalIncoming || 0) ||
            Number(a.id || 0) - Number(b.id || 0),
        ),
      );
  }, [filteredProducts, selectedWarehouseId]);

  const displayProducts = React.useMemo(
    () =>
      groupedProducts.map((group) => {
        const [primary, ...rest] = group;
        if (!rest.length) return primary;
        return {
          ...primary,
          stock: group.reduce((sum, product) => sum + Number(product?.stock || 0), 0),
          totalIncoming: group.reduce((sum, product) => sum + Number(product?.totalIncoming || 0), 0),
          duplicateCount: group.length - 1,
          mergedProductIds: group.map((product) => Number(product.id)).filter((id) => Number.isFinite(id)),
        };
      }),
    [groupedProducts],
  );

  const totalPages = Math.max(1, Math.ceil(displayProducts.length / pageSize));
  const paginatedProducts = React.useMemo(
    () => displayProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, displayProducts],
  );

  useEffect(() => {
    setCurrentPage(1);
    setExpandedMobileActionsId(null);
  }, [forceWarehouseLowStockView, search, selectedWarehouseId, sortConfig.key, sortConfig.direction]);

  useEffect(() => {
    const sortMode = String(searchParams.get('sort') || '').trim().toLowerCase();
    const requestedView = String(searchParams.get('view') || '').trim().toLowerCase();
    const shouldForceWarehouseLowStockView = requestedView === 'warehouse-low-stock';

    if (forceWarehouseLowStockView !== shouldForceWarehouseLowStockView) {
      setForceWarehouseLowStockView(shouldForceWarehouseLowStockView);
    }
    if (sortMode === 'low-stock' && !initialSortAppliedRef.current) {
      initialSortAppliedRef.current = true;
      setSortConfig({ key: 'stock', direction: 'asc' });
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('sort');
    nextParams.delete('view');
    setSearchParams(nextParams, { replace: true });
  }, [forceWarehouseLowStockView, searchParams, setSearchParams]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  return (
    <div className="flex flex-col gap-6">
      {/* 1C Style Toolbar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-[#dcdcdc] pb-6">
        <div>
          <div className="flex items-center gap-2 text-[#ff9900] mb-2">
            <Package size={18} />
            <span className="text-[11px] font-black uppercase tracking-[0.2em]">Номенклатура и склад</span>
          </div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Список товаров <span className="font-light text-slate-400">| Реестр</span></h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button onClick={() => { resetForm(); setShowAddModal(true); }} className="btn-1c-plus btn-1c-plus-primary">
              <Plus size={16} /> Создать (Ins)
            </button>
          )}
          <button 
            onClick={() => selectedProduct && setShowEditModal(true)} 
            disabled={!selectedProduct} 
            className="btn-1c-plus disabled:opacity-50"
          >
            <Edit size={16} /> Изменить (F2)
          </button>
          <button 
            onClick={() => selectedProduct && setShowDeleteConfirm(true)} 
            disabled={!selectedProduct} 
            className="btn-1c-plus text-red-600 border-red-100 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 size={16} /> Удалить (Del)
          </button>
          <div className="h-6 w-[1px] bg-slate-200 mx-1"></div>
          <button onClick={() => selectedProduct && setShowRestockModal(true)} disabled={!selectedProduct} className="btn-1c-plus">
            <PlusCircle size={16} /> Поступление
          </button>
        </div>
      </div>

      <div className="bg-white border border-[#dcdcdc] rounded-[4px] shadow-sm overflow-hidden">
        {/* Filters and Search Bar */}
        <div className="bg-[#f9fafb] border-b border-[#dcdcdc] p-4 flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по наименованию, артикулу..."
              className="w-full pl-10 pr-4 py-2 border border-[#dcdcdc] rounded-md text-sm outline-none focus:border-[#ff9900] focus:ring-1 focus:ring-[#ff9900]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Store size={16} className="text-slate-400" />
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="text-sm font-bold text-slate-700 bg-white border border-[#dcdcdc] rounded-md px-3 py-2 outline-none focus:border-[#ff9900]"
            >
              {isAdmin && <option value="">Все склады</option>}
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#f2f3f5] text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-4 border-b border-[#dcdcdc]">Наименование</th>
                <th className="px-5 py-4 border-b border-[#dcdcdc]">Артикул</th>
                <th className="px-5 py-4 border-b border-[#dcdcdc]">Остаток</th>
                {isAdmin && <th className="px-5 py-4 border-b border-[#dcdcdc]">Цена закупа</th>}
                <th className="px-5 py-4 border-b border-[#dcdcdc]">Цена продажи</th>
                <th className="px-5 py-4 border-b border-[#dcdcdc] text-right">Эффективность</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0f0]">
              {isLoading ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-6 py-24 text-center">
                    <Loader2 size={32} className="animate-spin text-[#ff9900] mx-auto" />
                    <p className="mt-4 text-sm text-slate-400 font-bold uppercase tracking-widest">ЗАГРУЗКА ДАННЫХ...</p>
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((product) => {
                  const efficiency = getProductEfficiencyMetrics(product);
                  const isLow = product.stock <= product.minStock;
                  return (
                    <tr 
                      key={product.id} 
                      onClick={() => setSelectedProduct(product)}
                      className={clsx(
                        "hover:bg-[#fff9e6] cursor-pointer transition-colors group",
                        selectedProduct?.id === product.id ? "bg-[#fff2cc]" : ""
                      )}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={clsx(
                            "h-9 w-9 rounded flex items-center justify-center border transition-colors",
                            selectedProduct?.id === product.id ? "bg-white border-[#ffcc33]" : "bg-slate-50 border-[#f0f0f0]"
                          )}>
                             <Package size={18} className={selectedProduct?.id === product.id ? "text-[#ff9900]" : "text-slate-300"} />
                          </div>
                          <div>
                            <p className="text-[14px] font-bold text-slate-800 leading-tight mb-0.5">{formatProductName(product.name)}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{product.category?.name || 'Без категории'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-400 font-mono">#{product.id}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col">
                          <span className={clsx(
                            "text-[14px] font-black",
                            isLow ? "text-red-500" : "text-slate-700"
                          )}>
                             {getStockBreakdown(product).primary}
                          </span>
                          {isLow && product.stock > 0 && (
                            <span className="text-[9px] font-black text-red-400 uppercase tracking-tighter">Крит. остаток</span>
                          )}
                          {product.stock <= 0 && (
                             <span className="text-[9px] font-black text-rose-600 uppercase tracking-tighter">Нет в наличии</span>
                          )}
                        </div>
                      </td>
                      {isAdmin && <td className="px-5 py-3.5 text-[13px] font-medium text-slate-500 italic">{formatMoney(product.purchaseCostPrice || product.costPrice)}</td>}
                      <td className="px-5 py-3.5 text-[14px] font-black text-slate-900">{formatMoney(product.sellingPrice)}</td>
                      <td className="px-5 py-3.5 text-right">
                         <span className={clsx("px-2.5 py-1 rounded-[3px] text-[9px] font-black uppercase border shadow-sm", efficiency.className)}>
                            {efficiency.label}
                         </span>
                      </td>
                    </tr>
                  );
                })
              )}
              {!isLoading && paginatedProducts.length === 0 && (
                 <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="px-6 py-32 text-center">
                       <Package size={48} className="mx-auto text-slate-200 mb-4" />
                       <p className="text-sm font-bold text-slate-400 uppercase">Товары не найдены</p>
                    </td>
                 </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div className="bg-[#fcfcfc] border-t border-[#dcdcdc] px-5 py-4 flex items-center justify-between">
           <div className="flex items-center gap-4">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                 Всего позиций: {displayProducts.length}
              </p>
           </div>
           <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={displayProducts.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
           />
        </div>
      </div>

      <AnimatePresence>
         {(showAddModal || showEditModal) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeProductFormModal} className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
               <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} onClick={e => e.stopPropagation()} className="bg-white rounded-[4px] border border-[#dcdcdc] shadow-2xl w-full max-w-[800px] overflow-hidden">
                  <div className="bg-[#ffcc33] px-6 py-4 flex items-center justify-between border-b border-black/10">
                     <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                        {showEditModal ? 'РЕДАКТИРОВАНИЕ НОМЕНКЛАТУРЫ' : 'СОЗДАНИЕ НОМЕНКЛАТУРЫ'}
                     </h3>
                     <button onClick={closeProductFormModal} className="text-slate-900/50 hover:text-slate-900 transition-colors"><X size={20} /></button>
                  </div>
                  <form onSubmit={showEditModal ? (e) => { e.preventDefault(); handleEditProduct(e); } : (e) => { e.preventDefault(); handleAddProduct(e); }} className="p-6 space-y-6 max-h-[85vh] overflow-y-auto">
                     <div className="grid grid-cols-2 gap-6">
                        <div className="col-span-2">
                           <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Наименование</label>
                           <input type="text" required value={formData.name} onChange={e => { setIsCategoryManual(false); setFormData({ ...formData, name: e.target.value }); }} className="w-full bg-slate-50 border border-[#dcdcdc] rounded-[3px] px-4 py-2.5 text-sm font-bold outline-none focus:border-[#ff9900]" />
                        </div>
                        <div>
                           <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Категория</label>
                           <input list="product-categories" required value={categoryInput} onChange={e => { setCategoryInput(e.target.value); const matched = visibleCategories.find(c => c.name === e.target.value); setIsCategoryManual(true); setFormData({ ...formData, categoryId: matched ? String(matched.id) : '' }); }} className="w-full bg-slate-50 border border-[#dcdcdc] rounded-[3px] px-4 py-2.5 text-sm font-bold outline-none focus:border-[#ff9900]" />
                           <datalist id="product-categories">
                              {visibleCategories.map(c => <option key={c.id} value={c.name} />)}
                           </datalist>
                        </div>
                        <div>
                           <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Единица измерения</label>
                           <select value={formData.baseUnitName} onChange={e => setFormData({ ...formData, baseUnitName: e.target.value, unit: e.target.value })} className="w-full bg-slate-50 border border-[#dcdcdc] rounded-[3px] px-4 py-2.5 text-sm font-bold outline-none focus:border-[#ff9900]">
                              <option value="шт">Шт</option>
                              <option value="кг">Кг</option>
                              <option value="литр">Литр</option>
                           </select>
                        </div>
                        {isAdmin && (
                           <>
                              <div>
                                 <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Себестоимость</label>
                                 <input type="number" step="0.01" value={formData.costPrice} onChange={e => setFormData({ ...formData, costPrice: e.target.value })} className="w-full bg-slate-50 border border-[#dcdcdc] rounded-[3px] px-4 py-2.5 text-sm font-bold outline-none" />
                              </div>
                              <div>
                                 <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Цена продажи</label>
                                 <input type="number" step="0.01" value={formData.sellingPrice} onChange={e => setFormData({ ...formData, sellingPrice: e.target.value })} className="w-full bg-slate-50 border border-[#dcdcdc] rounded-[3px] px-4 py-2.5 text-sm font-bold outline-none border-b-2 border-b-[#ffcc33]" />
                              </div>
                           </>
                        )}
                     </div>
                     <div className="pt-6 border-t border-[#f0f0f0] flex justify-end gap-3">
                        <button type="button" onClick={closeProductFormModal} className="px-6 py-2 text-xs font-black uppercase text-slate-400 hover:text-slate-600 transition-colors">Отмена</button>
                        <button type="submit" className="bg-[#ffcc33] text-slate-900 px-8 py-2 rounded-[3px] text-xs font-black uppercase shadow-lg shadow-yellow-500/10 hover:bg-[#ffd659] transition-all">
                           {showEditModal ? 'СОХРАНИТЬ ИЗМЕНЕНИЯ' : 'ЗАПИСАТЬ И ЗАКРЫТЬ'}
                        </button>
                     </div>
                  </form>
               </motion.div>
            </motion.div>
         )}

         {showRestockModal && selectedProduct && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeRestockModal} className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
               <motion.div initial={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-white rounded-[4px] border border-[#dcdcdc] shadow-2xl w-full max-w-md overflow-hidden">
                  <div className="bg-[#1e293b] text-white px-6 py-4 flex items-center justify-between">
                     <h3 className="text-xs font-black uppercase tracking-widest">Поступление товара</h3>
                     <button onClick={closeRestockModal} className="text-white/50 hover:text-white"><X size={20} /></button>
                  </div>
                  <form onSubmit={handleRestock} className="p-6 space-y-4">
                     <p className="text-xs font-bold text-slate-500 uppercase tracking-tight">Товар: {selectedProduct.name}</p>
                     <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Количество ({selectedProduct.unit})</label>
                        <input type="number" required value={restockData.quantity} onChange={e => setRestockData({ ...restockData, quantity: e.target.value })} className="w-full bg-slate-50 border border-[#dcdcdc] rounded-[3px] px-4 py-2.5 text-sm font-bold outline-none focus:border-[#ff9900]" />
                     </div>
                     <button type="submit" className="w-full bg-[#ffcc33] text-slate-900 py-3 rounded-[3px] text-xs font-black uppercase hover:bg-[#ffd659] transition-all">Оформить поступление</button>
                  </form>
               </motion.div>
            </motion.div>
         )}
      </AnimatePresence>

      <ConfirmationModal 
        isOpen={showDeleteConfirm} 
        title="УДАЛЕНИЕ НОМЕНКЛАТУРЫ" 
        message={`Вы уверены, что хотите удалить товар "${selectedProduct?.name}"? Это действие необратимо.`} 
        onConfirm={() => handleConfirmDeleteProduct()} 
        onClose={closeDeleteConfirm} 
        confirmText="УДАЛИТЬ НАВСЕГДА" 
        cancelText="ОТМЕНА" 
      />
    </div>
  );
}
