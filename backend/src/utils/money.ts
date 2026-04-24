/**
 * Robust financial calculation utilities to prevent floating-point inaccuracies.
 */

/**
 * Rounds a number to a fixed decimal precision (default 2) using epsilon-adjustment.
 * This prevents cases like 1.005 rounding to 1.00 instead of 1.01.
 */
export const roundMoney = (value: unknown, digits = 2): number => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  
  const factor = Math.pow(10, digits);
  return Math.round((numeric + Number.EPSILON) * factor) / factor;
};

/**
 * Rounds a number UP to a fixed decimal precision (default 2).
 * Commonly used for unit prices after discounts to protect margins.
 */
export const ceilMoney = (value: unknown, digits = 2): number => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  
  const factor = Math.pow(10, digits);
  return Math.ceil((numeric - Number.EPSILON) * factor) / factor;
};

/**
 * Validates and normalizes a monetary amount.
 */
export const normalizeMoney = (value: unknown, fieldName: string, options?: { allowZero?: boolean }): number => {
  const normalized = roundMoney(value);
  const allowZero = options?.allowZero ?? true;

  if (!Number.isFinite(normalized) || normalized < 0 || (!allowZero && normalized === 0)) {
    throw Object.assign(new Error(`${fieldName} must be a valid monetary amount`), { status: 400 });
  }

  return normalized;
};

/**
 * Safely adds multiple monetary amounts avoiding float drift.
 */
export const sumMoney = (amounts: number[]): number => {
  return roundMoney(amounts.reduce((sum, val) => sum + val, 0));
};
