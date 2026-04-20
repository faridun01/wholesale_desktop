export const roundMoney = (value: unknown, digits = 2) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Number(numeric.toFixed(digits));
};

export const ceilMoney = (value: unknown, digits = 2) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  const factor = Math.pow(10, digits);
  return Math.ceil(numeric * factor) / factor;
};

export const normalizeMoney = (value: unknown, fieldName: string, options?: { allowZero?: boolean }) => {
  const normalized = roundMoney(value);
  const allowZero = options?.allowZero ?? true;

  if (!Number.isFinite(normalized) || normalized < 0 || (!allowZero && normalized === 0)) {
    throw Object.assign(new Error(`${fieldName} must be a valid monetary amount`), { status: 400 });
  }

  return normalized;
};
