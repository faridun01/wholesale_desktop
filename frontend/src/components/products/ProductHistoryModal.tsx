import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { clsx } from 'clsx';
import { History, RotateCcw, Scissors, X } from 'lucide-react';
import { formatProductName } from '../../utils/productName';

interface ProductHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName?: string | null;
  product?: any;
  productHistory: any[];
  onReverseIncoming?: (transactionId: number) => void | Promise<void>;
  onReverseCorrectionWriteOff?: (transactionId: number) => void | Promise<void>;
  onReturnWriteOff?: (transaction: any) => void | Promise<void>;
  onDeleteWriteOffPermanently?: (transaction: any) => void | Promise<void>;
  onWriteOff?: () => void | Promise<void>;
}

const getTypeLabel = (type: string) => {
  if (type === 'incoming') return 'Приход';
  if (type === 'outgoing') return 'Расход';
  if (type === 'price_change' || type === 'adjustment') return 'Изменение';
  return 'Перенос';
};

const getTypeClassName = (type: string) =>
  clsx(
    'rounded-lg px-2 py-1 text-[10px] font-black uppercase',
    type === 'incoming'
      ? 'bg-emerald-50 text-emerald-600'
      : type === 'outgoing'
        ? 'bg-rose-50 text-rose-600'
        : type === 'price_change' || type === 'adjustment'
          ? 'bg-sky-50 text-sky-600'
          : 'bg-amber-50 text-amber-600',
  );

const getWriteOffStatusLabel = (status: string | null | undefined) => {
  if (status === 'partial_return') return 'Частично возвращено';
  if (status === 'full_return') return 'Полностью возвращено';
  if (status === 'return_record') return 'Возврат списания';
  if (status === 'writeoff') return 'Списание';
  return null;
};

const getWriteOffStatusClassName = (status: string | null | undefined) =>
  clsx(
    'rounded-lg px-2 py-1 text-[10px] font-black uppercase',
    status === 'partial_return'
      ? 'bg-amber-50 text-amber-700'
      : status === 'full_return'
        ? 'bg-emerald-50 text-emerald-700'
        : status === 'return_record'
          ? 'bg-sky-50 text-sky-700'
          : status === 'writeoff'
            ? 'bg-rose-50 text-rose-700'
            : 'hidden',
  );

const normalizePackageName = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'упаковка';
  if (['мешок', 'мешка', 'мешков', 'bag'].includes(normalized)) return 'мешок';
  if (['коробка', 'коробки', 'коробок', 'box'].includes(normalized)) return 'коробка';
  if (['упаковка', 'упаковки', 'упаковок', 'pack'].includes(normalized)) return 'упаковка';
  if (['пачка', 'пачки', 'пачек'].includes(normalized)) return 'пачка';
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
  const rawQuantity = Number(quantityValue || 0);
  const absoluteQuantity = Math.abs(rawQuantity);
  const sign = rawQuantity > 0 ? '+' : rawQuantity < 0 ? '-' : '';
  const preferredPackaging = getPreferredPackaging(product);
  const unitsPerPackage = Number(preferredPackaging?.unitsPerPackage || 0);
  const packageName = normalizePackageName(preferredPackaging?.packageName || preferredPackaging?.name || 'упаковка');
  const baseUnitName = product?.unit || 'шт';

  if (!preferredPackaging || unitsPerPackage <= 1 || !Number.isFinite(rawQuantity)) {
    return `${sign}${formatCountWithUnit(absoluteQuantity, baseUnitName)}`;
  }

  const packageCount = Math.floor(absoluteQuantity / unitsPerPackage);
  const remainderUnits = absoluteQuantity % unitsPerPackage;

  if (remainderUnits > 0) {
    return `${sign}${formatCountWithUnit(packageCount, packageName)}\n${formatCountWithUnit(remainderUnits, baseUnitName)}`;
  }

  return `${sign}${formatCountWithUnit(packageCount, packageName)}`;
};

export default function ProductHistoryModal({
  isOpen,
  onClose,
  productName,
  product,
  productHistory,
  onReverseIncoming,
  onReverseCorrectionWriteOff,
  onReturnWriteOff,
  onDeleteWriteOffPermanently,
  onWriteOff,
}: ProductHistoryModalProps) {
  const [historyFilter, setHistoryFilter] = useState<'all' | 'incoming' | 'writeoff' | 'returns'>('all');

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

  useEffect(() => {
    if (!isOpen) {
      setHistoryFilter('all');
    }
  }, [isOpen]);

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'incoming') {
      return productHistory.filter((item) => item.type === 'incoming');
    }

    if (historyFilter === 'writeoff') {
      return productHistory.filter(
        (item) => item.writeOffStatus === 'writeoff' || item.writeOffStatus === 'partial_return' || item.writeOffStatus === 'full_return'
      );
    }

    if (historyFilter === 'returns') {
      return productHistory.filter((item) => item.writeOffStatus === 'return_record');
    }

    return productHistory;
  }, [historyFilter, productHistory]);

  return (
    <AnimatePresence>
      {isOpen && (
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
            className="flex max-h-[94vh] w-full max-w-240 flex-col overflow-hidden rounded-t-4xl bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-4xl"
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/50 p-5 sm:p-6">
              <h3 className="flex items-center space-x-3 text-xl font-black text-slate-900">
                <div className="rounded-2xl bg-sky-500 p-2.5 text-white">
                  <History size={20} />
                </div>
                <span>История товара: {formatProductName(productName)}</span>
              </h3>
              <div className="flex items-center gap-2">
                {onWriteOff && (
                  <button
                    type="button"
                    onClick={() => void onWriteOff()}
                    className="inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-black text-amber-700 transition-all hover:bg-amber-100"
                  >
                    <Scissors size={14} />
                    <span>Списать</span>
                  </button>
                )}
                <button type="button" onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="mb-4 flex flex-wrap gap-2">
                {[
                  { key: 'all', label: 'Все' },
                  { key: 'incoming', label: 'Приход' },
                  { key: 'writeoff', label: 'Списания' },
                  { key: 'returns', label: 'Возвраты' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setHistoryFilter(item.key as typeof historyFilter)}
                    className={clsx(
                      'rounded-full border px-3 py-2 text-xs font-black transition-all',
                      historyFilter === item.key
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3 sm:hidden">
                {filteredHistory.map((t, i) => (
                  <div key={i} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{new Date(t.createdAt).toLocaleString('ru-RU')}</p>
                        <p className="mt-1 text-xs text-slate-500">{t.warehouseName || t.warehouse?.name || '---'}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={getTypeClassName(t.type)}>{getTypeLabel(t.type)}</span>
                        {getWriteOffStatusLabel(t.writeOffStatus) && (
                          <span className={getWriteOffStatusClassName(t.writeOffStatus)}>{getWriteOffStatusLabel(t.writeOffStatus)}</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-white px-3 py-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Кол-во</p>
                        <p className="mt-1 whitespace-pre-line text-sm font-black text-slate-900">
                          {getQuantityBreakdown(t.qtyChange ?? 0, product)}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white px-3 py-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Пользователь</p>
                        <p className="mt-1 wrap-break-word text-sm font-medium text-slate-900">{t.username || '---'}</p>
                      </div>
                    </div>
                    <div className="mt-3 rounded-2xl bg-white px-3 py-3">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Причина</p>
                      <p className="mt-1 wrap-break-word text-sm text-slate-600">{t.reason || '---'}</p>
                      {Number(t.returnedQty || 0) > 0 && (
                        <p className="mt-2 text-xs font-semibold text-emerald-700">Возвращено на склад: {Math.abs(Number(t.returnedQty || 0))}</p>
                      )}
                    </div>
                    {t.canReverseIncoming && onReverseIncoming && (
                      <button
                        type="button"
                        onClick={() => onReverseIncoming(Number(t.transactionId))}
                        className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-700 transition-all hover:bg-rose-100"
                      >
                        <RotateCcw size={14} />
                        <span>Отменить приход</span>
                      </button>
                    )}
                    {t.canReverseCorrectionWriteOff && onReverseCorrectionWriteOff && (
                      <button
                        type="button"
                        onClick={() => onReverseCorrectionWriteOff(Number(t.transactionId))}
                        className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-black text-amber-700 transition-all hover:bg-amber-100"
                      >
                        <RotateCcw size={14} />
                        <span>Отменить корректировку</span>
                      </button>
                    )}
                    {t.canReturnWriteOff && onReturnWriteOff && (
                      <button
                        type="button"
                        onClick={() => onReturnWriteOff(t)}
                        className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-black text-emerald-700 transition-all hover:bg-emerald-100"
                      >
                        <RotateCcw size={14} />
                        <span>Вернуть на склад</span>
                      </button>
                    )}
                    {t.canDeleteWriteOffPermanently && onDeleteWriteOffPermanently && (
                      <button
                        type="button"
                        onClick={() => onDeleteWriteOffPermanently(t)}
                        className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-700 transition-all hover:bg-rose-100"
                      >
                        <X size={14} />
                        <span>Удалить навсегда</span>
                      </button>
                    )}
                  </div>
                ))}
                {!filteredHistory.length && (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-400">
                    Нет записей по выбранному фильтру
                  </div>
                )}
              </div>

              <table className="hidden w-full table-fixed text-left sm:table">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <th className="w-[17%] pb-4">Дата</th>
                    <th className="w-[10%] pb-4">Тип</th>
                    <th className="w-[14%] pb-4">Кол-во</th>
                    <th className="w-[13%] pb-4">Склад</th>
                    <th className="w-[24%] pb-4">Причина</th>
                    <th className="w-[12%] pb-4">Пользователь</th>
                    <th className="w-[10%] pb-4 text-right">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredHistory.map((t, i) => (
                    <tr key={i} className="text-[13px]">
                      <td className="py-3 pr-3 align-top text-slate-500">{new Date(t.createdAt).toLocaleString('ru-RU')}</td>
                      <td className="py-3 pr-3 align-top">
                        <div className="flex flex-col items-start gap-1">
                          <span className={getTypeClassName(t.type)}>{getTypeLabel(t.type)}</span>
                          {getWriteOffStatusLabel(t.writeOffStatus) && (
                            <span className={getWriteOffStatusClassName(t.writeOffStatus)}>{getWriteOffStatusLabel(t.writeOffStatus)}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-3 align-top font-black">
                        <div className="whitespace-pre-line">{getQuantityBreakdown(t.qtyChange ?? 0, product)}</div>
                      </td>
                      <td className="py-3 pr-3 align-top wrap-break-word text-slate-600">{t.warehouseName || t.warehouse?.name || '---'}</td>
                      <td className="py-3 pr-3 align-top wrap-break-word italic text-slate-500">
                        <div>{t.reason || '---'}</div>
                        {Number(t.returnedQty || 0) > 0 && (
                          <div className="mt-1 text-[11px] font-semibold not-italic text-emerald-700">Возвращено: {Math.abs(Number(t.returnedQty || 0))}</div>
                        )}
                      </td>
                      <td className="py-3 pr-3 align-top wrap-break-word text-slate-500">{t.username || '---'}</td>
                      <td className="py-3 align-top text-right">
                        {t.canReverseIncoming && onReverseIncoming ? (
                          <button
                            type="button"
                            onClick={() => onReverseIncoming(Number(t.transactionId))}
                            className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-black text-rose-700 transition-all hover:bg-rose-100"
                          >
                            <RotateCcw size={12} />
                            <span>Отменить</span>
                          </button>
                        ) : t.canReverseCorrectionWriteOff && onReverseCorrectionWriteOff ? (
                          <button
                            type="button"
                            onClick={() => onReverseCorrectionWriteOff(Number(t.transactionId))}
                            className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-black text-amber-700 transition-all hover:bg-amber-100"
                          >
                            <RotateCcw size={12} />
                            <span>Отменить</span>
                          </button>
                        ) : t.canReturnWriteOff && onReturnWriteOff ? (
                          <button
                            type="button"
                            onClick={() => onReturnWriteOff(t)}
                            className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-black text-emerald-700 transition-all hover:bg-emerald-100"
                          >
                            <RotateCcw size={12} />
                            <span>Вернуть</span>
                          </button>
                        ) : t.canDeleteWriteOffPermanently && onDeleteWriteOffPermanently ? (
                          <button
                            type="button"
                            onClick={() => onDeleteWriteOffPermanently(t)}
                            className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-black text-rose-700 transition-all hover:bg-rose-100"
                          >
                            <X size={12} />
                            <span>Удалить</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!filteredHistory.length && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-sm font-semibold text-slate-400">
                        Нет записей по выбранному фильтру
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
