export function getDefaultWarehouseId<T extends { id: number; isDefault?: boolean | null }>(warehouses: T[]): number | null {
  const defaultWarehouse = warehouses.find((warehouse) => Boolean(warehouse.isDefault));
  return defaultWarehouse ? Number(defaultWarehouse.id) : null;
}
