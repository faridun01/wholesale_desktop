import client from './client';

export const getExpenses = async (params?: { warehouseId?: number | string; start?: string; end?: string }) => {
  const response = await client.get('/expenses', {
    params: {
      warehouseId: params?.warehouseId || undefined,
      start: params?.start || undefined,
      end: params?.end || undefined,
    },
  });
  return response.data;
};

export const createExpense = async (data: any) => {
  const response = await client.post('/expenses', data);
  return response.data;
};

export const updateExpense = async (id: number, data: any) => {
  try {
    const response = await client.put(`/expenses/${id}`, data);
    return response.data;
  } catch (error: any) {
    const status = Number(error?.response?.status || 0);
    const shouldRetryWithPatch = !status || status === 404 || status === 405;

    if (!shouldRetryWithPatch) {
      throw error;
    }

    const response = await client.patch(`/expenses/${id}`, data);
    return response.data;
  }
};

export const addExpensePayment = async (id: number, amount: number) => {
  const response = await client.post(`/expenses/${id}/payments`, { amount });
  return response.data;
};

export const deleteExpense = async (id: number) => {
  const response = await client.delete(`/expenses/${id}`);
  return response.data;
};
