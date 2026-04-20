import client from './client';

export const getAnalytics = async (params?: { warehouseId?: number | null; start?: string; end?: string }) => {
  const response = await client.get('/reports/analytics', {
    params: {
      warehouse_id: params?.warehouseId || undefined,
      start: params?.start || undefined,
      end: params?.end || undefined,
    },
  });
  return response.data;
};
