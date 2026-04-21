import React, { startTransition, useDeferredValue, useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Banknote,
  ChevronRight,
  Package,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Trash2,
  User,
  Warehouse,
  X,
  CreditCard,
  RefreshCw,
  Printer,
  Minus,
  AlertCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { getProducts } from '../api/products.api';
import { createInvoice } from '../api/invoices.api';
import { getCustomers } from '../api/customers.api';
import { getWarehouses } from '../api/warehouses.api';
import ConfirmationModal from '../components/common/ConfirmationModal';
import { filterWarehousesForUser, getCurrentUser, getUserWarehouseId, isAdminUser } from '../utils/userAccess';
import { formatMoney, roundMoney, ceilMoney, toFixedNumber } from '../utils/format';
import { formatProductName } from '../utils/productName';
import { getDefaultWarehouseId } from '../utils/warehouse';
import client from '../api/client';

type PaymentMethod = 'cash' | 'card' | 'transfer' | 'debt';
type PackagingOption = {
  id: number;
  packageName: string;
  baseUnitName: string;
  unitsPerPackage: number;
  isDefault?: boolean;
};

const getStoredWarehouseId = () => {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('pos_warehouse_session') || localStorage.getItem('pos_warehouse_session') || '';
};

const normalizeDisplayBaseUnit = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'шт';
  const units = ['пачка', 'пачки', 'пачек', 'шт', 'штук', 'штука', 'штуки', 'pcs', 'piece', 'pieces'];
  return units.includes(normalized) ? 'шт' : normalized;
};

const normalizePackagings = (product: any): PackagingOption[] =>
  Array.isArray(product?.packagings)
    ? product.packagings
        .map((entry: any) => ({
          id: Number(entry.id),
          packageName: String(entry.packageName || '').trim(),
          baseUnitName: normalizeDisplayBaseUnit(String(entry.baseUnitName || product?.baseUnitName || product?.unit || 'шт')),
          unitsPerPackage: Number(entry.unitsPerPackage || 0),
          isDefault: Boolean(entry.isDefault),
        }))
        .filter((entry: PackagingOption) => entry.id > 0 && entry.packageName && entry.unitsPerPackage > 0)
    : [];

const getDefaultPackaging = (packagings: PackagingOption[]) =>
  packagings.find((entry) => entry.isDefault) || packagings[0] || null;

const clampDiscountPercent = (value: unknown) => {
  const numeric = Number(value);
  return !Number.isFinite(numeric) ? 0 : Math.min(100, Math.max(0, numeric));
};

type CartItem = {
  id: number;
  name: string;
  quantity: number;
  stock: number;
  unit: string;
  baseUnitName: string;
  sellingPrice: number;
  packagings: PackagingOption[];
  selectedPackagingId: number | null;
  packageQuantity: number;
  extraUnitQuantity: number;
  lineDiscountPercent: number;
  [key: string]: any;
};

export default function POSView() {
  const navigate = useNavigate();
  const user = useMemo(() => getCurrentUser(), []);
  const isAdmin = isAdminUser(user);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState(() => getStoredWarehouseId() || (getUserWarehouseId(user) ? String(getUserWarehouseId(user)) : ''));
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [discount, setDiscount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  const deferredProductSearch = useDeferredValue(productSearch);
  const deferredCustomerSearch = useDeferredValue(customerSearch);

  const productSearchRef = useRef<HTMLInputElement>(null);
  const customerSearchRef = useRef<HTMLInputElement>(null);

  // --- Persistence ---
  useEffect(() => {
    const savedCart = localStorage.getItem('pos_active_cart');
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (e) {
        console.error('Failed to load saved cart', e);
      }
    }
    const savedPaid = localStorage.getItem('pos_paid_amount');
    if (savedPaid) setPaidAmount(savedPaid);
    
    const savedCustId = localStorage.getItem('pos_customer_id');
    if (savedCustId) setCustomerId(Number(savedCustId));
    
    const savedCustName = localStorage.getItem('pos_customer_name');
    if (savedCustName) setCustomerSearch(savedCustName);
  }, []);

  useEffect(() => {
    localStorage.setItem('pos_active_cart', JSON.stringify(cart));
    localStorage.setItem('pos_paid_amount', paidAmount);
    localStorage.setItem('pos_customer_id', String(customerId || ''));
    localStorage.setItem('pos_customer_name', customerSearch);
  }, [cart, paidAmount, customerId, customerSearch]);

  const [deferredChecks, setDeferredChecks] = useState<any[]>(() => {
    const saved = localStorage.getItem('pos_deferred_checks');
    return saved ? JSON.parse(saved) : [];
  });

  const handleDeferCheck = () => {
    if (cart.length === 0) return;
    const newCheck = {
      id: Date.now(),
      cart,
      customerId,
      customerName: customerSearch,
      paidAmount,
      discount,
      timestamp: new Date().toISOString()
    };
    const updated = [...deferredChecks, newCheck];
    setDeferredChecks(updated);
    localStorage.setItem('pos_deferred_checks', JSON.stringify(updated));
    
    setCart([]);
    setPaidAmount('');
    setCustomerId(null);
    setCustomerSearch('');
    toast.success('Чек отложен');
  };

  const handleRestoreCheck = (check: any) => {
    setCart(check.cart);
    setCustomerId(check.customerId);
    setCustomerSearch(check.customerName);
    setPaidAmount(check.paidAmount);
    setDiscount(check.discount);
    
    const updated = deferredChecks.filter(c => c.id !== check.id);
    setDeferredChecks(updated);
    localStorage.setItem('pos_deferred_checks', JSON.stringify(updated));
    toast.success('Чек восстановлен');
  };

  // --- Hotkeys ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F7') {
        e.preventDefault();
        productSearchRef.current?.focus();
      }
      if (e.key === 'F8') {
        e.preventDefault();
        customerSearchRef.current?.focus();
      }
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleCheckout();
      }
      if (e.key === 'F2') {
        e.preventDefault();
        setCart([]);
        setPaidAmount('');
        setCustomerId(null);
        setCustomerSearch('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, customerId, paidAmount, discount, paymentMethod]);

  // --- Logic Helpers ---
  const getAvailableStock = (productId: number) => {
    return products.find(p => p.id === productId)?.stock || 0;
  };

  const normalizeCartItem = (item: CartItem, overrides: Partial<CartItem> = {}) => {
    const merged = { ...item, ...overrides };
    const packaging = merged.packagings.find(p => p.id === merged.selectedPackagingId) || null;
    const unitsPerPackage = packaging?.unitsPerPackage || 0;
    const stock = getAvailableStock(merged.id);
    
    let pq = Math.max(0, Math.floor(Number(merged.packageQuantity || 0)));
    let eq = Math.max(0, Number(merged.extraUnitQuantity || 0));
    
    let total = pq * unitsPerPackage + eq;
    if (total > stock) {
        if (unitsPerPackage > 0) {
            pq = Math.floor(stock / unitsPerPackage);
            eq = stock - (pq * unitsPerPackage);
        } else {
            pq = 0;
            eq = stock;
        }
        total = stock;
    }

    return {
      ...merged,
      stock,
      packageQuantity: pq,
      extraUnitQuantity: eq,
      quantity: total,
      lineDiscountPercent: clampDiscountPercent(merged.lineDiscountPercent || 0)
    };
  };

  const addToCart = (product: any) => {
    const existing = cart.find(item => item.id === product.id);
    if (product.stock <= 0) {
        toast.error('Товара нет в наличии');
        return;
    }

    if (existing) {
        const next = normalizeCartItem(existing, { extraUnitQuantity: existing.extraUnitQuantity + 1 });
        setCart(cart.map(item => item.id === product.id ? next : item));
    } else {
        const packagings = normalizePackagings(product);
        const defPack = getDefaultPackaging(packagings);
        const item: CartItem = {
            ...product,
            packagings,
            selectedPackagingId: defPack?.id || null,
            packageQuantity: 0,
            extraUnitQuantity: 1,
            lineDiscountPercent: 0,
            baseUnitName: product.baseUnitName || 'шт'
        };
        setCart([...cart, normalizeCartItem(item)]);
    }
  };

  const getLineTotal = (item: CartItem) => {
    const price = Number(item.sellingPrice || 0) * (1 - (item.lineDiscountPercent || 0) / 100);
    return roundMoney(item.quantity * price);
  };

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + getLineTotal(item), 0), [cart]);
  const total = useMemo(() => roundMoney(subtotal * (1 - discount / 100)), [subtotal, discount]);
  const balance = useMemo(() => (Number(paidAmount) || 0) - total, [paidAmount, total]);

  useEffect(() => {
    getCustomers().then(setCustomers);
    getWarehouses().then(data => {
        const filtered = filterWarehousesForUser(Array.isArray(data) ? data : [], user);
        setWarehouses(filtered);
    });
  }, []);

  useEffect(() => {
    if (!warehouseId) return;
    getProducts(Number(warehouseId)).then(setProducts);
  }, [warehouseId]);

  const filteredProducts = useMemo(() => {
    const s = deferredProductSearch.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(s) || String(p.id).includes(s));
  }, [products, deferredProductSearch]);

  const filteredCustomers = useMemo(() => {
    const s = deferredCustomerSearch.toLowerCase();
    return customers.filter(c => c.name.toLowerCase().includes(s));
  }, [customers, deferredCustomerSearch]);

  const handleCheckout = async () => {
    if (!customerId) return toast.error('Выберите клиента');
    if (cart.length === 0) return toast.error('Корзина пуста');
    
    setIsSubmitting(true);
    try {
        await createInvoice({
            customerId,
            warehouseId: Number(warehouseId),
            items: cart.map(item => ({
                productId: item.id,
                quantity: item.quantity,
                packagingId: item.selectedPackagingId,
                packageQuantity: item.packageQuantity,
                extraUnitQuantity: item.extraUnitQuantity,
                sellingPrice: item.sellingPrice,
                discount: item.lineDiscountPercent
            })),
            discount,
            paidAmount: Math.min(Number(paidAmount) || 0, total),
            paymentMethod: paymentMethod === 'debt' ? 'cash' : paymentMethod
        });
        toast.success('Продажа успешно завершена');
        setCart([]);
        setPaidAmount('');
        setCustomerId(null);
        setCustomerSearch('');
        localStorage.removeItem('pos_active_cart');
        navigate('/sales');
    } catch (err: any) {
        toast.error(err.response?.data?.error || 'Ошибка оформления');
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#e6e8eb] select-none overflow-hidden text-[#1e1e1e]">
      <div className="bg-brand-yellow px-4 py-2 flex items-center justify-between border-b border-black/10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-1 rounded">
            <ShoppingCart size={16} className="text-slate-800" />
          </div>
          <h1 className="text-xs font-black uppercase tracking-widest text-slate-800">Рабочее место кассира (РМК)</h1>
        </div>
        <div className="flex items-center gap-2">
           <div className="h-4 w-[1px] bg-black/10 mx-1"></div>
           <button onClick={() => navigate('/')} className="hover:bg-black/5 p-1 rounded transition-colors text-slate-700">
             <X size={18} />
           </button>
        </div>
      </div>

      <div className="toolbar-1c bg-white border-b border-border-base shrink-0 !py-1">
        <button onClick={() => { setCart([]); setPaidAmount(''); setCustomerId(null); setCustomerSearch(''); }} className="btn-1c flex items-center gap-1.5 !py-1">
          <RefreshCw size={14} /> Новый чек
        </button>
        <button onClick={handleDeferCheck} className="btn-1c flex items-center gap-1.5 !py-1" disabled={cart.length === 0}>
          <Printer size={14} /> Отложить чек
        </button>

        {deferredChecks.length > 0 && (
           <div className="flex items-center gap-1 ml-4 border-l pl-4 border-slate-200">
             <span className="text-[10px] font-black uppercase text-slate-400 mr-2">Отложенные:</span>
             {deferredChecks.map((check, i) => (
               <button 
                key={check.id}
                onClick={() => handleRestoreCheck(check)}
                className="bg-brand-orange/10 hover:bg-brand-orange/20 text-brand-orange text-[9px] font-black px-2 py-1 rounded transition-all border border-brand-orange/30"
               >
                 #{i + 1} {check.customerName || 'Без имени'}
               </button>
             ))}
           </div>
        )}

        <div className="flex-1"></div>
        <div className="flex items-center gap-2 px-2 py-0.5 bg-slate-50 border border-border-base rounded">
           <Warehouse size={12} className="text-slate-400" />
           <select 
             value={warehouseId} 
             onChange={e => setWarehouseId(e.target.value)}
             className="bg-transparent text-[9px] font-black uppercase text-slate-700 outline-none"
             disabled={!isAdmin}
           >
             {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
           </select>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col bg-white border-r border-border-base min-w-0">
          <div className="p-2 bg-[#f2f3f7] border-b border-border-base">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                ref={productSearchRef}
                type="text" 
                placeholder="Поиск товара (F7)..." 
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                className="field-1c w-full pl-8 py-1.5 font-bold text-xs"
                autoFocus
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="table-1c border-separate border-spacing-0">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="w-10 text-center">№</th>
                  <th>Товар</th>
                  <th className="w-20 text-center">Ед.</th>
                  <th className="w-24 text-right">Остаток</th>
                  <th className="w-28 text-right">Цена</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p, idx) => (
                  <tr 
                    key={p.id} 
                    onDoubleClick={() => addToCart(p)}
                    className="hover:bg-brand-yellow/5"
                  >
                    <td className="text-center font-mono text-[10px] text-slate-400">{idx + 1}</td>
                    <td className="font-bold py-1.5 text-[11px]">{p.name}</td>
                    <td className="text-center text-slate-500 uppercase text-[9px]">{p.unit}</td>
                    <td className="text-right font-mono font-bold text-slate-600 italic text-[10px]">{p.stock}</td>
                    <td className="text-right font-black text-slate-900 text-[11px]">{formatMoney(p.sellingPrice)}</td>
                    <td className="text-center">
                      <button onClick={() => addToCart(p)} className="text-brand-orange hover:text-brand-yellow p-1 transition-colors">
                        <Plus size={16} strokeWidth={3} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="w-96 flex flex-col bg-[#f0f1f4] shrink-0">
          <div className="p-3 bg-white border-b border-border-base relative">
             <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1">
                   <User size={12} /> Контрагент
                </label>
                {customerId && <span className="text-[8px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded uppercase">ОК</span>}
             </div>
             <div className="relative">
               <input 
                 ref={customerSearchRef}
                 type="text" 
                 placeholder="Выберите клиента (F8)..." 
                 value={customerSearch}
                 onChange={e => { setCustomerSearch(e.target.value); setIsCustomerDropdownOpen(true); }}
                 onFocus={() => setIsCustomerDropdownOpen(true)}
                 className="field-1c w-full py-1.5 font-bold text-[11px] !bg-slate-50"
               />
               {isCustomerDropdownOpen && (
                 <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border-2 border-brand-orange shadow-2xl rounded max-h-48 overflow-auto">
                    {filteredCustomers.map(c => (
                      <div 
                        key={c.id} 
                        onClick={() => { setCustomerId(c.id); setCustomerSearch(c.name); setIsCustomerDropdownOpen(false); }}
                        className="px-3 py-2 text-[11px] font-bold hover:bg-brand-yellow/10 cursor-pointer border-b border-slate-50 last:border-0"
                      >
                        {c.name}
                      </div>
                    ))}
                 </div>
               )}
             </div>
          </div>

          <div className="flex-1 overflow-auto p-3 space-y-1.5">
              {cart.map((item) => (
                <div key={item.id} className="bg-white border-l-4 border-l-brand-orange p-2 rounded shadow-sm border border-border-base relative">
                   <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-slate-900 truncate leading-tight mb-1">{item.name}</p>
                        <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 italic">
                          <span>{item.quantity} {item.unit}</span>
                          <span className="text-slate-200">|</span>
                          <span>{formatMoney(item.sellingPrice)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                         <div className="flex items-center bg-slate-50 border border-slate-200 rounded p-0.5 gap-1">
                            {item.selectedPackagingId && (
                               <input 
                                 type="number" 
                                 value={item.packageQuantity || ''}
                                 onChange={e => setCart(cart.map(c => c.id === item.id ? normalizeCartItem(c, { packageQuantity: Number(e.target.value) }) : c))}
                                 title="Упаковок"
                                 className="w-10 h-6 text-center font-black text-[11px] bg-brand-yellow/10 border-r border-slate-200 outline-none"
                               />
                            )}
                            <input 
                              type="number" 
                              value={item.extraUnitQuantity || ''}
                              onChange={e => setCart(cart.map(c => c.id === item.id ? normalizeCartItem(c, { extraUnitQuantity: Number(e.target.value) }) : c))}
                              title={item.selectedPackagingId ? 'Штук (доп)' : 'Количество'}
                              className="w-12 h-6 text-center font-black text-[11px] outline-none"
                            />
                         </div>

                         <button onClick={() => setCart(cart.filter(c => c.id !== item.id))} className="text-slate-300 hover:text-rose-600 transition-colors ml-1">
                           <X size={14} />
                         </button>
                      </div>
                   </div>
                   
                   {item.packagings.length > 0 && (
                      <div className="mb-1.5">
                         <select 
                           value={item.selectedPackagingId || ''}
                           onChange={e => setCart(cart.map(c => c.id === item.id ? normalizeCartItem(c, { selectedPackagingId: Number(e.target.value) }) : c))}
                           className="w-full text-[9px] font-black uppercase bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 outline-none hover:border-brand-orange transition-colors"
                         >
                           <option value="">Без упаковки</option>
                           {item.packagings.map(pkg => (
                             <option key={pkg.id} value={pkg.id}>{pkg.packageName} ({pkg.unitsPerPackage} {pkg.baseUnitName})</option>
                           ))}
                         </select>
                      </div>
                   )}

                   <div className="flex items-center justify-end border-t border-slate-50 pt-1.5">
                      <div className="text-right font-black text-slate-800 text-[11px] tracking-tight">{formatMoney(getLineTotal(item))}</div>
                   </div>
                </div>
              ))}
              {cart.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-20 py-10">
                   <Package size={48} strokeWidth={1} />
                   <span className="text-[10px] font-black uppercase tracking-widest mt-2">Пусто</span>
                </div>
              )}
          </div>

          <div className="bg-slate-900 text-white p-4 shrink-0 shadow-2xl relative overflow-hidden border-t-2 border-t-brand-yellow">
             <div className="flex items-end justify-between mb-3">
                <div>
                  <p className="text-[9px] font-black uppercase text-white/50 tracking-widest leading-none mb-1">Итого к оплате:</p>
                  <h2 className="text-3xl font-black italic tracking-tighter text-brand-yellow leading-none">{formatMoney(total)}</h2>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black uppercase text-white/50 tracking-widest leading-none mb-1">Сдача:</p>
                  <h3 className={clsx("text-lg font-black leading-none", balance >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {formatMoney(Math.abs(balance))}
                  </h3>
                </div>
             </div>

             <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="space-y-1">
                   <label className="text-[8px] font-black uppercase text-white/40 tracking-widest block">Скидка (%)</label>
                   <input 
                     type="number" 
                     value={discount || ''} 
                     onChange={e => setDiscount(clampDiscountPercent(e.target.value))}
                     className="w-full bg-white/5 border border-white/10 rounded h-8 px-2 text-white font-black text-sm outline-none focus:border-brand-yellow"
                     placeholder="0"
                   />
                </div>
                <div className="space-y-1">
                   <label className="text-[8px] font-black uppercase text-white/40 tracking-widest block">Оплата (Принято)</label>
                   <input 
                     type="number" 
                     value={paidAmount} 
                     onChange={e => setPaidAmount(e.target.value)}
                     className="w-full bg-white/10 border border-white/20 rounded h-8 px-2 text-brand-yellow font-black text-lg outline-none focus:border-brand-yellow"
                     placeholder="0.00"
                   />
                </div>
             </div>

             <div className="grid grid-cols-3 gap-2 mb-4">
                <button 
                  onClick={() => setPaymentMethod('cash')}
                  className={clsx(
                    "flex flex-col items-center justify-center p-2 rounded border transition-all gap-1",
                    paymentMethod === 'cash' ? "bg-brand-yellow border-brand-yellow text-slate-900" : "bg-white/5 border-white/10 hover:border-white/20"
                  )}
                >
                   <Banknote size={14} />
                   <span className="text-[8px] font-black uppercase">Наличные</span>
                </button>
                <button 
                  onClick={() => setPaymentMethod('transfer')}
                  className={clsx(
                    "flex flex-col items-center justify-center p-2 rounded border transition-all gap-1",
                    paymentMethod === 'transfer' ? "bg-brand-yellow border-brand-yellow text-slate-900" : "bg-white/5 border-white/10 hover:border-white/20"
                  )}
                >
                   <RefreshCw size={14} />
                   <span className="text-[8px] font-black uppercase">Перевод</span>
                </button>
                <button 
                  onClick={() => { setPaymentMethod('debt'); setPaidAmount('0'); }}
                  className={clsx(
                    "flex flex-col items-center justify-center p-2 rounded border transition-all gap-1",
                    paymentMethod === 'debt' ? "bg-rose-600 border-rose-600 text-white" : "bg-white/5 border-white/10 hover:border-white/20"
                  )}
                >
                   <AlertCircle size={14} />
                   <span className="text-[8px] font-black uppercase">Долг</span>
                </button>
             </div>

             <button 
               onClick={handleCheckout}
               disabled={isSubmitting || cart.length === 0 || !customerId}
               className="w-full bg-brand-orange hover:bg-[#ff8c00] disabled:opacity-30 disabled:grayscale py-3 rounded font-black text-white uppercase tracking-[3px] shadow-lg active:scale-95 transition-all text-xs"
             >
               {isSubmitting ? 'Проведение...' : 'ПРОБИТЬ ЧЕК (Alt+S)'}
             </button>
           </div>
        </div>
      </div>
    </div>
  );
}
