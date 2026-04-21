import client from './client';

export const createInvoice = async (data: any) => {
  const response = await client.post('/invoices', data);
  return response.data;
};

export const cancelInvoice = async (id: number) => {
  const response = await client.post(`/invoices/${id}/cancel`);
  return response.data;
};
export const getInvoiceDetails = async (id: number) => {
  const response = await client.get(`/invoices/${id}`);
  return response.data;
};
