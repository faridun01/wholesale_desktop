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

    if (!selectedWriteOffProduct?.id) {
      return;
    }

    const quantity = Number(String(writeOffData.quantity || '').trim());
    const reason = String(writeOffData.reason || '').trim();
    const availableStock = Number(selectedWriteOffProduct.stock || 0);

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
      await writeOffProduct(selectedWriteOffProduct.id, { quantity, reason });
      const history = await getProductHistory(selectedWriteOffProduct.id);
      if (selectedProduct?.id === selectedWriteOffProduct.id) {
        setProductHistory(history);
      }
      await Promise.all([fetchInitialData(), refreshSelectedProduct(selectedWriteOffProduct.id)]);
      setSelectedProduct((prev: any) => (
        prev && prev.id === selectedWriteOffProduct.id
          ? { ...prev, stock: Math.max(0, Number(prev.stock || 0) - quantity) }
          : prev
      ));
      closeWriteOffModal();
      toast.success('Списание успешно проведено');
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || err.message || 'Не удалось выполнить списание');
    }
  };

  const handleSetWriteOffQuantity = (value: number) => {
    if (!selectedWriteOffProduct) {
      return;
    }

    const availableStock = Number(selectedWriteOffProduct.stock || 0);
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

    // If a warehouse is selected, we only show products that have stock in that warehouse
    // OR are assigned to that warehouse as their default warehouse.
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
        if (!rest.length) {
          return primary;
        }

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

  const duplicateGroups = React.useMemo(
    () => groupedProducts.filter((group) => group.length > 1),
    [groupedProducts],
  );

  const duplicateProductsCount = React.useMemo(
    () => duplicateGroups.reduce((sum, group) => sum + group.length - 1, 0),
    [duplicateGroups],
  );
  const writeOffProducts = React.useMemo(
    () =>
      filteredProducts
        .filter((product) => Number(product?.stock || 0) > 0)
        .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'ru')),
    [filteredProducts],
  );
  const selectedWriteOffProduct = React.useMemo(
    () => writeOffProducts.find((product) => String(product.id) === String(writeOffData.productId || '')) || null,
    [writeOffData.productId, writeOffProducts],
  );
  const selectedWriteOffPackaging = React.useMemo(
    () => getDefaultPackaging(normalizePackagings(selectedWriteOffProduct)),
    [selectedWriteOffProduct],
  );
  const normalizedWriteOffReason = String(writeOffData.reason || '').trim().toLowerCase();
  const isCustomWriteOffReason = Boolean(
    normalizedWriteOffReason &&
    !writeOffReasonPresets.some((reason) => reason.toLowerCase() === normalizedWriteOffReason)
  );
  const visibleCategories = React.useMemo(
    () => categories.filter((category) => String(category?.name || '').trim().toLowerCase() !== 'прочее'),
    [categories],
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

    if (sortMode !== 'low-stock' || initialSortAppliedRef.current) {
      if (!requestedView) {
        return;
      }
    } else {
      initialSortAppliedRef.current = true;
      setSortConfig({ key: 'stock', direction: 'asc' });
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('sort');
    nextParams.delete('view');
    setSearchParams(nextParams, { replace: true });
  }, [forceWarehouseLowStockView, searchParams, setSearchParams]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleMergeExactDuplicates = async () => {
    if (!duplicateGroups.length || isMergingDuplicates) {
      return;
    }

    setIsMergingDuplicates(true);
    try {
      let mergedCount = 0;

      for (const group of duplicateGroups) {
        const [target, ...sources] = group;
        for (const source of sources) {
          await mergeProduct(Number(source.id), Number(target.id));
          mergedCount += 1;
        }
      }

      await fetchInitialData();
      toast.success(`Объединено дублей: ${mergedCount}`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Не удалось объединить дубликаты');
    } finally {
      setIsMergingDuplicates(false);
    }
  };

  const exportStockReport = async () => {
    if (!filteredProducts.length) {
      toast.error('Нет товаров для выгрузки');
      return;
    }

    const warehouseName = warehouses.find((warehouse) => String(warehouse.id) === selectedWarehouseId)?.name || 'Все склады';
    const downloadedAt = new Date();

    const { downloadStockReportPdf } = await import('../utils/print/stockReportPdf');

    await downloadStockReportPdf({
      warehouseName,
      generatedAt: downloadedAt,
      rows: filteredProducts.map((product, index) => {
        const stockBreakdown = getStockBreakdown(product);

        return {
          index: index + 1,
          name: formatProductName(product.name),
          stock: String(stockBreakdown.primary || '')
            .replace(/\n/g, ' + ')
            .replace(/\s+/g, ' ')
            .trim(),
        };
      }),
    });

    toast.success('Остатки товаров скачаны в PDF');
  };

  const exportPriceList = async () => {
    if (!filteredProducts.length) {
      toast.error('Нет товаров для выгрузки');
      return;
    }

    const warehouseName = warehouses.find((warehouse) => String(warehouse.id) === selectedWarehouseId)?.name || 'Все склады';
    const downloadedAt = new Date();

    const { downloadPriceListPdf } = await import('../utils/print/priceListPdf');

    await downloadPriceListPdf({
      warehouseName,
      generatedAt: downloadedAt,
      rows: filteredProducts.map((product, index) => {
        const preferredPackaging = getPreferredPackaging(product);
        const unitsPerPackage = Number(preferredPackaging?.unitsPerPackage || 1);
        const sellingPrice = Number(product.sellingPrice || 0);
        const packagePrice = preferredPackaging?.packageSellingPrice
          ? Number(preferredPackaging.packageSellingPrice)
          : sellingPrice * unitsPerPackage;

        return {
          index: index + 1,
          name: formatProductName(product.name),
          pricePerUnit: formatMoney(sellingPrice),
          unitsPerPackage: unitsPerPackage > 1 ? `${unitsPerPackage} шт` : '—',
          pricePerPackage: unitsPerPackage > 1 ? formatMoney(packagePrice) : '—'
        };
      }),
    });

    toast.success('Прайс-лист скачан в PDF');
  };

  return <div className="app-page-shell">
      <div className="space-y-6">
        <div className="app-surface px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-medium tracking-tight text-slate-900 sm:text-4xl">Товары</h1>
              <p className="mt-1 max-w-xl text-sm font-medium text-slate-500">Управление ассортиментом, ценами и остатками.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
              {isAdmin && <button
                onClick={() => {
                  if (!selectedWarehouseId) {
                    toast.error('Пожалуйста, выберите склад перед добавлением товара');
                    return;
                  }
                  resetForm();
                  setFormData(prev => ({ ...prev, warehouseId: selectedWarehouseId }));
                  setShowAddModal(true);
                }}
                className={clsx(
                  "flex w-full items-center justify-center space-x-2 rounded-2xl px-4 py-3 text-sm font-medium transition-all active:scale-95 sm:w-auto",
                  selectedWarehouseId
                    ? "bg-violet-500 text-white shadow-sm hover:bg-violet-600"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                )}
              >
                <Plus size={18} />
                <span>Добавить</span>
              </button>}
            </div>
          </div>
        </div>



        <AnimatePresence>
          {(showAddModal || showEditModal) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeProductFormModal}
              className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center sm:p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={(e) => e.stopPropagation()}
                className="flex max-h-[92vh] w-full max-w-[720px] flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-2xl"
              >
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-3.5 sm:p-4">
                  <h3 className="text-lg font-black text-slate-900 flex items-center space-x-3">
                    <div className="p-2 bg-violet-500 text-white rounded-xl">
                      <Package size={20} />
                    </div>
                    <span>{showEditModal ? 'Редактировать товар' : 'Новый товар'}</span>
                  </h3>
                  <button onClick={closeProductFormModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <form onSubmit={showEditModal ? handleEditProduct : handleAddProduct} className="flex-1 space-y-3 overflow-y-auto p-3.5 sm:p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-black text-slate-700 mb-1 uppercase tracking-widest">Название товара</label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={e => {
                          setIsCategoryManual(false);
                          setFormData({ ...formData, name: e.target.value });
                        }}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold outline-none transition-all focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                        placeholder="Напр: iPhone 15 Pro Max"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-700">Базовая единица</label>
                      <select
                        required
                        value={formData.baseUnitName}
                        onChange={(e) => {
                          const nextBaseUnit = normalizeBaseUnit(e.target.value);
                          setFormData({
                            ...formData,
                            baseUnitName: nextBaseUnit,
                            unit: nextBaseUnit,
                          });
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold outline-none transition-all focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                      >
                        <option value="шт">Шт</option>
                        <option value="кг">Кг</option>
                        <option value="литр">Литр</option>
                        <option value="бутылка">Бутылка</option>
                        <option value="флакон">Флакон</option>
                      </select>
                      <p className="mt-1 text-[11px] font-medium text-slate-400">
                        Это основная единица учёта товара на складе.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-700">Упаковка</label>
                          <p className="text-xs font-medium text-slate-500">Новые товары по умолчанию создаются в коробках или мешках. Штуки считаются автоматически.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              packagingEnabled: !prev.packagingEnabled,
                              packageName: prev.packageName || 'коробка',
                              unitsPerPackage: prev.packagingEnabled ? '' : prev.unitsPerPackage,
                            }))
                          }
                          className={clsx(
                            'rounded-full border px-3 py-1.5 text-xs font-bold transition-all',
                            formData.packagingEnabled
                              ? 'border-amber-300 bg-amber-100 text-amber-800'
                              : 'border-slate-200 bg-white text-slate-600'
                          )}
                        >
                          {formData.packagingEnabled ? 'Коробки / мешки' : 'Только шт'}
                        </button>
                      </div>

                      {formData.packagingEnabled && (
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-700">Тип упаковки</label>
                            <select
                              value={formData.packageName}
                              onChange={(e) => setFormData({ ...formData, packageName: normalizePackageName(e.target.value) || 'коробка' })}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold outline-none transition-all focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                            >
                              <option value="коробка">Коробка</option>
                              <option value="мешок">Мешок</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-700">
                              Сколько шт в {formData.packageName === 'мешок' ? 'мешке' : 'коробке'}
                            </label>
                            <input
                              type="number"
                              min="2"
                              step="1"
                              required={formData.packagingEnabled}
                              value={formData.unitsPerPackage}
                              onChange={(e) => setFormData({ ...formData, unitsPerPackage: e.target.value })}
                              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold outline-none transition-all focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                              placeholder="Напр: 24"
                            />
                          </div>
                          <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700">
                            1 {formData.packageName || 'коробка'} = {Number(formData.unitsPerPackage || 0) || '...'} {normalizeDisplayBaseUnit(formData.baseUnitName || 'шт')}
                          </div>
                          <div className="sm:col-span-2 text-[11px] font-medium text-slate-500">
                            При пополнении этот товар будет удобно добавляться в {formData.packageName === 'мешок' ? 'мешках' : 'коробках'}, а ниже система сама покажет итог в штуках.
                          </div>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-700 mb-1 uppercase tracking-widest">Категория</label>
                      <input
                        list="product-categories"
                        required
                        value={categoryInput}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          const matchedCategory = visibleCategories.find(
                            (category) => String(category?.name || '').trim().toLowerCase() === nextValue.trim().toLowerCase()
                          );

                          setIsCategoryManual(Boolean(nextValue.trim()));
                          setCategoryInput(nextValue);
                          setFormData({
                            ...formData,
                            categoryId: matchedCategory?.id ? String(matchedCategory.id) : '',
                          });
                        }}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold outline-none transition-all focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                        placeholder="Выберите или введите категорию"
                      />
                      <datalist id="product-categories">
                        {visibleCategories.map((category) => (
                          <option key={category.id} value={category.name} />
                        ))}
                      </datalist>
                      <p className="mt-1 text-[11px] font-medium text-slate-400">
                        Можно выбрать из списка или сразу ввести новую категорию здесь же.
                      </p>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-700 mb-1 uppercase tracking-widest">Склад по умолчанию</label>
                      <select
                        required
                        value={formData.warehouseId}
                        onChange={e => setFormData({ ...formData, warehouseId: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold outline-none transition-all focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                      >
                        <option value="">Выберите склад</option>
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </div>
                    {isAdmin && (
                      <div>
                        <label className="block text-[10px] font-black text-slate-700 mb-1 uppercase tracking-widest">Себестоимость</label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={formData.costPrice}
                          onChange={e => setFormData({ ...formData, costPrice: e.target.value })}
                          onBlur={e => setFormData({ ...formData, costPrice: formatPriceInput(e.target.value) })}
                          className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold outline-none transition-all focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                        />
                        {!showEditModal && (
                          <p className="mt-2 text-xs font-medium text-slate-400">
                            Введите себестоимость вручную.
                          </p>
                        )}
                      </div>
                    )}
                    {isAdmin && (showAddModal || showEditModal) && (
                      <div>
                        <label className="block text-[10px] font-black text-slate-700 mb-1 uppercase tracking-widest">Расходы %</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.expensePercent}
                          onChange={e => setFormData({ ...formData, expensePercent: e.target.value })}
                          className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold outline-none transition-all focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] font-black text-slate-700 mb-1 uppercase tracking-widest">Цена продажи</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={formData.sellingPrice}
                        onChange={e => setFormData({ ...formData, sellingPrice: e.target.value })}
                        onBlur={e => setFormData({ ...formData, sellingPrice: formatPriceInput(e.target.value) })}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold outline-none transition-all focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                      />
                    </div>
                    {!showEditModal && (
                      <>
                        <div>
                          <label className="block text-[10px] font-black text-slate-700 mb-1 uppercase tracking-widest">Начальный остаток</label>
                          <input
                            type="number"
                            required
                            value={formData.initialStock}
                            onChange={e => setFormData({ ...formData, initialStock: e.target.value })}
                            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold outline-none transition-all focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-700 mb-1 uppercase tracking-widest">Мин. остаток</label>
                          <input
                            type="number"
                            required
                            value={formData.minStock}
                            onChange={e => setFormData({ ...formData, minStock: e.target.value })}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 transition-all font-bold text-sm"
                          />
                        </div>
                      </>
                    )}
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-black text-slate-700 mb-1 uppercase tracking-widest">Фото товара</label>
                      <div className="flex flex-col gap-3 rounded-2xl border border-sky-100 bg-sky-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-sky-600">
                          {isPhotoUploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                          <span>{isPhotoUploading ? 'Загрузка...' : 'Выбрать фото'}</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={handlePhotoUpload}
                            disabled={isPhotoUploading}
                          />
                        </label>
                        {formData.photoUrl && (
                          <div className="flex items-center gap-3">
                            <div className="h-14 w-14 overflow-hidden rounded-xl border border-slate-200 bg-white">
                              <img
                                src={resolveMediaUrl(formData.photoUrl, formData.name || 'preview')}
                                alt="Фото товара"
                                className="h-full w-full object-cover"
                                referrerPolicy="no-referrer"
                                onError={(event) => handleBrokenImage(event, formData.name || 'preview')}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => setFormData((prev) => ({ ...prev, photoUrl: '' }))}
                              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 transition-all hover:bg-white"
                            >
                              Убрать фото
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end sm:space-x-2 sm:gap-0">
                    <button type="button" onClick={closeProductFormModal} className="px-6 py-2 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-all text-sm">Отмена</button>
                    <button type="submit" className="px-8 py-2 bg-violet-500 text-white rounded-xl font-bold shadow-xl shadow-violet-500/20 hover:bg-violet-600 transition-all active:scale-95 text-sm">
                      {showEditModal ? 'Сохранить' : 'Создать'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showTransferModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeTransferModal}
              className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center sm:p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2.5rem]"
              >
                <div className="border-b border-slate-100 bg-amber-50/50 p-4 sm:p-5">
                  <h3 className="text-lg font-black text-slate-900 flex items-center space-x-3">
                    <div className="p-2 bg-amber-600 text-white rounded-xl">
                      <ArrowRightLeft size={20} />
                    </div>
                    <span>Перенос товара</span>
                  </h3>
                  <p className="text-slate-500 mt-1 font-bold text-sm">{selectedProduct?.name}</p>
                </div>
                <form onSubmit={handleTransfer} className="space-y-4 p-4 sm:p-5">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-black text-slate-700 mb-1 uppercase tracking-widest">Из склада</label>
                      <select
                        required
                        value={transferData.fromWarehouseId}
                        onChange={e => setTransferData({ ...transferData, fromWarehouseId: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 transition-all font-bold text-sm appearance-none bg-white"
                      >
                        <option value="">Выберите склад</option>
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-700 mb-1 uppercase tracking-widest">В склад</label>
                      <select
                        required
                        value={transferData.toWarehouseId}
                        onChange={e => setTransferData({ ...transferData, toWarehouseId: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 transition-all font-bold text-sm appearance-none bg-white"
                      >
                        <option value="">Выберите склад</option>
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-700 mb-1 uppercase tracking-widest">Количество</label>
                      {selectedTransferPackaging && transferUnitsPerPackage > 0 ? (
                        <div className="space-y-3">
                          {availableTransferStock !== null && (
                            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2.5">
                              <p className="text-xs font-bold text-amber-900">
                                Доступно: {formatCountWithUnit(transferAvailableFullPackages, selectedTransferPackaging.packageName)}
                              </p>
                              {transferRemainderUnits > 0 && (
                                <p className="mt-1 text-xs font-medium text-amber-700">
                                  Остаток: {formatCountWithUnit(transferRemainderUnits, normalizeDisplayBaseUnit(selectedProduct?.unit || 'шт'))}
                                </p>
                              )}
                              <p className="mt-1 text-[11px] font-medium text-amber-700">
                                По умолчанию: {formatCountWithUnit(1, selectedTransferPackaging.packageName)} = {transferUnitsPerPackage} {normalizeDisplayBaseUnit(selectedProduct?.unit || 'шт')}
                              </p>
                            </div>
                          )}
                          {transferAvailableFullPackages > 0 ? (
                            <>
                              <input
                                type="number"
                                required
                                min="1"
                                max={transferAvailableFullPackages || undefined}
                                placeholder={`Введите количество (${selectedTransferPackaging.packageName})`}
                                value={transferData.packageQuantityInput}
                                onChange={e =>
                                  setTransferData((prev) => ({
                                    ...prev,
                                    packageQuantityInput: e.target.value,
                                    quantity: String(
                                      Math.max(0, Math.floor(Number(e.target.value || 0) || 0)) * transferUnitsPerPackage
                                    ),
                                  }))
                                }
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 transition-all font-bold text-sm"
                              />
                              <p className="text-xs font-medium text-slate-500">
                                Перенос: {formatCountWithUnit(transferPackageQuantity, selectedTransferPackaging.packageName)}
                                {transferPackageQuantity > 0 && ` = ${totalTransferUnits} ${normalizeDisplayBaseUnit(selectedProduct?.unit || 'шт')}`}
                              </p>
                            </>
                          ) : (
                            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500">
                              Для оптового переноса нужна хотя бы одна полная {selectedTransferPackaging.packageName}.
                            </p>
                          )}
                        </div>
                      ) : (
                        <>
                          {availableTransferStock !== null && (
                            <p className="mb-2 text-xs font-bold text-slate-500">
                              Доступно: {formatCountWithUnit(Number(availableTransferStock || 0), normalizeDisplayBaseUnit(selectedProduct?.unit || 'шт'))}
                            </p>
                          )}
                          <input
                            type="number"
                            required
                            min="1"
                            placeholder="Введите количество"
                            value={transferData.quantity}
                            onChange={e => setTransferData({ ...transferData, quantity: e.target.value })}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 transition-all font-bold text-sm"
                          />
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end sm:space-x-2 sm:gap-0">
                    <button type="button" onClick={closeTransferModal} className="px-6 py-2 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-all text-sm">Отмена</button>
                    <button
                      type="submit"
                      disabled={
                        (selectedTransferPackaging && transferUnitsPerPackage > 0 && transferAvailableFullPackages <= 0) ||
                        totalTransferUnits <= 0
                      }
                      className="px-8 py-2 bg-amber-600 text-white rounded-xl font-bold shadow-xl shadow-amber-600/20 hover:bg-amber-700 transition-all active:scale-95 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Перенести
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showRestockModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeRestockModal}
              className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center sm:p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={(e) => e.stopPropagation()}
                className="flex max-h-[92vh] w-full max-w-[28rem] flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:max-h-[85vh] sm:rounded-[2rem]"
              >
                <div className="flex-shrink-0 border-b border-slate-100 bg-emerald-50/50 p-4 sm:p-6">
                  <h3 className="flex items-center space-x-3 text-xl font-black text-slate-900">
                    <div className="rounded-2xl bg-emerald-600 p-2.5 text-white">
                      <PlusCircle size={20} />
                    </div>
                    <span>Пополнение товара</span>
                  </h3>
                  <p className="mt-2 text-sm font-bold text-slate-500">{selectedProduct?.name}</p>
                </div>
                <form onSubmit={handleRestock} className="flex min-h-0 flex-col overflow-y-auto p-4 sm:p-6">
                  <div className="flex-1 space-y-5">
                    <div>
                      <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-700">Склад</label>
                      <select
                        required
                        value={restockData.warehouseId}
                        onChange={e => setRestockData({ ...restockData, warehouseId: e.target.value })}
                        className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3.5 font-bold outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                      >
                        <option value="">Выберите склад</option>
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {selectedRestockPackaging ? (
                        <>
                          <div>
                            <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-700">Упаковка</label>
                            <select
                              value={restockData.selectedPackagingId}
                              onChange={e =>
                                setRestockData((prev) => ({
                                  ...prev,
                                  selectedPackagingId: e.target.value,
                                  packageQuantityInput: '',
                                  quantity: '',
                                }))
                              }
                              className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3.5 font-bold outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                            >
                              {restockPackagings.map((packaging) => (
                                <option key={packaging.id} value={packaging.id}>
                                  {packaging.packageName} • {packaging.unitsPerPackage} {normalizeDisplayBaseUnit(selectedProduct?.unit || 'шт')}
                                </option>
                              ))}
                            </select>
                            <p className="mt-2 text-xs font-medium text-slate-400">
                              Пополнение идёт упаковками. Штуки считаются автоматически ниже.
                            </p>
                          </div>
                          <div>
                            <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-700">
                              Сколько {selectedRestockPackaging.packageName === 'мешок' ? 'мешков' : 'коробок'}
                            </label>
                            <input
                              type="number"
                              min="1"
                              required
                              value={restockData.packageQuantityInput}
                              placeholder={selectedRestockPackaging.packageName === 'мешок' ? 'Введите количество мешков' : 'Введите количество коробок'}
                              onChange={e =>
                                setRestockData((prev) => ({
                                  ...prev,
                                  packageQuantityInput: e.target.value,
                                  quantity: String(
                                    (Number(e.target.value || 0) || 0) *
                                    (selectedRestockPackaging.unitsPerPackage || 0)
                                  ),
                                }))
                              }
                              className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 font-bold outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                            />
                            <p className="mt-2 text-xs font-medium text-slate-400">
                              1 {formatCountWithUnit(1, selectedRestockPackaging.packageName).replace(/^1\s+/, '')} = {selectedRestockPackaging.unitsPerPackage} {normalizeDisplayBaseUnit(selectedProduct?.unit || 'шт')}
                            </p>
                            <p className="mt-1 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                              Итого в штуках: {totalRestockUnits} {normalizeDisplayBaseUnit(selectedProduct?.unit || 'шт')}
                            </p>
                          </div>
                        </>
                      ) : (
                        <div>
                          <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-700">Количество</label>
                          <input
                            type="number"
                            required
                            step="0.01"
                            value={restockData.quantity}
                            onChange={e => setRestockData({ ...restockData, quantity: e.target.value })}
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 font-bold outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                          />
                        </div>
                      )}
                      {isAdmin && (
                        <div>
                          <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-700">Цена закупки</label>
                          <input
                            type="number"
                            step="0.01"
                            required
                            value={restockData.costPrice}
                            onChange={e => setRestockData((prev) => ({ ...prev, costPrice: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 font-bold outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                          />
                          <p className="mt-2 text-xs font-medium text-slate-400">
                            Закупка за 1 шт без расходов.
                          </p>
                        </div>
                      )}
                      {isAdmin && (
                        <div>
                          <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-700">Расходы %</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={restockData.expensePercent}
                            onChange={(e) => setRestockData((prev) => ({ ...prev, expensePercent: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 font-bold outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                          />
                        </div>
                      )}
                      <div>
                        <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-700">Цена продажи</label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={restockData.sellingPrice}
                          onChange={e => setRestockData({ ...restockData, sellingPrice: e.target.value })}
                          onBlur={e => setRestockData({ ...restockData, sellingPrice: formatPriceInput(e.target.value) })}
                          className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 font-bold outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                        />
                        <p className="mt-2 text-xs font-medium text-slate-400">
                          Новая цена продажи для этой поставки.
                        </p>
                      </div>
                    </div>
                    <div>
                      <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-700">Причина / Комментарий</label>
                      <input
                        type="text"
                        value={restockData.reason}
                        onChange={e => setRestockData({ ...restockData, reason: e.target.value })}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 font-bold outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                        placeholder="Напр: Новая поставка"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-end sm:space-x-3 sm:gap-0">
                    <button type="button" onClick={closeRestockModal} className="rounded-2xl px-6 py-3 text-sm font-bold text-slate-500 transition-all hover:bg-slate-50">Отмена</button>
                    <button type="submit" className="rounded-2xl bg-emerald-600 px-8 py-3 text-sm font-bold text-white shadow-xl shadow-emerald-600/20 transition-all hover:bg-emerald-700 active:scale-95">Пополнить</button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showWriteOffModal && selectedWriteOffProduct && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeWriteOffModal}
              className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-2 backdrop-blur-md sm:items-center sm:p-4"
            >
              <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                onClick={(event) => event.stopPropagation()}
                className="w-full max-w-3xl overflow-hidden rounded-t-[2rem] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.24)] sm:max-h-[88vh] sm:rounded-[2rem]"
              >
                <div className="border-b border-amber-100 bg-[linear-gradient(135deg,#fff8eb_0%,#ffffff_58%,#fff4db_100%)] px-4 py-4 sm:px-6 sm:py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-amber-700">
                        <Scissors size={12} />
                        <span>Списание</span>
                      </div>
                      <h3 className="mt-3 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Списание товара</h3>
                      <p className="mt-1 text-sm font-medium text-slate-500">
                        Быстрая складская операция по выбранному товару.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeWriteOffModal}
                      className="rounded-2xl border border-white/70 bg-white/80 p-2 text-slate-400 transition-all hover:border-slate-200 hover:text-slate-600"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSubmitWriteOff} className="space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Товар</p>
                      <p className="mt-2 text-[14px] font-bold leading-tight text-slate-900">
                        {selectedWriteOffProduct ? formatProductName(selectedWriteOffProduct.name) : 'Не выбран'}
                      </p>
                    </div>
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Склад</p>
                      <p className="mt-2 text-[14px] font-bold text-slate-900">
                        {selectedWriteOffProduct?.warehouse?.name || warehouses.find((warehouse) => warehouse.id === selectedWriteOffProduct?.warehouseId)?.name || '---'}
                      </p>
                    </div>
                    <div className="rounded-[22px] border border-amber-200 bg-[linear-gradient(135deg,#fff8e8_0%,#fffdf8_100%)] px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">Остаток</p>
                      <p className="mt-2 whitespace-pre-line text-[15px] font-black text-amber-900">
                        {selectedWriteOffProduct ? getStockBreakdown(selectedWriteOffProduct).primary : '0'}
                      </p>
                      {selectedWriteOffProduct && getStockBreakdown(selectedWriteOffProduct).secondary && (
                        <p className="mt-1 text-[11px] font-medium text-amber-700">
                          {getStockBreakdown(selectedWriteOffProduct).secondary}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
                    <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <label className="block text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Количество</label>
                        <span className="text-[11px] font-semibold text-slate-400">Только целое число</span>
                      </div>
                      <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-3">
                        <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-3">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            required
                            value={writeOffData.quantity}
                            onChange={(event) => {
                              setWriteOffData((prev) => ({ ...prev, quantity: event.target.value }));
                            }}
                            className="w-full bg-transparent text-[34px] font-black tracking-tight text-slate-900 outline-none"
                          />
                          <p className="mt-1 text-[11px] font-medium text-slate-400">Количество к списанию</p>
                        </div>
                        <div className="rounded-[22px] border border-slate-200 bg-white px-3 py-3 text-center">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Доступно</p>
                          <div className="mt-2 text-[34px] leading-none font-black text-slate-900">
                            {Number(selectedWriteOffProduct.stock || 0)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {[1, 5, 10].map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => handleSetWriteOffQuantity(value)}
                            className={clsx(
                              'rounded-full border px-3.5 py-2 text-[12px] font-bold transition-all duration-150',
                              Number(writeOffData.quantity || 0) === value
                                ? 'border-amber-400 bg-[linear-gradient(135deg,#fff3c8_0%,#ffe8b2_100%)] text-amber-800 shadow-[0_8px_20px_rgba(245,158,11,0.18)]'
                                : 'border-slate-200 bg-white text-slate-600 hover:-translate-y-px hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700'
                            )}
                          >
                            {value}
                          </button>
                        ))}
                        {selectedWriteOffPackaging && Number(selectedWriteOffPackaging.unitsPerPackage || 0) > 1 && (
                          <button
                            type="button"
                            onClick={() => handleSetWriteOffQuantity(Number(selectedWriteOffPackaging.unitsPerPackage || 0))}
                            className={clsx(
                              'rounded-full border px-3.5 py-2 text-[12px] font-bold transition-all duration-150',
                              Number(writeOffData.quantity || 0) === Number(selectedWriteOffPackaging.unitsPerPackage || 0)
                                ? 'border-amber-400 bg-[linear-gradient(135deg,#fff3c8_0%,#ffe8b2_100%)] text-amber-800 shadow-[0_8px_20px_rgba(245,158,11,0.18)]'
                                : 'border-slate-200 bg-white text-slate-600 hover:-translate-y-px hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700'
                            )}
                          >
                            1 {selectedWriteOffPackaging.packageName}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleSetWriteOffQuantity(Number(selectedWriteOffProduct?.stock || 0))}
                          className={clsx(
                            'rounded-full border px-3.5 py-2 text-[12px] font-bold transition-all duration-150',
                            Number(writeOffData.quantity || 0) === Number(selectedWriteOffProduct?.stock || 0)
                              ? 'border-amber-400 bg-[linear-gradient(135deg,#fff3c8_0%,#ffe8b2_100%)] text-amber-800 shadow-[0_8px_20px_rgba(245,158,11,0.18)]'
                              : 'border-slate-200 bg-white text-slate-600 hover:-translate-y-px hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700'
                          )}
                        >
                          Всё
                        </button>
                      </div>
                    </section>

                    <section className="rounded-[24px] border border-slate-200 bg-white p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <label className="block text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Причина списания</label>
                        <span className="text-[11px] font-semibold text-slate-400">Выбери готовый вариант или введи свой</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {writeOffReasonPresets.map((reason) => {
                          const isSelected = normalizedWriteOffReason === reason.toLowerCase();
                          return (
                            <button
                              key={reason}
                              type="button"
                              onClick={() => setWriteOffData((prev) => ({ ...prev, reason: reason.toLowerCase() }))}
                              className={clsx(
                                'rounded-[18px] border px-3 py-3 text-left text-[13px] font-bold transition-all duration-150',
                                isSelected
                                  ? 'border-amber-400 bg-[linear-gradient(135deg,#fff6d9_0%,#ffe6b3_100%)] text-amber-800 shadow-[0_10px_24px_rgba(245,158,11,0.18)]'
                                  : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:-translate-y-px hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700'
                              )}
                            >
                              {reason}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-3 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 transition-all focus-within:border-amber-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-amber-500/10">
                        <input
                          type="text"
                          required
                          value={writeOffData.reason}
                          onChange={(event) => setWriteOffData((prev) => ({ ...prev, reason: event.target.value }))}
                          className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none"
                          placeholder="Своя причина"
                        />
                        {isCustomWriteOffReason && (
                          <p className="mt-1 text-[11px] font-medium text-amber-700">Используется пользовательская причина</p>
                        )}
                      </div>
                    </section>
                  </div>

                  <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-end">
                    <button
                      type="button"
                      onClick={closeWriteOffModal}
                      className="rounded-2xl px-5 py-3 text-sm font-bold text-slate-500 transition-all hover:bg-slate-50"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      className="rounded-2xl bg-[linear-gradient(135deg,#f59e0b_0%,#ea580c_100%)] px-6 py-3 text-sm font-black text-white shadow-[0_16px_34px_rgba(234,88,12,0.28)] transition-all hover:-translate-y-px hover:brightness-105 active:scale-[0.98]"
                    >
                      Подтвердить списание
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>



        <React.Suspense fallback={null}>
          <ProductHistoryModal
            key={showHistoryModal ? `history-${selectedProduct?.id || 'empty'}` : 'history-closed'}
            isOpen={showHistoryModal}
            onClose={closeHistoryModal}
            productName={selectedProduct?.name}
            product={selectedProduct}
            productHistory={productHistory}
            onReverseIncoming={handleReverseIncoming}
            onReverseCorrectionWriteOff={handleReverseCorrectionWriteOff}
            onReturnWriteOff={handleOpenReturnWriteOffModal}
            onDeleteWriteOffPermanently={handleOpenDeleteWriteOffConfirm}
            onWriteOff={isAdmin ? handleOpenWriteOffModal : undefined}
          />
          <ProductBatchesModal
            key={showBatchesModal ? `batches-${selectedProduct?.id || 'empty'}` : 'batches-closed'}
            isOpen={showBatchesModal}
            onClose={closeBatchesModal}
            selectedProduct={selectedProduct}
            productBatches={productBatches}
            canManage={isAdmin}
            onDeleteBatch={handleDeleteBatch}
          />
        </React.Suspense>

        <AnimatePresence>
          {showMergeModal && selectedProduct && (
            <motion.div
              onClick={closeMergeModal}
              className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center sm:p-4"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-2xl overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]"
              >
                <div className="flex items-center justify-between border-b border-slate-100 bg-fuchsia-50/50 p-4 sm:p-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-fuchsia-600 p-3 text-white">
                      <GitMerge size={20} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900">Объединить дубликаты</h3>
                      <p className="text-sm text-slate-500">Выберите основной товар, в который нужно перенести остатки и историю.</p>
                    </div>
                  </div>
                  <button onClick={closeMergeModal} className="text-slate-400 transition-colors hover:text-slate-600">
                    <X size={22} />
                  </button>
                </div>

                <div className="space-y-5 p-4 sm:p-6">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Объединяемый товар</p>
                    <p className="mt-2 text-base font-semibold text-slate-900">{formatProductName(selectedProduct.name)}</p>
                    <p className="mt-1 text-sm text-slate-500">Остаток: {selectedProduct.stock} {selectedProduct.unit}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Основной товар</label>
                    <select
                      value={mergeTargetId}
                      onChange={(e) => setMergeTargetId(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition-all focus:border-fuchsia-300 focus:bg-white"
                    >
                      {getMergeCandidates(selectedProduct).map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {formatProductName(candidate.name)} • {candidate.stock} {candidate.unit}
                        </option>
                      ))}
                    </select>
                  </div>

                  <p className="text-sm text-slate-500">
                    Партии, остатки, история движения, цены и позиции продаж будут перенесены в выбранный основной товар.
                  </p>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50 p-4 sm:flex-row sm:justify-end sm:p-6">
                  <button
                    onClick={closeMergeModal}
                    className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleMergeProduct}
                    className="rounded-2xl bg-fuchsia-600 px-6 py-3 text-sm font-bold text-white transition-all hover:bg-fuchsia-700"
                  >
                    Объединить
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <React.Suspense fallback={null}>
          <ConfirmationModal
            isOpen={showDeleteConfirm}
            onClose={closeDeleteConfirm}
            onConfirm={handleConfirmDeleteProduct}
            title="Удалить товар навсегда?"
            message={`Товар "${formatProductName(selectedProduct?.name)}" будет удалён навсегда. Если он уже участвовал в продажах, система не даст удалить его полностью.`}
          />
        </React.Suspense>

        <React.Suspense fallback={null}>
          <ConfirmationModal
            isOpen={showDeleteWriteOffConfirm}
            onClose={closeDeleteWriteOffConfirm}
            onConfirm={handleDeleteWriteOffPermanently}
            title="Удалить списание навсегда?"
            message="Операция полностью удалит запись списания из истории. Складской остаток и приход будут восстановлены, но восстановить саму удалённую запись потом уже нельзя."
            confirmText="Удалить навсегда"
            cancelText="Отмена"
            type="danger"
          />
        </React.Suspense>

        <AnimatePresence>
          {showReturnWriteOffModal && selectedHistoryTransaction && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeReturnWriteOffModal}
              className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center sm:p-4"
            >
              <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                onClick={(event) => event.stopPropagation()}
                className="w-full max-w-xl overflow-hidden rounded-t-[2rem] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.24)] sm:rounded-[2rem]"
              >
                <div className="border-b border-emerald-100 bg-[linear-gradient(135deg,#eefcf6_0%,#ffffff_58%,#f3fbff_100%)] px-4 py-4 sm:px-6 sm:py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">
                        <RotateCcw size={12} />
                        <span>Возврат списания</span>
                      </div>
                      <h3 className="mt-3 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Вернуть товар на склад</h3>
                      <p className="mt-1 text-sm font-medium text-slate-500">Используйте это, если списание было введено ошибочно.</p>
                    </div>
                    <button
                      type="button"
                      onClick={closeReturnWriteOffModal}
                      className="rounded-2xl border border-white/70 bg-white/80 p-2 text-slate-400 transition-all hover:border-slate-200 hover:text-slate-600"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSubmitReturnWriteOff} className="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Списание</p>
                      <p className="mt-2 text-sm font-bold text-slate-900">{new Date(selectedHistoryTransaction.createdAt).toLocaleString('ru-RU')}</p>
                    </div>
                    <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">Доступно вернуть</p>
                      <p className="mt-2 text-sm font-black text-emerald-900">{Math.abs(Number(selectedHistoryTransaction.qtyChange || 0))}</p>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                    <label className="block text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Количество возврата</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={returnWriteOffData.quantity}
                      onChange={(event) => setReturnWriteOffData((prev) => ({ ...prev, quantity: event.target.value.replace(/[^\d]/g, '') }))}
                      className="mt-3 w-full rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-2xl font-black text-slate-900 outline-none"
                    />
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                    <label className="block text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Причина возврата</label>
                    <input
                      type="text"
                      value={returnWriteOffData.reason}
                      onChange={(event) => setReturnWriteOffData((prev) => ({ ...prev, reason: event.target.value }))}
                      className="mt-3 w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none"
                      placeholder="Ошибка ввода"
                    />
                  </div>

                  <div className="rounded-[22px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    Возврат восстановит остаток на складе и приход по этому списанию.
                  </div>

                  <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-end">
                    <button
                      type="button"
                      onClick={closeReturnWriteOffModal}
                      className="rounded-2xl px-5 py-3 text-sm font-bold text-slate-500 transition-all hover:bg-slate-50"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      className="rounded-2xl bg-[linear-gradient(135deg,#10b981_0%,#0f766e_100%)] px-6 py-3 text-sm font-black text-white shadow-[0_16px_34px_rgba(16,185,129,0.24)] transition-all hover:-translate-y-px hover:brightness-105"
                    >
                      Вернуть на склад
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="overflow-hidden rounded-[28px] border border-white bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 bg-white p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex w-full flex-col gap-3 lg:max-w-4xl lg:flex-1">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-500" size={16} />
                <input
                  type="text"
                  placeholder="Поиск по названию..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-2xl border border-sky-100 bg-sky-50 py-3 pl-11 pr-4 text-sm font-medium text-slate-700 outline-none transition-all focus:border-sky-300 focus:bg-white"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <div className="relative w-full">
                  <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-violet-500" size={16} />
                  <select
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    disabled={!isAdmin}
                    className="w-full appearance-none rounded-2xl border border-violet-100 bg-violet-50 py-3 pl-11 pr-4 text-sm font-medium text-slate-700 outline-none transition-all focus:border-violet-300 focus:bg-white"
                  >
                    <option value="">Все склады</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={exportStockReport}
                  disabled={!filteredProducts.length}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 transition-all hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  <FileText size={16} />
                  <span>Скачать остаток</span>
                </button>
                <button
                  type="button"
                  onClick={exportPriceList}
                  disabled={!filteredProducts.length}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700 transition-all hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  <Tag size={16} />
                  <span>Скачать прайс</span>
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="rounded-full border border-emerald-100 bg-emerald-50 px-3.5 py-2 text-[11px] font-semibold text-emerald-700">
                Товаров: {filteredProducts.length}
              </div>
              {duplicateProductsCount > 0 ? (
                <>
                  <div className="rounded-full border border-amber-100 bg-amber-50 px-3.5 py-2 text-[11px] font-semibold text-amber-700">
                    Дублей: {duplicateProductsCount}
                  </div>
                  <button
                    type="button"
                    onClick={handleMergeExactDuplicates}
                    disabled={isMergingDuplicates}
                    className="rounded-full bg-fuchsia-600 px-3.5 py-2 text-[11px] font-semibold text-white transition-all hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isMergingDuplicates ? 'Объединение...' : 'Объединить дубликаты'}
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <div className="space-y-3 p-3 md:hidden">
            {paginatedProducts.map((product, index) => (
              <div key={`mobile-${product.id ?? product.name}-${index}`} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                <div className="border-b border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                      {product.photoUrl ? (
                        <img
                          src={resolveMediaUrl(product.photoUrl, product.id)}
                          alt={product.name}
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(event) => handleBrokenImage(event, product.id)}
                        />
                      ) : (
                        <ImageIcon className="text-slate-300" size={18} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 break-words text-[16px] font-semibold leading-5 text-slate-900">
                          {formatProductName(product.name)}
                        </p>
                        <span className="shrink-0 rounded-xl bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
                          #{(currentPage - 1) * pageSize + index + 1}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-xl border border-violet-100 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700">
                          {product.category?.name || 'Без категории'}
                        </span>
                        <span className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                          {selectedWarehouseId ? product.warehouse?.name || 'Склад' : 'Все склады'}
                        </span>
                        {getDuplicateHintCount(product) > 0 && (
                          <button
                            onClick={() => handleOpenMergeModal(product)}
                            className="rounded-xl border border-amber-100 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700"
                          >
                            Дубликат
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  <div className={clsx(
                    "rounded-[22px] border px-4 py-3.5",
                    product.stock <= product.minStock ? "border-rose-200 bg-rose-50/70" : "border-emerald-100 bg-emerald-50/60"
                  )}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={clsx(
                            "text-[10px] font-semibold uppercase tracking-[0.18em]",
                            product.stock <= product.minStock ? "text-rose-500" : "text-emerald-600"
                          )}>
                            Остаток
                          </p>
                          <span className={clsx(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            product.stock <= product.minStock ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                          )}>
                            {product.stock <= product.minStock ? 'Низкий' : 'В норме'}
                          </span>
                        </div>
                        <p className={clsx(
                          "mt-1 whitespace-pre-line break-words text-[17px] font-semibold leading-5",
                          product.stock <= product.minStock ? "text-rose-700" : "text-slate-900"
                        )}>
                          {getStockBreakdown(product).primary}
                        </p>
                        {getStockBreakdown(product).secondary && (
                          <p className={clsx(
                            "mt-1 break-words text-[11px] font-medium",
                            product.stock <= product.minStock ? "text-rose-500" : "text-slate-500"
                          )}>
                            {getStockBreakdown(product).secondary}
                          </p>
                        )}
                      </div>
                      <div className={clsx(
                        "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                        product.stock <= product.minStock ? "bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.12)]" : "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]"
                      )} />
                    </div>
                  </div>

                  <div className={clsx(
                    "grid gap-3",
                    isAdmin ? "grid-cols-4" : "grid-cols-2"
                  )}>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Продажа</p>
                      <p className="mt-1 break-words text-sm font-semibold text-slate-900">
                        {isAggregateMode ? '-' : formatMoney(product.sellingPrice)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Приход</p>
                      <p className="mt-1 break-words text-sm font-semibold text-slate-900">
                        {product.totalIncoming} <span className="text-[10px] uppercase text-slate-400">{normalizeDisplayBaseUnit(product.unit || 'шт')}</span>
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Закупка</p>
                        <div className="mt-1 flex flex-col">
                          {isAggregateMode ? (
                            <p className="text-sm font-semibold text-slate-900">-</p>
                          ) : (
                            <>
                              <p className="text-sm font-semibold text-slate-900">
                                {(() => {
                                  const activeBatches = (product.batches || [])
                                    .filter((b: any) => Number(b.remainingQuantity) > 0)
                                    .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                                  const currentBatch = activeBatches[0];
                                  if (currentBatch) {
                                    return formatMoney(currentBatch.costPrice);
                                  }
                                  return formatMoney(product.costPrice);
                                })()}
                              </p>
                              <p className="text-[10px] font-medium text-slate-400">
                                Посл: {formatMoney(product.costPrice)}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    {isAdmin && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Рентабельность</p>
                        <p className="mt-1 break-words text-sm font-semibold text-slate-900">
                          {isAggregateMode ? '-' : formatPercent(getProductEfficiencyMetrics(product).marginPercent, 1)}
                        </p>
                        {!isAggregateMode && (
                          <span className={clsx('mt-2 inline-flex rounded-full border px-2 py-1 text-[10px] font-bold', getProductEfficiencyMetrics(product).className)}>
                            {getProductEfficiencyMetrics(product).label}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {isAdmin && !isAggregateMode && (
                  <div className="border-t border-slate-100 p-4">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedMobileActionsId((current) =>
                          current === Number(product.id) ? null : Number(product.id)
                        )
                      }
                      className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-white"
                    >
                      <span>Действия</span>
                      {expandedMobileActionsId === Number(product.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {expandedMobileActionsId === Number(product.id) && (
                      <div className="mt-3 max-h-[320px] overflow-y-auto rounded-[22px] border border-slate-200 bg-slate-50/80">
                        <button
                          onClick={() => {
                            setSelectedProduct(product);
                            setFormData(buildProductFormData(product));
                            setCategoryInput(product.category?.name || '');
                            setShowEditModal(true);
                            setExpandedMobileActionsId(null);
                          }}
                          className="flex w-full items-center justify-between border-b border-slate-200/80 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-700 transition-all hover:bg-violet-50 hover:text-violet-700"
                        >
                          <span>Изменить товар</span>
                          <ChevronDown size={14} className="-rotate-90 text-slate-300" />
                        </button>
                        <button
                          onClick={() => {
                            const defaultPackaging = getDefaultPackaging(normalizePackagings(product));
                            setSelectedProduct(product);
                            setRestockData({
                              ...restockData,
                              warehouseId: product.warehouseId?.toString() || '',
                              quantity: '',
                              selectedPackagingId: defaultPackaging ? String(defaultPackaging.id) : '',
                              packageQuantityInput: '',
                              costPrice: formatPriceInput(product.purchaseCostPrice ?? product.costPrice),
                              sellingPrice: formatPriceInput(product.sellingPrice),
                              expensePercent: String(product.expensePercent ?? 0),
                              reason: '',
                            });
                            setShowRestockModal(true);
                            setExpandedMobileActionsId(null);
                          }}
                          className="flex w-full items-center justify-between border-b border-slate-200/80 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-700 transition-all hover:bg-emerald-50 hover:text-emerald-700"
                        >
                          <span>Оформить приход</span>
                          <ChevronDown size={14} className="-rotate-90 text-slate-300" />
                        </button>
                        <button
                          onClick={() => {
                            handleShowHistory(product);
                            setExpandedMobileActionsId(null);
                          }}
                          className="flex w-full items-center justify-between border-b border-slate-200/80 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-700 transition-all hover:bg-sky-50 hover:text-sky-700"
                        >
                          <span>Открыть историю</span>
                          <ChevronDown size={14} className="-rotate-90 text-slate-300" />
                        </button>
                        <button
                          onClick={() => {
                            handleOpenWriteOffModal(product);
                            setExpandedMobileActionsId(null);
                          }}
                          disabled={Number(product.stock || 0) <= 0}
                          className="flex w-full items-center justify-between border-b border-slate-200/80 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-700 transition-all hover:bg-amber-50 hover:text-amber-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          <span>Списать товар</span>
                          <ChevronDown size={14} className="-rotate-90 text-slate-300" />
                        </button>
                        <button
                          onClick={() => {
                            handleShowBatches(product);
                            setExpandedMobileActionsId(null);
                          }}
                          className="flex w-full items-center justify-between border-b border-slate-200/80 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-700 transition-all hover:bg-violet-50 hover:text-violet-700"
                        >
                          <span>Посмотреть партии</span>
                          <ChevronDown size={14} className="-rotate-90 text-slate-300" />
                        </button>
                        <button
                          onClick={() => {
                            const defaultPackaging = getDefaultPackaging(normalizePackagings(product));
                            setSelectedProduct(product);
                            setTransferData({
                              ...emptyTransferData,
                              fromWarehouseId: product.warehouseId?.toString() || '',
                              selectedPackagingId: defaultPackaging ? String(defaultPackaging.id) : '',
                            });
                            setShowTransferModal(true);
                            setExpandedMobileActionsId(null);
                          }}
                          className="flex w-full items-center justify-between border-b border-slate-200/80 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-700 transition-all hover:bg-amber-50 hover:text-amber-700"
                        >
                          <span>Перенести товар</span>
                          <ChevronDown size={14} className="-rotate-90 text-slate-300" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedProduct(product);
                            setShowDeleteConfirm(true);
                            setExpandedMobileActionsId(null);
                          }}
                          className="flex w-full items-center justify-between bg-white px-4 py-3 text-left text-sm font-semibold text-slate-700 transition-all hover:bg-rose-50 hover:text-rose-700"
                        >
                          <span>Удалить товар</span>
                          <ChevronDown size={14} className="-rotate-90 text-slate-300" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {displayProducts.length === 0 && !isLoading && (
              <div className="rounded-[22px] border border-slate-200 bg-white px-5 py-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#f4f5fb] text-slate-300">
                  <Package size={28} />
                </div>
                <p className="mt-4 text-lg font-black text-slate-900">Товары не найдены</p>
                <p className="mt-1 text-sm text-slate-500">Измените поиск или выберите другой склад.</p>
              </div>
            )}
          </div>

          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={displayProducts.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            className="border-t-0 pt-0 md:hidden"
          />

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f4f5fb] text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <th className="px-5 py-3">№</th>
                  <th className="px-5 py-3 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('name')}>
                    <div className="flex items-center space-x-1.5">
                      <span>Товар</span>
                      {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                    </div>
                  </th>
                  {isAdmin && (
                    <th className="px-5 py-3 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('costPrice')}>
                      <div className="flex items-center space-x-1.5">
                        <span>Закупка</span>
                        {sortConfig.key === 'costPrice' && (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                      </div>
                    </th>
                  )}
                  <th className="px-5 py-3 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('sellingPrice')}>
                    <div className="flex items-center space-x-1.5">
                      <span>Продажа</span>
                      {sortConfig.key === 'sellingPrice' && (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                    </div>
                  </th>
                  <th className="px-5 py-3 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('stock')}>
                    <div className="flex items-center space-x-1.5">
                      <span>Остаток</span>
                      {sortConfig.key === 'stock' && (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                    </div>
                  </th>
                  <th className="px-5 py-3">Приход</th>
                  {isAdmin && <th className="px-5 py-3">Рентабельность</th>}
                  {isAdmin && <th className="sticky right-0 z-10 bg-[#f4f5fb] px-5 py-3 text-right">Действия</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedProducts.map((product, index) => (
                  <tr key={product.id} className="group transition-all duration-300 hover:bg-slate-50/70">
                    <td className="px-5 py-4 text-xs font-medium text-slate-400">{(currentPage - 1) * pageSize + index + 1}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center space-x-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 transition-transform duration-500 group-hover:scale-105">
                          {product.photoUrl ? (
                            <img
                              src={resolveMediaUrl(product.photoUrl, product.id)}
                              alt={product.name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                              onError={(event) => handleBrokenImage(event, product.id)}
                            />
                          ) : (
                            <ImageIcon className="text-slate-300" size={16} />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium leading-tight text-slate-900">{formatProductName(product.name)}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <p className="text-xs font-medium text-slate-400">
                              {product.category?.name || 'Без категории'}
                            </p>
                            {getDuplicateHintCount(product) > 0 && (
                              <button
                                onClick={() => handleOpenMergeModal(product)}
                                className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700"
                              >
                                Дубликат
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3">
                        {selectedWarehouseId ? (
                          <div className="flex flex-col">
                            <p className="text-xs font-semibold text-slate-900">
                              {(() => {
                                const activeBatches = (product.batches || [])
                                  .filter((b: any) => Number(b.remainingQuantity) > 0)
                                  .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                                const currentBatch = activeBatches[0];
                                if (currentBatch) {
                                  return formatMoney(currentBatch.costPrice);
                                }
                                return formatMoney(product.costPrice);
                              })()}
                            </p>
                            <p className="text-[10px] font-medium text-slate-400">
                              Посл: {formatMoney(product.costPrice)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">-</span>
                        )}
                      </td>
                    )}
                    <td className="px-5 py-3">
                      {selectedWarehouseId ? (
                        <p className="text-sm font-semibold text-slate-900">{formatMoney(product.sellingPrice)}</p>
                      ) : (
                        <span className="text-xs text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center space-x-2">
                        <div className={clsx(
                          "w-1.5 h-1.5 rounded-full",
                          product.stock <= product.minStock ? "bg-rose-600 animate-pulse" : "bg-emerald-500"
                        )} />
                        <div className={clsx(
                          "min-w-0",
                          product.stock <= product.minStock ? "text-rose-600" : "text-slate-900"
                        )}>
                          <p className="whitespace-pre-line text-sm font-semibold">
                            {getStockBreakdown(product).primary}
                          </p>
                          {getStockBreakdown(product).secondary && (
                            <p className="text-[11px] font-medium text-slate-400">
                              {getStockBreakdown(product).secondary}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-xs font-medium text-slate-500">{product.totalIncoming} <span className="text-[10px] font-medium text-slate-400 uppercase">{normalizeDisplayBaseUnit(product.unit || 'шт')}</span></p>
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3">
                        {selectedWarehouseId ? (
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-slate-900">{formatPercent(getProductEfficiencyMetrics(product).marginPercent, 1)}</p>
                            <span className={clsx('inline-flex rounded-full border px-2 py-1 text-[10px] font-bold', getProductEfficiencyMetrics(product).className)}>
                              {getProductEfficiencyMetrics(product).label}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">-</span>
                        )}
                      </td>
                    )}
                    {isAdmin && (
                      <td className="sticky right-0 bg-white px-5 py-3 text-right group-hover:bg-slate-50/70">
                        <div className="flex flex-col items-end space-y-1.5">
                          <div className="flex items-center space-x-1.5">
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setSelectedProduct(product);
                                  setFormData(buildProductFormData(product));
                                  setCategoryInput(product.category?.name || '');
                                  setShowEditModal(true);
                                }}
                                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-all hover:border-violet-200 hover:bg-violet-50 hover:text-violet-600"
                                title="Редактировать"
                              >
                                <Edit size={14} />
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  const defaultPackaging = getDefaultPackaging(normalizePackagings(product));
                                  setSelectedProduct(product);
                                  setRestockData({
                                    ...restockData,
                                    warehouseId: product.warehouseId?.toString() || '',
                                    quantity: '',
                                    selectedPackagingId: defaultPackaging ? String(defaultPackaging.id) : '',
                                    packageQuantityInput: '',
                                    costPrice: formatPriceInput(product.purchaseCostPrice ?? product.costPrice),
                                    sellingPrice: formatPriceInput(product.sellingPrice),
                                    expensePercent: String(product.expensePercent ?? 0),
                                    reason: '',
                                  });
                                  setShowRestockModal(true);
                                }}
                                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-all hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600"
                                title="Пополнить"
                              >
                                <PlusCircle size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => handleShowBatches(product)}
                              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-all hover:border-violet-200 hover:bg-violet-50 hover:text-violet-600"
                              title="Партии (FIFO)"
                            >
                              <Layers size={14} />
                            </button>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <button
                              onClick={() => handleShowHistory(product)}
                              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-all hover:border-sky-200 hover:bg-sky-50 hover:text-sky-600"
                              title="История"
                            >
                              <History size={14} />
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleOpenWriteOffModal(product)}
                                disabled={Number(product.stock || 0) <= 0}
                                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-all hover:border-amber-200 hover:bg-amber-50 hover:text-amber-600 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300"
                                title="Списать"
                              >
                                <Scissors size={14} />
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  const defaultPackaging = getDefaultPackaging(normalizePackagings(product));
                                  setSelectedProduct(product);
                                  setTransferData({
                                    ...emptyTransferData,
                                    fromWarehouseId: product.warehouseId?.toString() || '',
                                    selectedPackagingId: defaultPackaging ? String(defaultPackaging.id) : '',
                                  });
                                  setShowTransferModal(true);
                                }}
                                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-all hover:border-amber-200 hover:bg-amber-50 hover:text-amber-600"
                                title="Перенос"
                              >
                                <ArrowRightLeft size={14} />
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setSelectedProduct(product);
                                  setShowDeleteConfirm(true);
                                }}
                                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                                title="Удалить"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {displayProducts.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 5} className="px-5 py-20 text-center">
                      <div className="flex flex-col items-center justify-center space-y-4">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f4f5fb] text-slate-300">
                          <Package size={32} />
                        </div>
                        <div>
                          <p className="text-xl font-black text-slate-900">Товары не найдены</p>
                          <p className="text-slate-500 font-medium text-sm">Измените параметры поиска или выберите другой склад.</p>
                        </div>
                        <button
                          onClick={() => { resetForm(); setShowAddModal(true); }}
                          className="rounded-2xl bg-violet-500 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-violet-600"
                        >
                          Добавить товар
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="hidden md:block">
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={displayProducts.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              className="border-t-0"
            />
          </div>
        </div>
      </div>
    </div>
    
  ;
}
