import React, { useState } from 'react';
import { X, Plus, Trash2, Save, Loader2, Copy } from 'lucide-react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import * as ProductsApi from '../../api/products.api';
import { createSettingsCategory } from '../../api/settings-reference.api';

interface BulkAddProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  categories: any[];
  warehouses: any[];
  defaultWarehouseId: string;
}

interface ProductRow {
  id: string;
  name: string;
  categoryId: string;
  categoryInput: string;
  unit: string;
  costPrice: string;
  sellingPrice: string;
  unitsPerBox: string;
  minStock: string;
  initialStock: string;
}

export default function BulkAddProductsModal({
  isOpen,
  onClose,
  onSuccess,
  categories,
  warehouses,
  defaultWarehouseId
}: BulkAddProductsModalProps) {
  const createEmptyRow = (): ProductRow => ({
    id: Math.random().toString(36).substr(2, 9),
    name: '',
    categoryId: '',
    categoryInput: '',
    unit: 'шт',
    costPrice: '',
    sellingPrice: '',
    unitsPerBox: '1',
    minStock: '0',
    initialStock: '0',
  });

  const [rows, setRows] = useState<ProductRow[]>([createEmptyRow(), createEmptyRow(), createEmptyRow()]);
  const [isSaving, setIsSaving] = useState(false);
  const [targetWarehouseId, setTargetWarehouseId] = useState(defaultWarehouseId);

  if (!isOpen) return null;

  const addRows = (count: number) => {
    const newRows = Array.from({ length: count }, () => createEmptyRow());
    setRows([...rows, ...newRows]);
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) return;
    setRows(rows.filter(r => r.id !== id));
  };

  const updateRow = (id: string, field: keyof ProductRow, value: string) => {
    setRows(rows.map(r => {
      if (r.id === id) {
        if (field === 'categoryInput') {
          const found = categories.find(c => c.name === value);
          return { ...r, categoryInput: value, categoryId: found ? String(found.id) : '' };
        }
        return { ...r, [field]: value };
      }
      return r;
    }));
  };

  const handleApplyCategoryToAll = (index: number) => {
    const sourceRow = rows[index];
    if (!sourceRow.categoryInput) return;
    
    setRows(rows.map(r => ({
      ...r,
      categoryInput: sourceRow.categoryInput,
      categoryId: sourceRow.categoryId
    })));
    toast.success('Категория применена ко всем строкам');
  };

  const handleSave = async () => {
    const validRows = rows.filter(r => r.name.trim() !== '');
    if (validRows.length === 0) {
      return toast.error('Добавьте хотя бы один товар с названием');
    }

    if (!targetWarehouseId) {
      return toast.error('Выберите склад');
    }

    setIsSaving(true);
    try {
      const productsToCreate = [];

      for (const row of validRows) {
        let cId = row.categoryId;
        if (!cId && row.categoryInput) {
          try {
            const nc = await createSettingsCategory(row.categoryInput);
            cId = String(nc.id);
          } catch (e) {
             // If category creation fails, we might still want to proceed or stop
             console.error('Failed to create category', row.categoryInput);
          }
        }

        if (!cId) {
          setIsSaving(false);
          return toast.error(`У товара "${row.name}" не указана категория`);
        }

        productsToCreate.push({
          name: row.name,
          categoryId: Number(cId),
          unit: row.unit,
          costPrice: row.costPrice || '0',
          sellingPrice: row.sellingPrice || '0',
          unitsPerBox: row.unitsPerBox || '1',
          minStock: row.minStock || '0',
          initialStock: row.initialStock || '0',
          warehouseId: Number(targetWarehouseId)
        });
      }

      await ProductsApi.bulkCreateProducts({
        warehouseId: Number(targetWarehouseId),
        products: productsToCreate
      });

      toast.success(`Успешно добавлено ${productsToCreate.length} товаров`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Ошибка при массовом добавлении');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }} 
        className="bg-white border-2 border-brand-orange shadow-2xl rounded-lg w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="bg-brand-yellow px-4 py-3 flex items-center justify-between border-b border-black/10">
          <div className="flex items-center gap-3">
            <Plus size={20} className="text-slate-700" />
            <span className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Массовое добавление товаров
            </span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-rose-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="bg-[#f2f3f7] p-3 border-b border-slate-200 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Склад:</span>
            <select 
              value={targetWarehouseId} 
              onChange={e => setTargetWarehouseId(e.target.value)}
              className="bg-white border border-slate-300 rounded px-3 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-brand-orange min-w-[200px]"
            >
              <option value="">-- Выберите склад --</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>

          <div className="h-6 w-[1px] bg-slate-300 mx-2"></div>

          <button onClick={() => addRows(5)} className="btn-1c flex items-center gap-2 py-1.5">
            <Plus size={14} /> Добавить 5 строк
          </button>
          <button onClick={() => addRows(10)} className="btn-1c flex items-center gap-2 py-1.5">
            <Plus size={14} /> Добавить 10 строк
          </button>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-400 uppercase">
              Заполнено строк: {rows.filter(r => r.name.trim() !== '').length}
            </span>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-auto p-0 bg-slate-50">
          <table className="table-1c border-separate border-spacing-0 w-full">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="w-10 text-center">№</th>
                <th className="min-w-[250px]">Наименование товара</th>
                <th className="w-64">Категория (Группа)</th>
                <th className="w-28">Ед. изм.</th>
                <th className="w-32">Закуп. цена</th>
                <th className="w-32">Прод. цена</th>
                <th className="w-28">В кор.</th>
                <th className="w-28">Мин. ост.</th>
                <th className="w-28">Нач. ост.</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.id} className="hover:bg-brand-orange/5 transition-colors">
                  <td className="text-center font-mono text-[11px] text-slate-400">{idx + 1}</td>
                  <td>
                    <input 
                      type="text" 
                      value={row.name} 
                      onChange={e => updateRow(row.id, 'name', e.target.value)}
                      placeholder="Название товара..."
                      className="field-1c w-full border-transparent focus:border-brand-orange bg-transparent"
                    />
                  </td>
                  <td>
                    <div className="flex items-center gap-1 group">
                      <input 
                        list={`cats-bulk-${row.id}`}
                        value={row.categoryInput} 
                        onChange={e => updateRow(row.id, 'categoryInput', e.target.value)}
                        placeholder="Выберите или введите..."
                        className="field-1c w-full border-transparent focus:border-brand-orange bg-transparent"
                      />
                      <datalist id={`cats-bulk-${row.id}`}>
                        {categories.map(c => <option key={c.id} value={c.name} />)}
                      </datalist>
                      <button 
                        onClick={() => handleApplyCategoryToAll(idx)}
                        title="Применить эту категорию ко всем"
                        className="p-1 text-slate-400 hover:text-brand-orange opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </td>
                  <td>
                    <select 
                      value={row.unit} 
                      onChange={e => updateRow(row.id, 'unit', e.target.value)}
                      className="field-1c w-full border-transparent focus:border-brand-orange bg-transparent"
                    >
                      <option value="шт">шт</option>
                      <option value="кг">кг</option>
                      <option value="л">л</option>
                      <option value="уп">уп</option>
                    </select>
                  </td>
                  <td>
                    <input 
                      type="number" 
                      value={row.costPrice} 
                      onChange={e => updateRow(row.id, 'costPrice', e.target.value)}
                      placeholder="0.00"
                      className="field-1c w-full border-transparent focus:border-brand-orange bg-transparent text-right font-mono"
                    />
                  </td>
                  <td>
                    <input 
                      type="number" 
                      value={row.sellingPrice} 
                      onChange={e => updateRow(row.id, 'sellingPrice', e.target.value)}
                      placeholder="0.00"
                      className="field-1c w-full border-transparent focus:border-brand-orange bg-transparent text-right font-mono font-bold text-slate-800"
                    />
                  </td>
                  <td>
                    <input 
                      type="number" 
                      value={row.unitsPerBox} 
                      onChange={e => updateRow(row.id, 'unitsPerBox', e.target.value)}
                      className="field-1c w-full border-transparent focus:border-brand-orange bg-transparent text-center"
                    />
                  </td>
                  <td>
                    <input 
                      type="number" 
                      value={row.minStock} 
                      onChange={e => updateRow(row.id, 'minStock', e.target.value)}
                      className="field-1c w-full border-transparent focus:border-brand-orange bg-transparent text-center"
                    />
                  </td>
                  <td>
                    <input 
                      type="number" 
                      value={row.initialStock} 
                      onChange={e => updateRow(row.id, 'initialStock', e.target.value)}
                      className="field-1c w-full border-transparent focus:border-brand-orange bg-transparent text-center text-blue-600 font-medium"
                    />
                  </td>
                  <td className="text-center">
                    <button 
                      onClick={() => removeRow(row.id)}
                      className="p-1.5 text-slate-300 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="bg-white p-4 border-t border-slate-200 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 max-w-md italic">
            * Пустые строки будут проигнорированы. Для сохранения новых категорий они будут созданы автоматически.
          </div>
          <div className="flex gap-3">
            <button 
              onClick={onClose} 
              className="btn-1c px-6 py-2"
              disabled={isSaving}
            >
              Отмена
            </button>
            <button 
              onClick={handleSave} 
              className="btn-1c btn-1c-primary px-8 py-2 flex items-center gap-2"
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Сохранение...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Записать всё ({rows.filter(r => r.name.trim() !== '').length})
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
