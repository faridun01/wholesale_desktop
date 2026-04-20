import { roundMoney } from './format';

export const calculateEffectiveCost = (purchaseCost: unknown, expensePercent: unknown) => {
  const base = roundMoney(purchaseCost);
  const percent = Math.max(0, Number(expensePercent || 0));
  return roundMoney(base + (base * percent / 100));
};

export const calculateDiscountAmount = (amount: unknown, discountPercent: unknown) => {
  const total = roundMoney(amount);
  const percent = Math.max(0, Number(discountPercent || 0));
  return roundMoney(total * percent / 100);
};

export const calculateLineTotal = (quantity: unknown, price: unknown) => {
  return roundMoney(Number(quantity || 0) * Number(price || 0));
};

export const calculateUnitCostFromPackage = (packagePrice: unknown, unitsPerPackage: unknown) => {
  const packageCost = roundMoney(packagePrice);
  const units = Number(unitsPerPackage || 0);
  if (!Number.isFinite(units) || units <= 0) {
    return packageCost;
  }

  return roundMoney(packageCost / units);
};

export const calculateUnitCostFromLineTotal = (lineTotal: unknown, quantity: unknown) => {
  const total = roundMoney(lineTotal);
  const qty = Number(quantity || 0);
  if (!Number.isFinite(qty) || qty <= 0) {
    return 0;
  }

  return roundMoney(total / qty);
};

