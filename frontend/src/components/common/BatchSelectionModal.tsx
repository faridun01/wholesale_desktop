import React, { useState, useEffect } from 'react';
import { X, Package, Calendar, Banknote, Save, Edit2, Check, Plus, Minus } from 'lucide-react';
import { formatMoney } from '../../utils/format';
import client from '../../api/client';
import toast from 'react-hot-toast';

interface Batch {
  id: number;
  quantity: number;
  remainingQuantity: number;
  costPrice: number;
  sellingPrice: number;
  createdAt: string;
}

interface BatchSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (batch: Batch, quantity: number) => void;
  productName: string;
  batches: Batch[];
  onBatchUpdate: () => void;
}

export default function BatchSelectionModal({ isOpen, onClose, onSelect, productName, batches, onBatchUpdate }: BatchSelectionModalProps) {
  const [editingBatchId, setEditingBatchId] = useState<number | null>(null);
  const [newPrice, setNewPrice] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState<number>(1);

  useEffect(() => {
    if (isOpen && batches.length > 0) {
      setSelectedBatchId(batches[0].id);
      setQuantity(1);
    }
  }, [isOpen, batches]);

  if (!isOpen) return null;

  const handleStartEdit = (e: React.MouseEvent, batch: Batch) => {
    e.stopPropagation();
    setEditingBatchId(batch.id);
    setNewPrice(String(batch.sellingPrice));
  };

  const handleSavePrice = async (e: React.MouseEvent, batchId: number) => {
    e.stopPropagation();
    if (!newPrice || isNaN(Number(newPrice))) return;

    setIsUpdating(true);
    try {
      await client.put(`/products/batches/${batchId}`, { sellingPrice: Number(newPrice) });
      toast.success('Цена партии обновлена');
      setEditingBatchId(null);
      onBatchUpdate();
    } catch (err) {
      toast.error('Ошибка обновления цены');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirm = () => {
    const batch = batches.find(b => b.id === selectedBatchId);
    if (batch) {
      onSelect(batch, quantity);
    }
  };

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden border border-slate-200 animate-slide-in">
        <div className="bg-brand-yellow px-4 py-3 flex items-center justify-between border-b border-black/10">
          <div className="flex items-center gap-2">
            <Package size={18} className="text-slate-800" />
            <h3 className="text-sm font-bold uppercase tracking-tight text-slate-800">Выбор партии и количества: {productName}</h3>
          </div>
          <button onClick={onClose} className="hover:bg-black/5 p-1 rounded transition-colors text-slate-700">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-hidden flex flex-col max-h-[70vh]">
          <div className="mb-4 bg-slate-900 rounded-xl p-4 text-white shadow-inner border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium uppercase text-white/40 tracking-widest">Сколько продаем?</span>
              <span className="text-[10px] font-bold text-brand-yellow">Всего на складе: {batches.reduce((sum, b) => sum + b.remainingQuantity, 0)} шт</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center bg-white/10 rounded-lg p-1 border border-white/10">
                <button 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded transition-colors"
                >
                  <Minus size={20} />
                </button>
                <input 
                  type="number" 
                  value={quantity}
                  onChange={e => setQuantity(Math.max(1, Number(e.target.value)))}
                  className="w-20 bg-transparent text-center text-2xl font-bold outline-none"
                />
                <button 
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded transition-colors"
                >
                  <Plus size={20} />
                </button>
              </div>
              <div className="text-[11px] text-white/60 italic leading-tight">
                Если укажете больше, чем в одной партии, <br/> остаток доберется из других партий.
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 uppercase font-medium mb-3 tracking-widest">Выберите приоритетную партию:</p>
          <div className="space-y-2 overflow-auto flex-1 pr-1">
            {batches.map((batch) => (
              <div 
                key={batch.id}
                onClick={() => editingBatchId !== batch.id && setSelectedBatchId(batch.id)}
                className={`group relative bg-slate-50 border rounded-xl p-3 transition-all ${
                  selectedBatchId === batch.id 
                    ? 'border-brand-orange ring-2 ring-brand-orange/20 bg-brand-yellow/5' 
                    : 'border-slate-200 hover:border-brand-yellow cursor-pointer'
                }`}
              >
                {selectedBatchId === batch.id && (
                  <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-8 bg-brand-orange rounded-full shadow-[0_0_10px_rgba(255,157,0,0.5)]"></div>
                )}

                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Calendar size={14} />
                    <span className="text-[10px] font-medium">{new Date(batch.createdAt).toLocaleDateString()} {new Date(batch.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="bg-white px-2 py-0.5 rounded-full border border-slate-200 text-[10px] font-bold text-slate-700">
                    Остаток: {batch.remainingQuantity} шт
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col flex-1">
                    <span className="text-[9px] uppercase text-slate-400 font-bold leading-none mb-1">Цена продажи</span>
                    <div className="flex items-center gap-2">
                      <Banknote size={14} className="text-brand-orange" />
                      {editingBatchId === batch.id ? (
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <input 
                            type="number"
                            value={newPrice}
                            onChange={e => setNewPrice(e.target.value)}
                            autoFocus
                            className="w-24 h-8 bg-white border-2 border-brand-orange rounded px-2 text-sm font-bold text-slate-900 outline-none"
                          />
                          <button 
                            disabled={isUpdating}
                            onClick={(e) => handleSavePrice(e, batch.id)}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white p-1.5 rounded-lg transition-colors shadow-sm"
                          >
                            <Check size={16} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setEditingBatchId(null); }}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-600 p-1.5 rounded-lg transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold italic tracking-tighter text-brand-orange">{formatMoney(batch.sellingPrice)}</span>
                          <button 
                            onClick={(e) => handleStartEdit(e, batch)}
                            className="p-1 text-slate-400 hover:text-brand-orange transition-all"
                          >
                            <Edit2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-50 px-4 py-4 border-t border-slate-100 flex items-center justify-between">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 uppercase tracking-widest transition-colors"
          >
            Отмена
          </button>
          <button 
            onClick={handleConfirm}
            className="bg-brand-orange hover:bg-[#ff8c00] text-white px-8 py-2.5 rounded-xl font-bold uppercase tracking-wider shadow-lg shadow-brand-orange/20 active:scale-95 transition-all text-xs"
          >
            Добавить в корзину
          </button>
        </div>
      </div>
    </div>
  );
}
