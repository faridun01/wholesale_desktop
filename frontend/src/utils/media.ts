import type React from 'react';

const getApiOrigin = () => {
  if (import.meta.env.VITE_API_URL) {
    return String(import.meta.env.VITE_API_URL).replace(/\/api\/?$/, '');
  }

  if (typeof window !== 'undefined' && window.location.port === '3000') {
    return 'http://localhost:3001';
  }

  return '';
};

export const getProductFallbackImage = (seed: string | number) =>
  `https://picsum.photos/seed/product-${seed}/500/500`;

export const resolveMediaUrl = (url: string | null | undefined, fallbackSeed: string | number) => {
  if (!url) {
    return getProductFallbackImage(fallbackSeed);
  }

  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) {
    return url;
  }

  const normalizeProtectedUploadUrl = (value: string) => {
    if (value.startsWith('/uploads/')) {
      return `/api${value}`;
    }

    return value;
  };

  const normalizedUrl = normalizeProtectedUploadUrl(url);

  if (normalizedUrl.startsWith('/')) {
    return `${getApiOrigin()}${normalizedUrl}`;
  }

  return `${getApiOrigin()}/${normalizedUrl}`;
};

export const handleBrokenImage = (event: React.SyntheticEvent<HTMLImageElement>, fallbackSeed: string | number) => {
  const image = event.currentTarget;
  const fallback = getProductFallbackImage(fallbackSeed);
  if (image.src !== fallback) {
    image.src = fallback;
  }
};
