import client from './client';
import { getCachedReference, invalidateReferenceCache } from './referenceCache';

const PUBLIC_SETTINGS_CACHE_KEY = 'settings-public';
const CATEGORIES_CACHE_KEY = 'settings-categories';

export const getPublicSettings = async (options?: { force?: boolean }) => {
  return getCachedReference(
    PUBLIC_SETTINGS_CACHE_KEY,
    async () => {
      const response = await client.get('/settings/public');
      return response.data;
    },
    options,
  );
};

export const getSettingsCategories = async (options?: { force?: boolean }) => {
  return getCachedReference(
    CATEGORIES_CACHE_KEY,
    async () => {
      const response = await client.get('/settings/categories');
      return response.data;
    },
    options,
  );
};

export const createSettingsCategory = async (name: string) => {
  const response = await client.post('/settings/categories', { name });
  invalidateReferenceCache(CATEGORIES_CACHE_KEY);
  return response.data;
};

export const invalidateSettingsReferenceCache = () => {
  invalidateReferenceCache(PUBLIC_SETTINGS_CACHE_KEY, CATEGORIES_CACHE_KEY);
};
