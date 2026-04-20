import client from './client';

export const getProducts = async (warehouseId?: number) => {
  const response = await client.get('/products', {
    params: { warehouseId }
  });
  return response.data;
};

export const createProduct = async (data: any) => {
  const response = await client.post('/products', data);
  return response.data;
};

export const restockProduct = async (id: number, data: any) => {
  const response = await client.post(`/products/${id}/restock`, data);
  return response.data;
};

export const updateProduct = async (id: number, data: any) => {
  const response = await client.put(`/products/${id}`, data);
  return response.data;
};

export const mergeProduct = async (id: number, targetProductId: number) => {
  const response = await client.post(`/products/${id}/merge`, { targetProductId });
  return response.data;
};

export const deleteProduct = async (id: number, options: { force?: boolean } = {}) => {
  const response = await client.delete(`/products/${id}`, {
    params: options.force ? { force: 'true' } : undefined,
  });
  return response.data;
};

export const getProductHistory = async (id: number) => {
  const response = await client.get(`/products/${id}/history`);
  return response.data;
};

export const getProductPriceHistory = async (id: number) => {
  const response = await client.get(`/products/${id}/price-history`);
  return response.data;
};

export const getProductBatches = async (id: number) => {
  const response = await client.get(`/products/${id}/batches`);
  return response.data;
};

export const zeroProductBatch = async (batchId: number) => {
  const response = await client.post(`/products/batches/${batchId}/zero`);
  return response.data;
};

export const deleteProductBatch = async (batchId: number) => {
  const response = await client.delete(`/products/batches/${batchId}`);
  return response.data;
};

export const reverseIncomingTransaction = async (transactionId: number) => {
  const response = await client.post(`/products/history/${transactionId}/reverse-incoming`);
  return response.data;
};

export const reverseCorrectionWriteOffTransaction = async (transactionId: number) => {
  const response = await client.post(`/products/history/${transactionId}/reverse-writeoff`);
  return response.data;
};

export const returnWriteOffTransaction = async (transactionId: number, data: { quantity: number; reason?: string }) => {
  const response = await client.post(`/products/history/${transactionId}/return-writeoff`, data);
  return response.data;
};

export const deleteWriteOffTransactionPermanently = async (transactionId: number) => {
  const response = await client.delete(`/products/history/${transactionId}/writeoff`);
  return response.data;
};

export const writeOffProduct = async (id: number, data: { quantity: number; reason: string }) => {
  const response = await client.post(`/products/${id}/write-off`, data);
  return response.data;
};
