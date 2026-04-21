import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { 
  ChevronRight, 
  Filter, 
  Layers, 
  Package, 
  Plus, 
  Search, 
  ShoppingCart, 
  Tag, 
  Warehouse, 
  X,
  Eye,
  ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getProducts } from '../api/products.api';
import { getPublicSettings } from '../api/settings-reference.api';
import { getWarehouses } from '../api/warehouses.api';
import PaginationControls from '../components/common/PaginationControls';
import { formatMoney } from '../utils/format';
import { handleBrokenImage, resolveMediaUrl } from '../utils/media';
import { formatProductName } from '../utils/productName';
import { filterWarehousesForUser, getCurrentUser, getUserWarehouseId, isAdminUser } from '../utils/userAccess';
import { clsx } from 'clsx';

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
  const out = stock <= 0;

  if (!defaultPackaging || Number(defaultPackaging.unitsPerPackage || 0) <= 1) 
    return { primary: `${stock} ${baseUnitName}`, secondary: '', isOutOfStock: out };

  const unitsPerPackage = Number(defaultPackaging.unitsPerPackage || 0);
  const packageQuantity = Math.floor(stock / unitsPerPackage);
  const extraUnits = stock % unitsPerPackage;

  if (out) return { primary: 'Нет', secondary: '', isOutOfStock: true };
  if (packageQuantity > 0 && extraUnits > 0) 
    return { primary: `${packageQuantity} ${defaultPackaging.packageName}`, secondary: `+ ${extraUnits} ${baseUnitName}`, isOutOfStock: false };
  if (packageQuantity > 0) 
    return { primary: `${packageQuantity} ${defaultPackaging.packageName}`, secondary: '', isOutOfStock: false };
    
  return { primary: `${extraUnits} ${baseUnitName}`, secondary: '', isOutOfStock: false };
};

export default function CatalogView() {
  const pageSize = 12;
  const navigate = useNavigate();
  const user = useMemo(() => getCurrentUser(), []);
  const isAdmin = isAdminUser(user);
  
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [search, setSearch] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(() => getStoredWarehouseId() || (getUserWarehouseId(user) ? String(getUserWarehouseId(user)) : ''));
  const [selectedCategory, setSelectedCategory] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [cartNotice, setCartNotice] = useState<{ productName: string; count: number } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    getProducts(selectedWarehouseId ? Number(selectedWarehouseId) : undefined)
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [selectedWarehouseId]);

  useEffect(() => {
    Promise.all([getWarehouses(), getPublicSettings()])
      .then(([warehousesData, settingsData]) => {
        const filtered = filterWarehousesForUser(Array.isArray(warehousesData) ? warehousesData : [], user);
        setWarehouses(filtered);
        if (!isAdmin && filtered[0] && !selectedWarehouseId) setSelectedWarehouseId(String(filtered[0].id));
        setSettings(settingsData || {});
      });
  }, [isAdmin, user]);

  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category?.name).filter(Boolean))), [products]);
  
  const filteredProducts = products.filter((p) => {
    const matchesSearch = String(p.name || '').toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !selectedCategory || (p.category?.name || '') === selectedCategory;
    const matchesStock = stockFilter === 'all' || (stockFilter === 'in_stock' && p.stock > 0) || (stockFilter === 'out_of_stock' && p.stock <= 0);
    return matchesSearch && matchesCategory && matchesStock;
  });

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleAddToSale = (product: any) => {
    if (!selectedWarehouseId) return;
    const currentCart = JSON.parse(sessionStorage.getItem('pending_cart') || '[]');
    const existing = currentCart.find((item: any) => item.id === product.id);
    const newCart = existing
      ? currentCart.map((item: any) => (item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))
      : [...currentCart, { ...product, quantity: 1 }];
    
    const storageKeys = ['pending_cart', 'pos_cart_session'];
    storageKeys.forEach(k => {
        sessionStorage.setItem(k, JSON.stringify(newCart));
        localStorage.setItem(k, JSON.stringify(newCart));
    });
    sessionStorage.setItem('pos_warehouse_session', selectedWarehouseId);
    localStorage.setItem('pos_warehouse_session', selectedWarehouseId);

    setCartNotice({ productName: formatProductName(product.name), count: (existing?.quantity || 0) + 1 });
    setTimeout(() => setCartNotice(null), 3000);
  };

  return (
    <div className="flex flex-col h-full bg-[#f0f1f4]">
      {/* 1C Header Section */}
      <div className="bg-white border-b border-border-base p-4 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Каталог товаров</h1>
            <p className="text-[10px] font-black uppercase text-slate-400 mt-1">Витрина и быстрый подбор продукции</p>
          </div>
          {isAdmin && (
            <button 
              onClick={() => navigate('/products')}
              className="btn-1c !bg-brand-yellow !border-brand-orange/30 hover:!bg-brand-orange flex items-center gap-2"
            >
              <Plus size={14} /> Новый товар
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#f8f9fb] border-b border-border-base px-4 py-3 shrink-0 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Поиск по наименованию..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="field-1c w-full pl-9"
          />
        </div>
        
        <div className="flex items-center gap-2 bg-white border border-border-base rounded px-2 py-1">
          <Warehouse size={14} className="text-slate-400" />
          <select 
            value={selectedWarehouseId} 
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            disabled={!isAdmin}
            className="bg-transparent text-[11px] font-bold outline-none"
          >
            <option value="">Все склады</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 bg-white border border-border-base rounded px-2 py-1">
          <Filter size={14} className="text-slate-400" />
          <select 
            value={selectedCategory} 
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-transparent text-[11px] font-bold outline-none"
          >
            <option value="">Все категории</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex bg-white border border-border-base rounded p-1">
          {[
            { id: 'all', label: 'Все' },
            { id: 'in_stock', label: 'В наличии' },
            { id: 'out_of_stock', label: 'Нет' }
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setStockFilter(opt.id as any)}
              className={clsx(
                "px-3 py-1 text-[10px] font-black uppercase rounded transition-all",
                stockFilter === opt.id ? "bg-brand-yellow text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
                {[...Array(12)].map((_, i) => <div key={i} className="h-64 bg-white/50 animate-pulse rounded border border-border-base" />)}
            </div>
        ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
                {paginatedProducts.map((p) => {
                    const stock = getProductStockParts(p);
                    return (
                        <div 
                          key={p.id}
                          className="bg-white border border-border-base rounded-[4px] flex flex-col group hover:shadow-lg transition-all relative overflow-hidden"
                        >
                            {/* Product Image Holder */}
                            <div className="aspect-square bg-slate-50 flex items-center justify-center p-4 border-b border-border-base relative overflow-hidden">
                                {p.photoUrl ? (
                                    <img 
                                      src={resolveMediaUrl(p.photoUrl, p.id)} 
                                      alt={p.name} 
                                      className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform"
                                      onError={(e) => handleBrokenImage(e, p.id)}
                                    />
                                ) : (
                                    <Package size={48} className="text-slate-200" strokeWidth={1} />
                                )}
                                <div className="absolute top-2 right-2 flex flex-col gap-1">
                                    <span className="bg-slate-800/80 text-white text-[9px] font-black uppercase px-2 py-1 rounded backdrop-blur">
                                        ID: {p.id}
                                    </span>
                                </div>
                            </div>

                            {/* Info */}
                            <div className="p-3 flex-1 flex flex-col">
                                <span className="text-[9px] font-black uppercase text-brand-orange mb-1 truncate">{p.category?.name || 'БЕЗ КАТЕГОРИИ'}</span>
                                <h3 className="text-xs font-black text-slate-800 leading-tight line-clamp-2 h-8">
                                    {formatProductName(p.name)}
                                </h3>
                                
                                <div className="mt-auto pt-3 flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black uppercase text-slate-400">В наличии</span>
                                            <span className={clsx("text-[11px] font-black", stock.isOutOfStock ? "text-rose-500" : "text-emerald-600")}>
                                              {stock.primary}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[8px] font-black uppercase text-slate-400">Цена</span>
                                            <div className="text-sm font-black text-slate-900">{formatMoney(p.sellingPrice)}</div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-1 mt-1">
                                        <button 
                                          onClick={() => { setSelectedProduct(p); setShowDetails(true); }}
                                          className="btn-1c flex items-center justify-center gap-1.5 !py-1"
                                        >
                                            <Eye size={12} /> <span className="text-[9px]">ОБЗОР</span>
                                        </button>
                                        <button 
                                          onClick={() => handleAddToSale(p)}
                                          disabled={p.stock <= 0 || !selectedWarehouseId}
                                          className="btn-1c !bg-brand-yellow !border-brand-orange/20 hover:!bg-brand-orange flex items-center justify-center gap-1.5 !py-1 disabled:grayscale disabled:opacity-30"
                                        >
                                            <ShoppingCart size={12} /> <span className="text-[9px]">В ЧЕК</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        )}

        {!loading && filteredProducts.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-32 opacity-30">
                <Package size={80} strokeWidth={1} />
                <span className="mt-4 font-black uppercase tracking-widest">Ничего не найдено</span>
            </div>
        )}

        <div className="mt-8">
           <PaginationControls currentPage={currentPage} totalPages={totalPages} totalItems={filteredProducts.length} pageSize={pageSize} onPageChange={setCurrentPage} />
        </div>
      </div>

      {/* Notifications */}
      <AnimatePresence>
        {cartNotice && (
          <motion.div 
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className="fixed bottom-6 right-6 z-[100] bg-brand-yellow border-2 border-brand-orange p-4 rounded shadow-2xl flex items-center gap-4 max-w-sm"
          >
             <div className="bg-white/40 p-2 rounded">
                <ShoppingCart size={20} className="text-brand-orange" />
             </div>
             <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase text-slate-700">Товар добавлен (x{cartNotice.count})</p>
                <p className="text-xs font-black text-slate-900 truncate">{cartNotice.productName}</p>
             </div>
             <button onClick={() => navigate('/pos')} className="bg-slate-900 text-white p-2 rounded hover:bg-slate-800 transition-colors">
                <ArrowRight size={16} />
             </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Details Modal */}
      <AnimatePresence>
        {showDetails && selectedProduct && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }}
                  onClick={() => setShowDetails(false)}
                  className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                />
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="relative bg-white w-full max-w-4xl rounded-[4px] shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]"
                >
                    <div className="md:w-1/2 bg-slate-50 p-8 flex items-center justify-center border-b md:border-b-0 md:border-r border-border-base">
                        {selectedProduct.photoUrl ? (
                            <img 
                              src={resolveMediaUrl(selectedProduct.photoUrl, selectedProduct.id)} 
                              alt={selectedProduct.name}
                              className="max-h-[50vh] object-contain"
                              onError={(e) => handleBrokenImage(e, selectedProduct.id)}
                            />
                        ) : (
                            <Package size={120} className="text-slate-100" />
                        )}
                    </div>
                    <div className="md:w-1/2 p-6 flex flex-col">
                        <div className="flex items-start justify-between">
                            <div>
                                <span className="text-[10px] font-black uppercase text-brand-orange">{selectedProduct.category?.name || 'БЕЗ КАТЕГОРИИ'}</span>
                                <h2 className="text-xl font-black text-slate-900 mt-1">{formatProductName(selectedProduct.name)}</h2>
                            </div>
                            <button onClick={() => setShowDetails(false)} className="text-slate-300 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-8">
                            <div className="p-3 bg-slate-50 border border-border-base rounded">
                                <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">Розничная цена</span>
                                <span className="text-2xl font-black text-slate-900">{formatMoney(selectedProduct.sellingPrice)}</span>
                            </div>
                            <div className="p-3 bg-slate-50 border border-border-base rounded">
                                <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">В наличии</span>
                                <span className="text-2xl font-black text-emerald-600">{getProductStockParts(selectedProduct).primary}</span>
                            </div>
                        </div>

                        <div className="mt-8 space-y-4 flex-1">
                            <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                                <span className="text-slate-400 font-bold uppercase text-[10px]">Единица измерения</span>
                                <span className="font-black text-slate-800 uppercase">{selectedProduct.unit}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                                <span className="text-slate-400 font-bold uppercase text-[10px]">Код товара (ID)</span>
                                <span className="font-black text-slate-800"># {selectedProduct.id}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                                <span className="text-slate-400 font-bold uppercase text-[10px]">Склад</span>
                                <span className="font-black text-slate-800 uppercase italic">{selectedProduct.warehouse?.name || 'Основной склад'}</span>
                            </div>
                        </div>

                        <div className="mt-8 grid grid-cols-1 gap-2">
                             <button 
                               onClick={() => { handleAddToSale(selectedProduct); setShowDetails(false); }}
                               disabled={selectedProduct.stock <= 0 || !selectedWarehouseId}
                               className="w-full bg-brand-yellow border-2 border-brand-orange py-4 rounded font-black text-slate-900 uppercase tracking-widest hover:bg-brand-orange transition-all disabled:grayscale disabled:opacity-50"
                             >
                                Добавить в чек
                             </button>
                             <button 
                               onClick={() => setShowDetails(false)}
                               className="w-full py-3 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600"
                             >
                                Закрыть окно
                             </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>
    </div>
  );
}
