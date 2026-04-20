type CacheEntry<T> = {
  value?: T;
  promise?: Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();

export async function getCachedReference<T>(
  key: string,
  loader: () => Promise<T>,
  options?: { force?: boolean },
): Promise<T> {
  const existing = cache.get(key) as CacheEntry<T> | undefined;

  if (!options?.force && existing?.value !== undefined) {
    return existing.value;
  }

  if (!options?.force && existing?.promise) {
    return existing.promise;
  }

  const promise = loader()
    .then((value) => {
      cache.set(key, { value });
      return value;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, { ...existing, promise });
  return promise;
}

export function invalidateReferenceCache(...keys: string[]) {
  keys.forEach((key) => cache.delete(key));
}

