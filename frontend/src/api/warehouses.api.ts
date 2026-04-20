import client from './client';
import { getCachedReference, invalidateReferenceCache } from './referenceCache';

const WAREHOUSES_CACHE_KEY = 'warehouses';

export const getWarehouses = async (options?: { force?: boolean }) => {
  return getCachedReference(
    WAREHOUSES_CACHE_KEY,
    async () => {
      const response = await client.get('/warehouses');
      return response.data;
    },
    options,
  );
};

export const createWarehouse = async (data: any) => {
  const response = await client.post('/warehouses', data);
  invalidateReferenceCache(WAREHOUSES_CACHE_KEY);
  return response.data;
};

export const updateWarehouse = async (id: number, data: any) => {
  const response = await client.put(`/warehouses/${id}`, data);
  invalidateReferenceCache(WAREHOUSES_CACHE_KEY);
  return response.data;
};

export const setDefaultWarehouse = async (id: number) => {
  const response = await client.post(`/warehouses/${id}/set-default`);
  invalidateReferenceCache(WAREHOUSES_CACHE_KEY);
  return response.data;
};

export const deleteWarehouse = async (id: number) => {
  const response = await client.delete(`/warehouses/${id}`);
  invalidateReferenceCache(WAREHOUSES_CACHE_KEY);
  return response.data;
};
