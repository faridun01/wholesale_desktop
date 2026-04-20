export const roundMoney = (value: unknown, digits = 2) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(digits));
};

export const ceilMoney = (value: unknown, digits = 2) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  const factor = Math.pow(10, digits);
  return Math.ceil(numeric * factor) / factor;
};

export const formatMoney = (value: unknown, currency = '') => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return `0 ${currency}`.trim();
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundMoney(numeric));
  return `${formatted} ${currency}`.trim();
};

export const formatCount = (value: unknown) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return '0';
  return new Intl.NumberFormat('ru-RU').format(numeric);
};

export const toFixedNumber = (value: unknown, digits = 2) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(digits));
};

export const normalizeDisplayBaseUnit = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || 'шт';
};

export const formatDollar = (value: unknown) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(numeric);
};

export const formatPercent = (value: unknown, digits = 0) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return '0%';
  return `${numeric.toFixed(digits)}%`;
};
