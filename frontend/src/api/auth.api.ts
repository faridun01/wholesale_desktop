import client from './client';

export const login = async (data: { username: string; password: string }) => {
  const response = await client.post('/auth/login', data);
  return response.data;
};

export const loginWithTwoFactor = async (data: { twoFactorToken: string; code: string }) => {
  const response = await client.post('/auth/2fa/login', data);
  return response.data;
};

export const getSessionUser = async () => {
  const response = await client.get('/auth/me');
  return response.data;
};

export const logout = async () => {
  const response = await client.post('/auth/logout');
  return response.data;
};

export const register = async (data: { username: string; password: string; role?: string; warehouseId?: number }) => {
  const response = await client.post('/auth/register', data);
  return response.data;
};

export const publicRegister = async (data: { username: string; password: string; phone?: string }) => {
  const response = await client.post('/auth/public-register', data);
  return response.data;
};

export const changePassword = async (data: { currentPassword: string; newPassword: string }) => {
  const response = await client.post('/auth/change-password', data);
  return response.data;
};

export const setupTwoFactor = async () => {
  const response = await client.post('/auth/2fa/setup');
  return response.data;
};

export const verifyTwoFactorSetup = async (data: { setupToken: string; code: string }) => {
  const response = await client.post('/auth/2fa/verify-setup', data);
  return response.data;
};

export const disableTwoFactor = async (data: { currentPassword: string; code: string }) => {
  const response = await client.post('/auth/2fa/disable', data);
  return response.data;
};

export const setupUserTwoFactor = async (userId: number) => {
  const response = await client.post(`/auth/users/${userId}/2fa/setup`);
  return response.data;
};

export const verifyUserTwoFactorSetup = async (userId: number, data: { setupToken: string; code: string }) => {
  const response = await client.post(`/auth/users/${userId}/2fa/verify-setup`, data);
  return response.data;
};

export const disableUserTwoFactor = async (userId: number) => {
  const response = await client.post(`/auth/users/${userId}/2fa/disable`);
  return response.data;
};

export const getSetupStatus = async () => {
  const response = await client.get('/auth/setup-status');
  return response.data;
};

export const performSetup = async (data: { username: string; password: string }) => {
  const response = await client.post('/auth/setup', data);
  return response.data;
};
