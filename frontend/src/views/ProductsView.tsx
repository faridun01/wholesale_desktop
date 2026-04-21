import React, { useEffect, useState, useMemo, useRef, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import client from '../api/client';
import * as ProductsApi from '../api/products.api';
import {
  Plus,
  Search,
  Package,
  ArrowRightLeft,
  Edit,
  Trash2,
  Loader2,
  Scissors,
  X,
  History,
  Layers,
  Store,
  RefreshCw,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { 
  formatMoney, 
  roundMoney, 
} from '../utils/format';
import { getProductBatches } from '../api/products.api';
import { getWarehouses } from '../api/warehouses.api';
import { createSettingsCategory, getSettingsCategories } from '../api/settings-reference.api';
import { filterWarehousesForUser, getCurrentUser, getUserWarehouseId, isAdminUser } from '../utils/userAccess';
import { formatProductName } from '../utils/productName';
import { getDefaultWarehouseId } from '../utils/warehouse';
import ConfirmationModal from '../components/common/ConfirmationModal';
import PaginationControls from '../components/common/PaginationControls';

// Lazy load modals to keep the bundle clean and avoid circular potential issues
const ProductHistoryModal = lazy(() => import('../components/products/ProductHistoryModal'));
const ProductBatchesModal = lazy(() => import('../components/products/ProductBatchesModal'));

// --- Helper Functions ---

const normalizeBaseUnit = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'шт';
  if (['шт', 'штук', 'штука', 'штуки', 'pcs'].includes(normalized)) return 'шт';
  return normalized;
};

const normalizePackageName = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (['мешок', 'баг', 'bag'].includes(normalized)) return 'мешок';
  if (['коробка', 'box'].includes(normalized)) return 'коробка';
  if (['упаковка', 'pack'].includes(normalized)) return 'упаковка';
  return normalized;
};

const formatPriceInput = (value: unknown): string => {
  if (value === '' || value === null || value === undefined) return '';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : '';
};

// --- Component Definition ---

export default function ProductsView() {
  const pageSize = 15;
  const user = useMemo(() => getCurrentUser(), []);
  const isAdmin = isAdminUser(user);
  const userWarehouseId = getUserWarehouseId(user);

  // Refs
  const latestRequestRef = useRef(0);
  const hasLoadedRef = useRef(false);

  // State
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(isAdmin ? '' : (getUserWarehouseId(user) ? String(getUserWarehouseId(user)) : ''));
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name'); // New sort state
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc'); // New sort order
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  // Modals visibility
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showWriteOffModal, setShowWriteOffModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showBatchesModal, setShowBatchesModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Modal Data
  const [productHistory, setProductHistory] = useState<any[]>([]);
  const [productBatches, setProductBatches] = useState<any[]>([]);
  const [categoryInput, setCategoryInput] = useState('');
  const [formData, setFormData] = useState<any>({
    name: '',
    unit: 'шт',
    categoryId: '',
    costPrice: '',
    sellingPrice: '',
    warehouseId: '',
  });

  const [restockData, setRestockData] = useState({ quantity: '', costPrice: '', reason: '' });
  const [transferData, setTransferData] = useState({ toWarehouseId: '', quantity: '' });
  const [writeOffData, setWriteOffData] = useState({ quantity: '', reason: '' });

  // --- Data Fetching ---

  const fetchProducts = async (warehouseId?: string) => {
    const rid = ++latestRequestRef.current;
    setIsLoading(true);
    try {
      const data = await ProductsApi.getProducts(warehouseId ? Number(warehouseId) : undefined);
      if (rid === latestRequestRef.current) {
        setProducts(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      if (rid === latestRequestRef.current) toast.error('Ошибка загрузки товаров');
    } finally {
      if (rid === latestRequestRef.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F7') {
        e.preventDefault();
        (document.querySelector('input[placeholder*="Поиск"]') as HTMLInputElement)?.focus();
      }
      if (e.key === 'F2' && isAdmin) {
        e.preventDefault();
        setFormData({ name: '', unit: 'шт', categoryId: '', costPrice: '', sellingPrice: '' }); 
        setCategoryInput(''); 
        setShowAddModal(true);
      }
      if (e.key === 'F3' && selectedProduct) {
        e.preventDefault();
        setFormData({ 
          name: selectedProduct.name, 
          unit: selectedProduct.unit, 
          categoryId: selectedProduct.categoryId,
          costPrice: selectedProduct.costPrice,
          sellingPrice: selectedProduct.sellingPrice
        });
        setShowEditModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedProduct, isAdmin]);

  const fetchReferenceData = async () => {
    try {
      const [w, c] = await Promise.all([getWarehouses(), getSettingsCategories()]);
      const filteredW = filterWarehousesForUser(Array.isArray(w) ? w : [], user);
      setWarehouses(filteredW);
      setCategories(Array.isArray(c) ? c : []);
      
      const defW = getDefaultWarehouseId(filteredW);
      if (defW && !selectedWarehouseId) setSelectedWarehouseId(String(defW));
    } catch (err) {
      toast.error('Ошибка справочников');
    }
  };

  useEffect(() => {
    fetchReferenceData();
  }, []);

  useEffect(() => {
    fetchProducts(selectedWarehouseId);

    const handleRefresh = () => fetchProducts(selectedWarehouseId, true);
    window.addEventListener('refresh-data', handleRefresh);
    return () => window.removeEventListener('refresh-data', handleRefresh);
  }, [selectedWarehouseId]);

  // --- Handlers ---

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let cId = formData.categoryId;
      if (!cId && categoryInput) {
        const nc = await createSettingsCategory(categoryInput);
        cId = nc.id;
      }
      const defaultWarehouseId = getDefaultWarehouseId(warehouses) || warehouses[0]?.id;
      await ProductsApi.createProduct({ 
        ...formData, 
        categoryId: Number(cId), 
        warehouseId: Number(selectedWarehouseId || defaultWarehouseId) 
      });
      toast.success('Товар создан');
      window.dispatchEvent(new CustomEvent('refresh-data'));
      setShowAddModal(false);
      fetchProducts(selectedWarehouseId);
    } catch (err) {
      toast.error('Ошибка создания');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    try {
      await ProductsApi.updateProduct(selectedProduct.id, { ...formData, categoryId: Number(formData.categoryId) });
      toast.success('Обновлено');
      window.dispatchEvent(new CustomEvent('refresh-data'));
      setShowEditModal(false);
      fetchProducts(selectedWarehouseId);
    } catch (err) {
      toast.error('Ошибка обновления');
    }
  };

  const handleDelete = async () => {
    if (!selectedProduct) return;
    try {
      await ProductsApi.deleteProduct(selectedProduct.id, { force: true });
      toast.success('Удалено');
      window.dispatchEvent(new CustomEvent('refresh-data'));
      setShowDeleteConfirm(false);
      setSelectedProduct(null);
      fetchProducts(selectedWarehouseId);
    } catch (err) {
      toast.error('Ошибка удаления');
    }
  };

  const handleRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    try {
      await ProductsApi.restockProduct(selectedProduct.id, {
        ...restockData,
        warehouseId: Number(selectedWarehouseId),
        quantity: Number(restockData.quantity),
        costPrice: Number(restockData.costPrice),
      });
      toast.success('Приход оформлен');
      window.dispatchEvent(new CustomEvent('refresh-data'));
      setShowRestockModal(false);
      fetchProducts(selectedWarehouseId);
    } catch (err) {
      toast.error('Ошибка прихода');
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    try {
      await client.post(`/products/${selectedProduct.id}/transfer`, {
        fromWarehouseId: Number(selectedWarehouseId),
        toWarehouseId: Number(transferData.toWarehouseId),
        quantity: Number(transferData.quantity),
      });
      toast.success('Перемещено');
      window.dispatchEvent(new CustomEvent('refresh-data'));
      setShowTransferModal(false);
      fetchProducts(selectedWarehouseId);
    } catch (err) {
      toast.error('Ошибка перемещения');
    }
  };

  const handleWriteOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    try {
      await ProductsApi.writeOffProduct(selectedProduct.id, {
        quantity: Number(writeOffData.quantity),
        reason: writeOffData.reason
      });
      toast.success('Списание оформлено');
      window.dispatchEvent(new CustomEvent('refresh-data'));
      setShowWriteOffModal(false);
      fetchProducts(selectedWarehouseId);
    } catch (err) {
      toast.error('Ошибка при списании');
    }
  };

  const getMergeCandidates = (current: any) => {
    return products.filter(p => p.id !== current.id && p.name.split(' ')[0] === current.name.split(' ')[0]);
  };

  const handleReverseIncoming = async (id: number) => {
    try {
      await client.post(`/inventory/incoming/${id}/reverse`);
      toast.success('Приход отменен');
      window.dispatchEvent(new CustomEvent('refresh-data'));
      if (selectedProduct) {
        const h = await ProductsApi.getProductHistory(selectedProduct.id);
        setProductHistory(h);
      }
      fetchProducts(selectedWarehouseId);
    } catch { toast.error('Ошибка отмены'); }
  };

  // --- Computed ---

  const filteredProducts = useMemo(() => {
    const s = search.toLowerCase();
    const filtered = products.filter(p => 
      (p.name.toLowerCase().includes(s) || String(p.id).includes(s)) &&
      (selectedCategoryId === 'all' || String(p.categoryId) === selectedCategoryId)
    );

    return [...filtered].sort((a, b) => {
      let valA: any = a[sortBy as keyof typeof a];
      let valB: any = b[sortBy as keyof typeof b];

      if (sortBy === 'name') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      
      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
  }, [products, search, selectedCategoryId, sortBy, sortOrder]);

  const paginatedProducts = useMemo(() => {
    return filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredProducts, currentPage]);

  const totalPages = Math.ceil(filteredProducts.length / pageSize) || 1;

  // --- Render ---

  return (
    <div className="flex flex-col h-full bg-white select-none">
      {/* 1C Taxi Toolbar */}
      <div className="toolbar-1c">
        {isAdmin && (
          <button 
            onClick={() => { setFormData({ name: '', unit: 'шт', categoryId: '', costPrice: '', sellingPrice: '' }); setCategoryInput(''); setShowAddModal(true); }} 
            className="btn-1c btn-1c-primary flex items-center gap-1.5"
          >
            <Plus size={14} className="stroke-[3]" /> Создать
          </button>
        )}
        <button 
          onClick={() => { 
            if (selectedProduct) {
              setFormData({ 
                name: selectedProduct.name, 
                unit: selectedProduct.unit, 
                categoryId: selectedProduct.categoryId,
                costPrice: selectedProduct.costPrice,
                sellingPrice: selectedProduct.sellingPrice
              });
              setShowEditModal(true); 
            }
          }} 
          disabled={!selectedProduct} 
          className="btn-1c flex items-center gap-1.5"
        >
          <Edit size={14} /> Изменить
        </button>
        <button 
          onClick={() => setShowDeleteConfirm(true)} 
          disabled={!selectedProduct} 
          className="btn-1c flex items-center gap-1.5 text-rose-600 border-rose-100 hover:bg-rose-50"
        >
          <Trash2 size={14} /> Удалить
        </button>
        
        <div className="w-[1px] h-6 bg-slate-200 mx-1"></div>
        
        <button 
          onClick={() => { setRestockData({ quantity: '', costPrice: String(selectedProduct?.costPrice || ''), reason: '' }); setShowRestockModal(true); }} 
          disabled={!selectedProduct} 
          className="btn-1c flex items-center gap-1.5"
        >
          <Plus size={14} /> Поступление
        </button>
        <button 
          onClick={() => setShowTransferModal(true)} 
          disabled={!selectedProduct || warehouses.length < 2} 
          className="btn-1c flex items-center gap-1.5"
        >
          <ArrowRightLeft size={14} /> Перемещение
        </button>
        
        <div className="w-[1px] h-6 bg-slate-200 mx-1"></div>

        <button 
          onClick={() => { setWriteOffData({ quantity: '', reason: '' }); setShowWriteOffModal(true); }} 
          disabled={!selectedProduct} 
          className="btn-1c flex items-center gap-1.5 text-orange-600"
        >
          <Scissors size={14} /> Списать
        </button>

        <button 
          onClick={async () => {
            if (!selectedProduct) return;
            const h = await ProductsApi.getProductHistory(selectedProduct.id);
            setProductHistory(h);
            setShowHistoryModal(true);
          }} 
          disabled={!selectedProduct} 
          className="btn-1c flex items-center gap-1.5"
        >
          <History size={14} /> История
        </button>
        <button 
          onClick={async () => {
            if (!selectedProduct) return;
            const b = await ProductsApi.getProductBatches(selectedProduct.id);
            setProductBatches(b);
            setShowBatchesModal(true);
          }} 
          disabled={!selectedProduct} 
          className="btn-1c flex items-center gap-1.5"
        >
          <Layers size={14} /> Партии
        </button>
      </div>

      {/* Second Row: Search, Category, Sorting */}
      <div className="bg-[#f2f3f7] p-2 flex flex-wrap items-center gap-4 border-b border-border-base">
        <div className="relative w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Поиск..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="field-1c w-full pl-8 py-1"
          />
        </div>

        <div className="h-6 w-[1px] bg-slate-300"></div>

        <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase text-slate-400">Группа:</span>
            <select 
                value={selectedCategoryId} 
                onChange={e => setSelectedCategoryId(e.target.value)}
                className="bg-white border border-slate-200 rounded px-2 py-1 text-[11px] font-bold outline-none focus:ring-1 focus:ring-brand-orange min-w-[120px]"
            >
                <option value="all">Все группы</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
        </div>

        <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase text-slate-400">Сортировка:</span>
            <select 
                value={sortBy} 
                onChange={e => setSortBy(e.target.value)}
                className="bg-white border border-slate-200 rounded px-2 py-1 text-[11px] font-bold outline-none focus:ring-1 focus:ring-brand-orange"
            >
                <option value="name">По имени</option>
                <option value="stock">По остатку</option>
                <option value="sellingPrice">По цене</option>
            </select>
            <button 
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="p-1 hover:bg-white rounded border border-slate-200 text-slate-600"
            >
              {sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            </button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] font-black uppercase text-slate-400">Склад:</span>
            <select 
              value={selectedWarehouseId} 
              onChange={e => setSelectedWarehouseId(e.target.value)}
              className="bg-white border border-slate-200 rounded px-2 py-1 text-[11px] font-bold outline-none focus:ring-1 focus:ring-brand-orange"
            >
              {isAdmin && <option value="">Все склады</option>}
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button onClick={() => fetchProducts(selectedWarehouseId)} className="p-1.5 hover:bg-white rounded border border-slate-200 text-slate-400 transition-colors">
              <RefreshCw size={14} />
            </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="flex-1 overflow-auto bg-[#e6e8eb]">
        <table className="table-1c border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-12 text-center">№</th>
              <th>Наименование</th>
              <th className="w-24">Артикул</th>
              <th className="w-32 text-right">Остаток</th>
              <th className="w-20 text-center">Ед.</th>
              <th className="w-32 text-right">Цена закупа</th>
              <th className="w-32 text-right">Цена продажи</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-20 text-center bg-white">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 size={32} className="animate-spin text-brand-orange" />
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Загрузка...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedProducts.length > 0 ? (
              paginatedProducts.map((p, idx) => (
                <tr 
                  key={p.id} 
                  onClick={() => setSelectedProduct(p)}
                  onDoubleClick={() => { setSelectedProduct(p); setShowEditModal(true); }}
                  className={clsx(selectedProduct?.id === p.id && "selected")}
                >
                  <td className="text-center font-mono text-[11px] text-slate-400">{(currentPage-1)*pageSize + idx + 1}</td>
                  <td className="font-bold">{formatProductName(p.name)}</td>
                  <td className="text-[11px] font-mono text-slate-500 italic">#{p.id}</td>
                  <td className={clsx("text-right font-black", p.stock <= (p.minStock || 0) ? "text-rose-600" : "text-slate-800")}>
                    {p.stock}
                  </td>
                  <td className="text-center text-slate-500 uppercase text-[10px] font-black">{p.unit || 'шт'}</td>
                  <td className="text-right text-slate-500 italic">{formatMoney(p.costPrice)}</td>
                  <td className="text-right font-black text-slate-900">{formatMoney(p.sellingPrice)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="py-20 text-center bg-white">
                  <div className="flex flex-col items-center gap-2 text-slate-300">
                    <Package size={48} />
                    <span className="text-sm font-bold">Товары не найдены</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Info & Pagination */}
      <div className="bg-[#fcfcfc] border-t border-border-base p-2 px-4 flex items-center justify-between">
        <div className="flex items-center gap-6 text-[11px] font-black uppercase text-slate-400 tracking-widest">
          <span>Всего: {filteredProducts.length}</span>
          <span>На сумму: {formatMoney(filteredProducts.reduce((acc, p) => acc + (p.stock * p.sellingPrice), 0))}</span>
        </div>
        <PaginationControls 
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredProducts.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* --- Modals --- */}
      <AnimatePresence>
        {(showAddModal || showEditModal) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border-2 border-brand-orange shadow-2xl rounded w-full max-w-2xl overflow-hidden"
            >
              <div className="bg-brand-yellow px-4 py-2 flex items-center justify-between border-b border-black/10">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-800">
                  {showEditModal ? 'Карточка товара: Редактирование' : 'Карточка товара: Создание'}
                </span>
                <button onClick={() => { setShowAddModal(false); setShowEditModal(false); }} className="hover:text-rose-600"><X size={18} /></button>
              </div>
              <form onSubmit={showEditModal ? handleUpdate : handleCreate} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Наименование</label>
                    <input autoFocus type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="field-1c w-full" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Категория</label>
                    <input list="cats" value={categoryInput} onChange={e => { setCategoryInput(e.target.value); const found = categories.find(c => c.name === e.target.value); if (found) setFormData({ ...formData, categoryId: found.id }); }} className="field-1c w-full" />
                    <datalist id="cats">{categories.map(c => <option key={c.id} value={c.name} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Ед. изм.</label>
                    <select value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value })} className="field-1c w-full">
                      <option value="шт">Штука (шт)</option>
                      <option value="кг">Килограмм (кг)</option>
                      <option value="л">Литр (л)</option>
                    </select>
                  </div>
                  {isAdmin && (
                    <>
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Себестоимость</label>
                        <input type="number" step="0.01" value={formData.costPrice} onChange={e => setFormData({ ...formData, costPrice: e.target.value })} className="field-1c w-full" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Цена продажи</label>
                        <input type="number" step="0.01" value={formData.sellingPrice} onChange={e => setFormData({ ...formData, sellingPrice: e.target.value })} className="field-1c w-full" />
                      </div>
                    </>
                  )}
                </div>
                <div className="pt-4 flex justify-end gap-2">
                   <button type="button" onClick={() => { setShowAddModal(false); setShowEditModal(false); }} className="btn-1c">Отмена</button>
                   <button type="submit" className="btn-1c btn-1c-primary">Записать и закрыть</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showRestockModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="bg-white border rounded shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="bg-brand-blue text-white px-4 py-2 flex justify-between uppercase text-[10px] font-black tracking-widest">
                <span>Оформление прихода</span>
                <button onClick={() => setShowRestockModal(false)}><X size={16}/></button>
              </div>
              <form onSubmit={handleRestock} className="p-4 space-y-4">
                <p className="text-xs font-bold">Товар: {selectedProduct?.name}</p>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Количество</label>
                  <input autoFocus required type="number" value={restockData.quantity} onChange={e => setRestockData({ ...restockData, quantity: e.target.value })} className="field-1c w-full" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Цена закупа (нового)</label>
                  <input required type="number" value={restockData.costPrice} onChange={e => setRestockData({ ...restockData, costPrice: e.target.value })} className="field-1c w-full" />
                </div>
                <button type="submit" className="btn-1c btn-1c-primary w-full py-2">Выполнить приход</button>
              </form>
            </motion.div>
          </div>
        )}

        {showTransferModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="bg-white border rounded shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="bg-brand-blue text-white px-4 py-2 flex items-center justify-between uppercase text-[10px] font-black tracking-widest">
                <span>Перемещение товара</span>
                <button onClick={() => setShowTransferModal(false)}><X size={16}/></button>
              </div>
              <form onSubmit={handleTransfer} className="p-4 space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Куда (Склад)</label>
                  <select required value={transferData.toWarehouseId} onChange={e => setTransferData({ ...transferData, toWarehouseId: e.target.value })} className="field-1c w-full font-bold">
                    <option value="">Выберите склад...</option>
                    {warehouses.filter(w => String(w.id) !== selectedWarehouseId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Количество</label>
                  <input autoFocus required type="number" value={transferData.quantity} onChange={e => setTransferData({ ...transferData, quantity: e.target.value })} className="field-1c w-full" />
                </div>
                <button type="submit" className="btn-1c btn-1c-primary w-full py-2">Выполнить перемещение</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Suspense fallback={null}>
        {showHistoryModal && (
          <ProductHistoryModal 
            isOpen={showHistoryModal} 
            onClose={() => setShowHistoryModal(false)} 
            productName={selectedProduct?.name}
            product={selectedProduct}
            productHistory={productHistory}
            onReverseIncoming={handleReverseIncoming}
          />
        )}
        {showBatchesModal && (
          <ProductBatchesModal 
            isOpen={showBatchesModal} 
            onClose={() => setShowBatchesModal(false)} 
            selectedProduct={selectedProduct}
            productBatches={productBatches}
          />
        )}
        {showWriteOffModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white border-2 border-brand-orange shadow-2xl rounded w-full max-w-sm overflow-hidden">
               <div className="bg-brand-orange text-white px-4 py-2 flex items-center justify-between border-b border-black/10">
                 <div className="flex items-center gap-2">
                    <Scissors size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">Списание со склада</span>
                 </div>
                 <button onClick={() => setShowWriteOffModal(false)}><X size={18} /></button>
               </div>
               <form onSubmit={handleWriteOff} className="p-6 space-y-4">
                 <div className="bg-slate-50 p-3 rounded border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">Товар</p>
                    <p className="text-xs font-black text-slate-800">{selectedProduct?.name}</p>
                 </div>

                 <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Количество для списания</label>
                    <div className="flex items-center gap-2">
                       <input 
                         required 
                         type="number" 
                         value={writeOffData.quantity} 
                         onChange={e => setWriteOffData({ ...writeOffData, quantity: e.target.value })} 
                         className="field-1c w-full text-center text-lg font-black" 
                         placeholder="0"
                       />
                       <span className="text-xs font-bold text-slate-400 uppercase">{selectedProduct?.unit}</span>
                    </div>
                 </div>

                 <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Причина списания</label>
                    <textarea 
                      required
                      value={writeOffData.reason}
                      onChange={e => setWriteOffData({ ...writeOffData, reason: e.target.value })}
                      className="field-1c w-full min-h-[80px] text-xs font-bold"
                      placeholder="Например: Брак, Просрочено, Порча..."
                    />
                 </div>

                 <button 
                   type="submit"
                   className="w-full bg-brand-orange text-white font-black py-3 rounded shadow-lg hover:bg-[#ff8c00] active:scale-95 transition-all text-xs uppercase tracking-widest"
                 >
                   ПОДТВЕРДИТЬ СПИСАНИЕ
                 </button>
               </form>
            </motion.div>
          </div>
        )}
      </Suspense>

      <ConfirmationModal 
        isOpen={showDeleteConfirm} 
        title="Удаление объекта"
        message={`Вы уверены, что хотите окончательно удалить товар "${selectedProduct?.name}" из базы?`}
        onConfirm={handleDelete}
        onClose={() => setShowDeleteConfirm(false)}
        confirmText="Да, удалить"
        cancelText="Отмена"
      />
    </div>
  );
}
