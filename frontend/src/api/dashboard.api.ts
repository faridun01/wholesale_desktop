import client from './client';

export const getDashboardSummary = async (warehouseId?: number | null) => {
  const response = await client.get('/dashboard/summary', {
    params: {
      warehouseId: warehouseId || undefined,
    },
  });
  return response.data;
};
