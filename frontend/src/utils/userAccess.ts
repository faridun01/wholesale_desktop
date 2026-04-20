import { getStoredUser } from './authStorage';

export type AppUser = {
  id?: number;
  username?: string;
  role?: string;
  warehouseId?: number | string | null;
  twoFactorEnabled?: boolean;
  warehouse?: {
    id?: number;
    name?: string;
    city?: string | null;
  } | null;
};

export function getCurrentUser(): AppUser {
  try {
    return JSON.parse(getStoredUser() || '{}');
  } catch {
    return {};
  }
}

export function isAdminUser(user: AppUser): boolean {
  const role = String(user.role || '').toUpperCase();
  return role === 'ADMIN';
}

export function getUserWarehouseId(user: AppUser): number | null {
  const value = user.warehouseId;
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function filterWarehousesForUser<T extends { id: number }>(warehouses: T[], user: AppUser): T[] {
  if (isAdminUser(user)) {
    return warehouses;
  }

  const warehouseId = getUserWarehouseId(user);
  if (!warehouseId) {
    return [];
  }

  return warehouses.filter((warehouse) => warehouse.id === warehouseId);
}
