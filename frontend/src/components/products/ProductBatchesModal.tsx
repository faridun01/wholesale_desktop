import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { clsx } from 'clsx';
import { Layers, Trash2, X } from 'lucide-react';
import { formatMoney } from '../../utils/format';

interface ProductBatchesModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProduct: any;
  productBatches: any[];
  canManage?: boolean;
  onDeleteBatch?: (batchId: number) => void;
}

const normalizePackageName = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'упаковка';
  if (['мешок', 'мешка', 'мешков', 'bag'].includes(normalized)) return 'мешок';
  if (['коробка', 'коробки', 'коробок', 'box'].includes(normalized)) return 'коробка';
  if (['упаковка', 'упаковки', 'упаковок', 'pack'].includes(normalized)) return 'упаковка';
  if (['пачка', 'пачки', 'пачек'].includes(normalized)) return 'пачка';
  return normalized;
};

const normalizeDisplayBaseUnit = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '\u0448\u0442';
  if (['\u043f\u0430\u0447\u043a\u0430', '\u043f\u0430\u0447\u043a\u0438', '\u043f\u0430\u0447\u0435\u043a', '\u0448\u0442', '\u0448\u0442\u0443\u043a', '\u0448\u0442\u0443\u043a\u0430', '\u0448\u0442\u0443\u043a\u0438', 'pcs', 'piece', 'pieces'].includes(normalized)) {
    return '\u0448\u0442';
  }
  return normalized;
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

const getPreferredPackaging = (product: any) => {
  const packagings = Array.isArray(product?.packagings) ? product.packagings : [];
  return (
    packagings.find((packaging: any) => packaging?.isDefault && Number(packaging?.unitsPerPackage || 0) > 1) ||
    packagings.find((packaging: any) => Number(packaging?.unitsPerPackage || 0) > 1) ||
    null
  );
};

const getQuantityBreakdown = (quantityValue: unknown, product: any) => {
  const totalUnits = Number(quantityValue || 0);
  const preferredPackaging = getPreferredPackaging(product);
  const unitsPerPackage = Number(preferredPackaging?.unitsPerPackage || 0);
  const packageName = normalizePackageName(preferredPackaging?.packageName || preferredPackaging?.name || 'упаковка');
  const baseUnitName = normalizeDisplayBaseUnit(product?.unit || '\u0448\u0442');

  if (!preferredPackaging || unitsPerPackage <= 1 || !Number.isFinite(totalUnits)) {
    return {
      primary: formatCountWithUnit(totalUnits, baseUnitName),
      secondary: null,
    };
  }

  const packageCount = Math.floor(totalUnits / unitsPerPackage);
  const remainderUnits = totalUnits % unitsPerPackage;

  return {
    primary:
      remainderUnits > 0
        ? `${formatCountWithUnit(packageCount, packageName)}\n${formatCountWithUnit(remainderUnits, baseUnitName)}`
        : formatCountWithUnit(packageCount, packageName),
    secondary: `${formatCountWithUnit(totalUnits, baseUnitName)} всего`,
  };
};

export default function ProductBatchesModal({
  isOpen,
  onClose,
  selectedProduct,
  productBatches,
  canManage = false,
  onDeleteBatch,
}: ProductBatchesModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && selectedProduct && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center sm:p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[94vh] w-full max-w-232 flex-col overflow-hidden rounded-t-4xl bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-4xl"
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-violet-50/50 p-5 sm:p-6">
              <h3 className="flex items-center space-x-3 text-xl font-black text-slate-900">
                <div className="rounded-2xl bg-violet-500 p-2.5 text-white">
                  <Layers size={20} />
                </div>
                <span>Партии товара (FIFO): {selectedProduct.name}</span>
              </h3>
              <button type="button" onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="mb-5 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm font-medium text-amber-800">
                Система списывает товар из самых старых партий в первую очередь по FIFO.
              </div>

              <div className="space-y-3 sm:hidden">
                {productBatches.map((b, i) => {
                  const quantityInfo = getQuantityBreakdown(b.quantity, selectedProduct);
                  const remainingInfo = getQuantityBreakdown(b.remainingQuantity, selectedProduct);

                  return (
                    <div key={b.id} className={clsx('rounded-3xl border border-slate-100 p-4', i === 0 ? 'bg-violet-50/60' : 'bg-slate-50')}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{new Date(b.createdAt).toLocaleDateString('ru-RU')}</p>
                          <p className="mt-1 text-sm text-slate-500">{b.warehouse?.name || '---'}</p>
                        </div>
                        {i === 0 && (
                          <span className="rounded-md bg-violet-500 px-2 py-1 text-[8px] uppercase text-white">След. на списание</span>
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-white px-3 py-3">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Нач. кол-во</p>
                          <p className="mt-1 whitespace-pre-line text-sm font-semibold text-slate-900">{quantityInfo.primary}</p>
                          {quantityInfo.secondary && (
                            <p className="mt-1 text-[11px] font-medium text-slate-500">{quantityInfo.secondary}</p>
                          )}
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-3">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Остаток</p>
                          <p className="mt-1 whitespace-pre-line text-sm font-black text-slate-900">{remainingInfo.primary}</p>
                          {remainingInfo.secondary && (
                            <p className="mt-1 text-[11px] font-medium text-slate-500">{remainingInfo.secondary}</p>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 rounded-2xl bg-white px-3 py-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Цена закупки</p>
                        <p className="mt-1 text-sm font-black text-emerald-600">{formatMoney(b.costPrice)}</p>
                      </div>

                      {canManage && (
                        <div className="mt-3 flex flex-col gap-2">
                          <button
                            type="button"
                            disabled={!b.canDelete}
                            onClick={() => onDeleteBatch?.(b.id)}
                            className="flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                            <span>Удалить партию</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {productBatches.length === 0 && (
                  <div className="rounded-3xl bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">Партий не найдено</div>
                )}
              </div>

              <table className="hidden w-full text-left sm:table">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <th className="pb-4">Дата закупки</th>
                    <th className="pb-4">Склад</th>
                    <th className="pb-4 text-right">Начальное кол-во</th>
                    <th className="pb-4 text-right">Остаток</th>
                    <th className="pb-4 text-right">Цена закупки</th>
                    {canManage && <th className="pb-4 text-right">Действия</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {productBatches.map((b, i) => {
                    const quantityInfo = getQuantityBreakdown(b.quantity, selectedProduct);
                    const remainingInfo = getQuantityBreakdown(b.remainingQuantity, selectedProduct);

                    return (
                      <tr key={b.id} className={clsx('text-[13px]', i === 0 && 'bg-violet-50/40')}>
                        <td className="py-3 font-bold text-slate-500">
                          {new Date(b.createdAt).toLocaleDateString('ru-RU')}
                          {i === 0 && <span className="ml-2 rounded-md bg-violet-500 px-2 py-0.5 text-[8px] uppercase text-white">След. на списание</span>}
                        </td>
                        <td className="py-3 font-bold text-slate-600">{b.warehouse?.name || '---'}</td>
                        <td className="py-3 text-right font-bold text-slate-400">
                          <div className="whitespace-pre-line">{quantityInfo.primary}</div>
                          {quantityInfo.secondary && (
                            <div className="mt-1 text-[11px] font-medium text-slate-400">{quantityInfo.secondary}</div>
                          )}
                        </td>
                        <td className="py-3 text-right font-black text-slate-900">
                          <div className="whitespace-pre-line">{remainingInfo.primary}</div>
                          {remainingInfo.secondary && (
                            <div className="mt-1 text-[11px] font-medium text-slate-400">{remainingInfo.secondary}</div>
                          )}
                        </td>
                        <td className="py-3 text-right font-black text-emerald-600">{formatMoney(b.costPrice)}</td>
                        {canManage && (
                          <td className="py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                disabled={!b.canDelete}
                                onClick={() => onDeleteBatch?.(b.id)}
                                className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Trash2 size={12} />
                                <span>Удалить</span>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  {productBatches.length === 0 && (
                    <tr>
                      <td colSpan={canManage ? 6 : 5} className="py-20 text-center font-bold text-slate-400">Партий не найдено</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end border-t border-slate-100 bg-slate-50 p-4 sm:p-6">
              <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 bg-white px-8 py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50">
                Закрыть
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
