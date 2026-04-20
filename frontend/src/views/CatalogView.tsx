import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, Filter, Layers, Package, Plus, Search, ShoppingCart, Tag, Warehouse, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getProducts } from '../api/products.api';
import { getPublicSettings } from '../api/settings-reference.api';
import { getWarehouses } from '../api/warehouses.api';
import PaginationControls from '../components/common/PaginationControls';
import { formatMoney } from '../utils/format';
import { handleBrokenImage, resolveMediaUrl } from '../utils/media';
import { formatProductName } from '../utils/productName';
import { filterWarehousesForUser, getCurrentUser, getUserWarehouseId, isAdminUser } from '../utils/userAccess';

const shell = (...classNames: Array<string | false | null | undefined>) => classNames.filter(Boolean).join(' ');
const getStoredWarehouseId = () =>
  typeof window === 'undefined'
    ? ''
    : sessionStorage.getItem('pos_warehouse_session') || localStorage.getItem('pos_warehouse_session') || '';

type PackagingOption = { id: number; packageName: string; baseUnitName: string; unitsPerPackage: number; isDefault?: boolean };

const normalizeDisplayBaseUnit = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'шт';
  if (['пачка', 'пачки', 'пачек', 'шт', 'штук', 'штука', 'штуки', 'pcs', 'piece', 'pieces'].includes(normalized)) return 'шт';
  return normalized;
};

const normalizePackagings = (product: any): PackagingOption[] =>
  Array.isArray(product?.packagings)
    ? product.packagings
        .map((entry: any) => ({
          id: Number(entry.id),
          packageName: String(entry.packageName || '').trim(),
          baseUnitName: normalizeDisplayBaseUnit(entry.baseUnitName || product?.baseUnitName || product?.unit || 'шт'),
          unitsPerPackage: Number(entry.unitsPerPackage || 0),
          isDefault: Boolean(entry.isDefault),
        }))
        .filter((entry: PackagingOption) => entry.id > 0 && entry.packageName && entry.unitsPerPackage > 0)
    : [];

const getDefaultPackaging = (packagings: PackagingOption[]) => packagings.find((entry) => entry.isDefault) || packagings[0] || null;

const getProductStockParts = (product: any) => {
  const packagings = normalizePackagings(product);
  const defaultPackaging = getDefaultPackaging(packagings);
  const baseUnitName = normalizeDisplayBaseUnit(product?.baseUnitName || product?.unit || defaultPackaging?.baseUnitName || 'шт');
  const stock = Math.max(0, Math.floor(Number(product?.stock || 0)));
  if (!defaultPackaging || Number(defaultPackaging.unitsPerPackage || 0) <= 1) return { primary: `${stock} ${baseUnitName}`, secondary: '', isOutOfStock: stock <= 0 };
  const unitsPerPackage = Number(defaultPackaging.unitsPerPackage || 0);
  const packageQuantity = Math.floor(stock / unitsPerPackage);
  const extraUnits = stock % unitsPerPackage;
  if (stock <= 0) return { primary: 'Нет', secondary: '', isOutOfStock: true };
  if (packageQuantity > 0 && extraUnits > 0) return { primary: `${packageQuantity} ${defaultPackaging.packageName}`, secondary: `+ ${extraUnits} ${baseUnitName}`, isOutOfStock: false };
  if (packageQuantity > 0) return { primary: `${packageQuantity} ${defaultPackaging.packageName}`, secondary: '', isOutOfStock: false };
  return { primary: `${extraUnits} ${baseUnitName}`, secondary: '', isOutOfStock: false };
};

const getProductCommercialStats = (product: any) => {
  const salePrice = Number(product?.sellingPrice || 0);
  const purchasePrice = Number(product?.costPrice || 0);
  const profitPerUnit = salePrice - purchasePrice;
  const marginPercent = salePrice > 0 ? (profitPerUnit / salePrice) * 100 : 0;
  return { salePrice, purchasePrice, profitPerUnit, marginPercent };
};

const MetricCard = ({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) => (
  <div className="rounded-2xl bg-slate-50 px-3 py-2">
    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{label}</p>
    <p className={shell('mt-1 break-words text-sm font-semibold leading-5', accent ? 'text-emerald-700' : 'text-slate-900')}>{value}</p>
  </div>
);

export default function CatalogView() {
  const pageSize = 12;
  const user = React.useMemo(() => getCurrentUser(), []);
  const isAdmin = isAdminUser(user);
  const userWarehouseId = getUserWarehouseId(user);
  const hasLoadedReferenceDataRef = React.useRef(false);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [search, setSearch] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(() => getStoredWarehouseId() || (userWarehouseId ? String(userWarehouseId) : ''));
  const [selectedCategory, setSelectedCategory] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [cartNotice, setCartNotice] = useState<{ productName: string; count: number } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    getProducts(selectedWarehouseId ? Number(selectedWarehouseId) : undefined)
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [selectedWarehouseId]);

  useEffect(() => {
    if (hasLoadedReferenceDataRef.current) return;
    hasLoadedReferenceDataRef.current = true;
    Promise.all([getWarehouses(), getPublicSettings()])
      .then(([warehousesData, settingsData]) => {
        const filtered = filterWarehousesForUser(Array.isArray(warehousesData) ? warehousesData : [], user);
        setWarehouses(filtered);
        if (!isAdmin && filtered[0]) setSelectedWarehouseId(String(filtered[0].id));
        setSettings(settingsData || {});
      })
      .catch((error) => {
        hasLoadedReferenceDataRef.current = false;
        console.error(error);
      });
  }, [isAdmin, user]);

  useEffect(() => {
    if (!selectedWarehouseId) return;
    sessionStorage.setItem('pos_warehouse_session', selectedWarehouseId);
    localStorage.setItem('pos_warehouse_session', selectedWarehouseId);
  }, [selectedWarehouseId]);

  const shouldShowPrice = (product: any) => {
    const visibility = settings.priceVisibility || 'everyone';
    if (visibility === 'everyone') return true;
    if (visibility === 'nobody') return false;
    if (visibility === 'in_stock') return product.stock > 0;
    return true;
  };

  const categories = useMemo(() => Array.from(new Set(products.map((product) => product.category?.name).filter(Boolean))), [products]);
  const filteredProducts = products.filter((product) => {
    const matchesSearch = String(product.name || '').toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !selectedCategory || (product.category?.name || '') === selectedCategory;
    const matchesStock = stockFilter === 'all' || (stockFilter === 'in_stock' && product.stock > 0) || (stockFilter === 'out_of_stock' && product.stock <= 0);
    return matchesSearch && matchesCategory && matchesStock;
  });
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => setCurrentPage(1), [search, selectedWarehouseId, selectedCategory, stockFilter]);
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);

  const handleProductClick = (product: any) => {
    setSelectedProduct(product);
    setMobileActionsOpen(false);
    setShowDetails(true);
  };

  const handleAddToSale = (product: any) => {
    if (!selectedWarehouseId) return setCartNotice({ productName: 'Сначала выберите склад', count: 0 });
    const currentCart = JSON.parse(sessionStorage.getItem('pending_cart') || '[]');
    const existing = currentCart.find((item: any) => item.id === product.id);
    const newCart = existing
      ? currentCart.map((item: any) => (item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))
      : [...currentCart, { ...product, quantity: 1 }];
    sessionStorage.setItem('pending_cart', JSON.stringify(newCart));
    sessionStorage.setItem('pos_cart_session', JSON.stringify(newCart));
    sessionStorage.setItem('pos_warehouse_session', selectedWarehouseId);
    localStorage.setItem('pending_cart', JSON.stringify(newCart));
    localStorage.setItem('pos_cart_session', JSON.stringify(newCart));
    localStorage.setItem('pos_warehouse_session', selectedWarehouseId);
    const updatedItem = newCart.find((item: any) => item.id === product.id);
    setCartNotice({ productName: formatProductName(product.name), count: updatedItem?.quantity || 1 });
  };

  return (
    <div className="app-page-shell min-h-full">
      <div className="overflow-hidden rounded-[28px] bg-[#f4f5fb]">
        <div className="space-y-4 px-3 py-4 sm:px-5 sm:py-5 lg:space-y-5">
          <div className="-mx-3 -mt-4 app-surface space-y-1 px-4 py-4 sm:-mx-5 sm:-mt-5 sm:px-6 sm:py-5">
            <h1 className="text-3xl font-medium tracking-tight text-slate-900 sm:text-4xl">Каталог</h1>
            <p className="text-sm leading-6 text-slate-500">Просмотр товаров и быстрое добавление позиций в продажу.</p>
          </div>

          <section className="rounded-3xl border border-white bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-2">
                <p className="text-sm text-slate-500">Каталог товаров</p>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Быстрый поиск товаров</h2>
                <p className="max-w-2xl text-sm leading-6 text-slate-500">Ищите по названию, фильтруйте по остатку и категории, затем сразу добавляйте товар в продажу.</p>
              </div>
              {isAdmin && <button onClick={() => navigate('/products')} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-violet-600"><Plus size={16} /><span>Добавить товар</span></button>}
            </div>
          </section>

          <section className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
            <div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="text" placeholder="Поиск по названию товара..." value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-2xl border border-sky-100 bg-sky-50 py-3.5 pl-11 pr-4 text-sm text-slate-700 outline-none transition-colors focus:border-sky-300" /></div>
            <div className="flex items-center gap-2 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3.5"><Warehouse size={18} className="shrink-0 text-violet-500" /><select value={selectedWarehouseId} onChange={(event) => setSelectedWarehouseId(event.target.value)} disabled={!isAdmin} className="w-full appearance-none bg-transparent text-sm text-slate-700 outline-none"><option value="">Все склады</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></div>
            <div className="flex items-center gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3.5"><Filter size={18} className="shrink-0 text-amber-500" /><select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="w-full appearance-none bg-transparent text-sm text-slate-700 outline-none"><option value="">Все категории</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></div>
            <div className="grid grid-cols-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-1 shadow-sm">{[{ id: 'all', label: 'Все' }, { id: 'in_stock', label: 'В наличии' }, { id: 'out_of_stock', label: 'Нет' }].map((option) => <button key={option.id} onClick={() => setStockFilter(option.id as typeof stockFilter)} className={shell('rounded-xl px-2 py-2.5 text-xs font-medium transition-all sm:text-sm', stockFilter === option.id ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:bg-emerald-50 hover:text-emerald-700')}>{option.label}</button>)}</div>
          </section>

          {loading ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-105 animate-pulse rounded-[28px] border border-white bg-white" />)}</div> : (
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {paginatedProducts.map((product, index) => {
                const stockParts = getProductStockParts(product);
                const commerce = getProductCommercialStats(product);
                return <motion.div key={product.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }} onClick={() => handleProductClick(product)} className="group flex min-h-110 cursor-pointer flex-col overflow-hidden rounded-[28px] border border-slate-200/70 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
                  <div className="flex h-55 shrink-0 items-center justify-center overflow-hidden rounded-t-[28px] bg-slate-100 p-4 sm:h-62.5 lg:h-70">{product.photoUrl ? <img src={resolveMediaUrl(product.photoUrl, product.id)} alt={product.name} className="max-h-full max-w-full rounded-2xl object-contain" referrerPolicy="no-referrer" onError={(event) => handleBrokenImage(event, product.id)} /> : <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-300"><Package size={46} /></div>}</div>
                  <div className="flex flex-1 flex-col p-4 sm:p-5">
                    <div className="flex-1">
                      <h3 title={formatProductName(product.name)} className="line-clamp-4 break-words text-base font-semibold leading-6 text-slate-900 sm:text-[1.05rem]">{formatProductName(product.name)}</h3>
                      <div className="mt-3 min-w-0"><span className="inline-flex max-w-full break-words rounded-full bg-violet-100 px-3 py-1.5 text-xs font-medium text-violet-700">{product.category?.name || 'Без категории'}</span></div>
                      <div className="mt-4 grid grid-cols-3 gap-2"><MetricCard label="Продажа" value={shouldShowPrice(product) ? formatMoney(commerce.salePrice) : 'Скрыта'} /><MetricCard label="Закупка" value={formatMoney(commerce.purchasePrice)} /><MetricCard label="Рентаб." value={commerce.marginPercent > 0 ? `${commerce.marginPercent.toFixed(1)}%` : '0%'} accent /></div>
                    </div>
                    <div className="mt-5 flex items-start justify-between gap-3"><span className={shell('min-w-0 rounded-2xl px-3 py-2 text-left text-xs font-medium sm:text-sm', stockParts.isOutOfStock ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700')}><span className="block break-words leading-4">Остаток: {stockParts.primary}</span>{stockParts.secondary ? <span className="mt-1 block break-words text-[11px] leading-4 opacity-90">{stockParts.secondary}</span> : null}</span><div className="min-w-0 text-right"><p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Прибыль</p><p className={shell('mt-1 break-words text-sm font-semibold leading-5', commerce.profitPerUnit >= 0 ? 'text-emerald-700' : 'text-rose-600')}>{formatMoney(commerce.profitPerUnit)}</p></div></div>
                    <button onClick={(event) => { event.stopPropagation(); handleAddToSale(product); }} disabled={product.stock <= 0 || !selectedWarehouseId} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-4 py-3.5 text-sm font-medium text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"><ShoppingCart size={16} /><span>В продажу</span></button>
                  </div>
                </motion.div>;
              })}
              {!filteredProducts.length && <div className="col-span-full flex flex-col items-center justify-center rounded-[28px] border border-white bg-white px-6 py-20 text-center shadow-sm"><div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#f4f5fb] text-slate-300"><Package size={28} /></div><p className="text-base text-slate-500">Товары не найдены</p></div>}
            </section>
          )}

          <PaginationControls currentPage={currentPage} totalPages={totalPages} totalItems={filteredProducts.length} pageSize={pageSize} onPageChange={setCurrentPage} />
        </div>
      </div>

      <AnimatePresence>{cartNotice && <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="fixed bottom-4 left-4 right-4 z-50 rounded-3xl border border-emerald-100 bg-white p-4 shadow-2xl sm:left-auto sm:w-[min(92vw,420px)] sm:p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-sm font-medium text-slate-900">{cartNotice.count > 0 ? 'Товар добавлен' : 'Нужно выбрать склад'}</p><p className="mt-1 break-words text-sm leading-6 text-slate-500">{cartNotice.productName}</p>{cartNotice.count > 0 && <p className="mt-2 text-xs text-slate-400">В корзине: {cartNotice.count}</p>}</div><button onClick={() => setCartNotice(null)} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"><X size={16} /></button></div><div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"><button onClick={() => setCartNotice(null)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 transition-colors hover:bg-slate-50">Остаться</button>{cartNotice.count > 0 ? <button onClick={() => { setCartNotice(null); navigate('/pos'); }} className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm text-white transition-colors hover:bg-emerald-600">Перейти в корзину</button> : <button onClick={() => setCartNotice(null)} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white transition-colors hover:bg-slate-800">Понятно</button>}</div></motion.div>}</AnimatePresence>

      <AnimatePresence>{showDetails && selectedProduct && (() => { const stockParts = getProductStockParts(selectedProduct); const commerce = getProductCommercialStats(selectedProduct); const desktopActionsVisible = typeof window !== 'undefined' ? window.innerWidth >= 1024 : true; return <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 lg:p-6"><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDetails(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" /><motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} className="relative flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl"><div className="grid max-h-[94vh] overflow-y-auto lg:grid-cols-[1.05fr_0.95fr]"><div className="flex items-center justify-center bg-slate-50 p-4 sm:p-5 lg:p-6"><div className="flex w-full items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">{selectedProduct.photoUrl ? <img src={resolveMediaUrl(selectedProduct.photoUrl, selectedProduct.id)} alt={selectedProduct.name} className="max-h-75 max-w-full rounded-2xl object-contain sm:max-h-95 lg:max-h-150" referrerPolicy="no-referrer" onError={(event) => handleBrokenImage(event, selectedProduct.id)} /> : <div className="flex h-70 w-full items-center justify-center rounded-2xl bg-slate-100 text-slate-300 sm:h-85 lg:h-150"><Package size={72} /></div>}</div></div><div className="flex flex-col p-4 sm:p-5 lg:p-8"><div className="flex items-start justify-between gap-4"><span className="max-w-[70%] break-words rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 sm:px-4 sm:py-2">{selectedProduct.category?.name || 'Без категории'}</span><button onClick={() => setShowDetails(false)} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"><X size={18} /></button></div><h2 className="mt-4 break-words text-xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-2xl lg:mt-6 lg:text-4xl">{formatProductName(selectedProduct.name)}</h2><div className="mt-5 grid gap-3 sm:mt-6 lg:mt-8 lg:gap-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Продажа" value={shouldShowPrice(selectedProduct) ? formatMoney(commerce.salePrice) : 'Цена скрыта'} /><MetricCard label="Закупка" value={formatMoney(commerce.purchasePrice)} /><MetricCard label="Прибыль" value={formatMoney(commerce.profitPerUnit)} /><MetricCard label="Рентабельность" value={`${commerce.marginPercent.toFixed(1)}%`} accent /></div><div className="grid gap-3 sm:grid-cols-2 lg:gap-4"><div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4"><div className="flex items-center gap-3"><div className="rounded-2xl bg-white p-3 text-slate-500 shadow-sm"><Layers size={18} /></div><div className="min-w-0"><p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Остаток</p><div className={shell('mt-1 inline-flex rounded-2xl px-3 py-2', stockParts.isOutOfStock ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700')}><div className="flex min-w-0 flex-col"><span className="break-words text-lg font-semibold tracking-tight sm:text-xl lg:text-2xl">{stockParts.primary}</span>{stockParts.secondary ? <span className="mt-1 break-words text-xs font-medium sm:text-sm opacity-90">{stockParts.secondary}</span> : null}</div></div></div></div></div><div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4"><div className="flex items-center gap-3"><div className="rounded-2xl bg-white p-3 text-slate-500 shadow-sm"><Warehouse size={18} /></div><div className="min-w-0"><p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Склад</p><p className="mt-1 break-words text-sm text-slate-900 sm:text-base lg:text-lg">{selectedProduct.warehouse?.name || 'Основной склад'}</p></div></div></div></div></div><div className="mt-6 lg:mt-auto"><button type="button" onClick={() => setMobileActionsOpen((prev) => !prev)} className="inline-flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 lg:hidden"><span>{mobileActionsOpen ? 'Скрыть действия' : 'Открыть действия'}</span><ChevronRight size={18} className={shell('transition-transform duration-200', mobileActionsOpen ? 'rotate-90' : '')} /></button><AnimatePresence initial={false}>{(mobileActionsOpen || desktopActionsVisible) && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden"><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1"><button onClick={() => { handleAddToSale(selectedProduct); if (selectedWarehouseId) { setShowDetails(false); setMobileActionsOpen(false); } }} disabled={selectedProduct.stock <= 0 || !selectedWarehouseId} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 sm:text-base"><ShoppingCart size={18} /><span>В продажу</span><ChevronRight size={18} /></button><button onClick={() => { if (window.innerWidth < 1024) { setMobileActionsOpen(false); return; } setShowDetails(false); }} className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">{window.innerWidth < 1024 ? 'Свернуть' : 'Закрыть'}</button></div></motion.div>}</AnimatePresence></div></div></div></motion.div></div>; })()}</AnimatePresence>
    </div>
  );
}
