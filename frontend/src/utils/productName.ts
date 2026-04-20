export function formatProductName(value: unknown) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return '';
  }

  return normalized
    .replace(/[«»“”„‟"]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
