import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Search, 
  Trash2, 
  Plus, 
  Save, 
  Loader2, 
  AlertCircle,
  Package,
  Calculator,
  Warehouse
} from 'lucide-react';
import client from '../../api/client';
import { getProducts } from '../../api/products.api';
import { ceilMoney, formatMoney, roundMoney } from '../../utils/format';
import { formatProductName } from '../../utils/productName';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import PrintPreviewModal from '../common/PrintPreviewModal';
import { generateTorg12Html, generateReceiptHtml } from '../../utils/printTemplates';
import { Printer, FileText, Receipt } from 'lucide-react';

interface EditInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: any;
  onSuccess: () => void;
}

export default function EditInvoiceModal({ isOpen, onClose, invoice, onSuccess }: EditInvoiceModalProps) {
  const [items, setItems] = useState<any[]>([]);
  const [discount, setDiscount] = useState<string>('0');
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previewState, setPreviewState] = useState<{ isOpen: boolean; title: string; html: string; type: 'a4' | 'receipt' }>({
    isOpen: false,
    title: '',
    html: '',
    type: 'a4'
  });

  useEffect(() => {
    if (isOpen && invoice) {
      setItems(invoice.items.map((item: any) => ({
        ...item,
        productId: item.productId,
        productName: item.product?.name || item.product_name,
        unit: item.unit || item.product?.unit || 'шт',
        editPrice: String(item.sellingPrice),
        editQty: String(item.quantity)
      })));
      setDiscount(String(invoice.discount || 0));
      fetchProducts();
    }
  }, [isOpen, invoice]);

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const data = await getProducts();
      setAllProducts(Array.isArray(data) ? data : []);
    } catch { toast.error('Ошибка загрузки товаров'); }
    finally { setIsLoading(false); }
  };

  const filteredProducts = useMemo(() => {
    if (!search) return [];
    const s = search.toLowerCase();
    return allProducts.filter(p => p.name.toLowerCase().includes(s) || String(p.id).includes(s)).slice(0, 10);
  }, [allProducts, search]);

  const addItem = (p: any) => {
    const existing = items.find(i => i.productId === p.id);
    if (existing) {
      toast.error('Товар уже в списке');
      return;
    }
    setItems([...items, {
      productId: p.id,
      productName: p.name,
      unit: p.unit || 'шт',
      editPrice: String(p.sellingPrice),
      editQty: '1',
      isNew: true
    }]);
    setSearch('');
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: string, val: string) => {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], [field]: val };
    setItems(newItems);
  };

  const getLineTotal = (item: any) => {
    const unitPriceAfterDiscount = Number(item.editPrice || 0) * (1 - (Number(item.discount || 0) / 100));
    const unitPriceRounded = ceilMoney(unitPriceAfterDiscount);
    return roundMoney(Number(item.editQty || 0) * unitPriceRounded);
  };

  const calculateTotal = () => {
    const subtotal = items.reduce((acc, item) => acc + getLineTotal(item), 0);
    const d = Number(discount) || 0;
    const discountAmount = roundMoney(subtotal * (d / 100));
    return {
       subtotal,
       discountAmount,
       netTotal: roundMoney(subtotal - discountAmount)
    };
  };

  const totals = calculateTotal();

  const handleSave = async () => {
    if (items.length === 0) {
      toast.error('Добавьте хотя бы один товар');
      return;
    }
    
    setIsSaving(true);
    try {
      await client.put(`/invoices/${invoice.id}`, {
        customerId: invoice.customerId,
        discount: Number(discount),
        items: items.map(i => ({
          productId: i.productId,
          quantity: Number(i.editQty),
          sellingPrice: Number(i.editPrice)
        }))
      });
      toast.success('Накладная обновлена');
      window.dispatchEvent(new CustomEvent('refresh-data'));
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrintTorg12 = () => {
    setPreviewState({
      isOpen: true,
      title: `ТОРГ-12 №${invoice.id}`,
      html: generateTorg12Html(invoice),
      type: 'a4'
    });
  };

  const handlePrintReceipt = () => {
    setPreviewState({
      isOpen: true,
      title: `Чек №${invoice.id}`,
      html: generateReceiptHtml(invoice),
      type: 'receipt'
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
        onClick={onClose}
      />
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="relative bg-white w-full max-w-5xl rounded-sm shadow-2xl flex flex-col max-h-[90vh] border-2 border-brand-orange"
      >
        {/* Header */}
        <div className="bg-brand-yellow px-4 py-3 flex items-center justify-between border-b border-black/10">
           <div className="flex items-center gap-3">
              <Calculator size={20} className="text-slate-800" />
              <div>
                 <h2 className="text-sm font-black uppercase text-slate-800">Редактирование накладной №{invoice?.id}</h2>
                 <p className="text-[9px] font-black uppercase text-slate-500 italic">Изменение состава, цен и скидок</p>
              </div>
           </div>
            <div className="flex items-center gap-2">
               <button onClick={handlePrintTorg12} className="btn-1c flex items-center gap-1.5 !text-[10px] !py-1">
                  <FileText size={14} /> ТОРГ-12
               </button>
               <button onClick={handlePrintReceipt} className="btn-1c flex items-center gap-1.5 !text-[10px] !py-1">
                  <Receipt size={14} /> Чек
               </button>
               <div className="h-4 w-[1px] bg-black/10 mx-1"></div>
               <button onClick={onClose} className="hover:text-rose-600 transition-colors ml-1"><X size={24} /></button>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
           {/* Left: Editor Table */}
           <div className="flex-1 flex flex-col bg-[#e6e8eb]">
              <div className="bg-white p-3 border-b border-border-base flex items-center gap-4">
                 <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Добавить товар в накладную (поиск по имени)..." 
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="field-1c w-full pl-9 py-2"
                    />
                    {filteredProducts.length > 0 && (
                       <div className="absolute top-full left-0 right-0 z-10 bg-white border border-slate-200 mt-1 shadow-xl rounded-sm overflow-hidden">
                          {filteredProducts.map(p => (
                             <button 
                                key={p.id}
                                onClick={() => addItem(p)}
                                className="w-full text-left px-4 py-2 hover:bg-brand-yellow/10 flex items-center justify-between group"
                             >
                                <div>
                                   <div className="text-[11px] font-black text-slate-800 uppercase">{formatProductName(p.name)}</div>
                                   <div className="text-[9px] text-slate-400 font-bold uppercase italic">Остаток: {p.stock} {p.unit}</div>
                                </div>
                                <div className="text-[11px] font-black text-brand-orange">{formatMoney(p.sellingPrice)}</div>
                             </button>
                          ))}
                       </div>
                    )}
                 </div>
              </div>

              <div className="flex-1 overflow-auto">
                 <table className="table-1c border-separate border-spacing-0">
                    <thead className="sticky top-0 z-10">
                       <tr>
                          <th className="w-10 text-center">№</th>
                          <th>Наименование товара</th>
                          <th className="w-24 text-right">Цена</th>
                          <th className="w-24 text-center">Кол-во</th>
                          <th className="w-16 text-center">Ед.</th><th className="w-32 text-center text-[9px] uppercase text-slate-400">В коробках</th>
                          <th className="w-32 text-right">Сумма</th>
                          <th className="w-12"></th>
                       </tr>
                    </thead>
                    <tbody>
                       {items.map((item, idx) => (
                          <tr key={idx} className={clsx(item.isNew && "bg-brand-yellow/5")}>
                             <td className="text-center font-mono text-[10px] text-slate-400">{idx + 1}</td>
                             <td className="font-bold text-slate-800">
                                {formatProductName(item.productName)}
                                {item.isNew && <span className="ml-2 bg-brand-orange text-white text-[7px] px-1 rounded uppercase tracking-tighter">New</span>}
                             </td>
                             <td className="p-0">
                                <input 
                                   type="number" 
                                   value={item.editPrice} 
                                   onChange={e => updateItem(idx, 'editPrice', e.target.value)}
                                   className="w-full h-full bg-transparent text-right font-black text-slate-600 outline-none px-2 focus:bg-white"
                                />
                             </td>
                             <td className="p-0">
                                <input 
                                   type="number" 
                                   value={item.editQty} 
                                   onChange={e => updateItem(idx, 'editQty', e.target.value)}
                                   className="w-full h-full bg-transparent text-center font-black text-slate-900 outline-none px-2 focus:bg-white border-x border-slate-100"
                                />
                             </td>
                             <td className="text-center text-[9px] font-black text-slate-400 uppercase tracking-tighter">{item.unit}</td><td className="text-center">{(() => { const unitsPerBox = item.unitsPerPackageSnapshot || allProducts.find(p => p.id === item.productId)?.unitsPerBox || 1; if (unitsPerBox > 1) { const qty = Number(item.editQty || 0); return ( <div className="text-[10px] font-bold text-slate-500"> {Math.floor(qty / unitsPerBox)} <span className="text-[8px] uppercase">кор</span> {qty % unitsPerBox > 0 && ( <span className="text-slate-300 ml-1">+ {qty % unitsPerBox} шт</span> )} </div> ); } return <span className="text-slate-200">---</span>; })()}</td>
                             <td className="text-right font-black text-slate-900 pr-4">
                                {formatMoney(getLineTotal(item))}
                             </td>
                             <td className="text-center">
                                <button onClick={() => removeItem(idx)} className="text-slate-300 hover:text-rose-600 transition-colors">
                                   <Trash2 size={14} />
                                </button>
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>

           {/* Right: Totals Side */}
           <div className="w-80 bg-white border-l border-border-base p-6 flex flex-col">
              <div className="space-y-6 flex-1">
                 <div>
                    <span className="text-[9px] font-black uppercase text-slate-400 block mb-3 tracking-widest">Информация по документу</span>
                    <div className="space-y-4">
                       <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100">
                             <Warehouse size={14} />
                          </div>
                          <div>
                             <div className="text-[8px] font-black uppercase text-slate-400 leading-none">Склад отгрузки</div>
                             <div className="text-[11px] font-bold text-slate-700">{invoice?.warehouse?.name}</div>
                          </div>
                       </div>
                       <div>
                          <div className="text-[8px] font-black uppercase text-slate-400 leading-none mb-1.5 font-bold">Скидка на чек (%)</div>
                          <input 
                            type="number" 
                            value={discount}
                            onChange={e => setDiscount(e.target.value)}
                            max={100} min={0}
                            className="field-1c w-full !text-lg font-black text-brand-orange text-center"
                          />
                       </div>
                    </div>
                 </div>

                 <div className="pt-6 border-t border-slate-100 space-y-3">
                    <div className="flex justify-between items-center">
                       <span className="text-[10px] font-black uppercase text-slate-400">Промежуточно:</span>
                       <span className="text-xs font-bold text-slate-600">{formatMoney(totals.subtotal)}</span>
                    </div>
                    <div className="flex justify-between items-center text-rose-500">
                       <span className="text-[10px] font-black uppercase tracking-tighter">Размер скидки:</span>
                       <span className="text-xs font-black">-{formatMoney(totals.discountAmount)}</span>
                    </div>
                    <div className="pt-4 bg-brand-yellow/10 p-4 rounded border border-brand-yellow/20">
                       <span className="text-[9px] font-black uppercase text-slate-500 block mb-1">ИТОГО К ОПЛАТЕ</span>
                       <span className="text-3xl font-black text-slate-900 leading-none">{formatMoney(totals.netTotal)}</span>
                    </div>
                 </div>
              </div>

              <div className="pt-6 space-y-2">
                 <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full bg-slate-900 text-white font-black py-4 rounded shadow-xl hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
                 >
                    {isSaving ? (
                       <Loader2 className="animate-spin" size={16} />
                    ) : (
                       <>
                         <Save size={16} /> СОХРАНИТЬ ИЗМЕНЕНИЯ
                       </>
                    )}
                 </button>
                 <button onClick={onClose} className="w-full text-slate-400 font-bold py-2 hover:text-slate-600 uppercase text-[10px] tracking-widest text-center mt-2">
                    Отменить правки
                 </button>
              </div>
           </div>
        </div>
      </motion.div>

       <PrintPreviewModal 
         isOpen={previewState.isOpen}
         onClose={() => setPreviewState(s => ({ ...s, isOpen: false }))}
         title={previewState.title}
         html={previewState.html}
         type={previewState.type}
       />
    </div>
  );
}
