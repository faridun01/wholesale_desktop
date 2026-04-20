const BRAND_PATTERN = /\bskif\b/iu;
const QUOTED_BRAND_PATTERN = /[«»"“”„‟']\s*([^«»"“”„‟'](?:.*?[^«»"“”„‟'])?)\s*[«»"“”„‟']/u;
const PACKAGING_PATTERN =
  /(?:(\d+(?:[.,]\d+)?)\s*)?(меш(?:ок|ка|ков)?|короб(?:ка|ки|ок)?|упаков(?:ка|ки|ок)?|пач(?:ка|ки|ек)?|блок(?:а|ов)?)[\s-]*(\d+)\s*(шт|штук|пач(?:ка|ки|ек)?|флакон(?:а|ов)?|емкост(?:ь|и|ей)|ёмкост(?:ь|и|ей)|бут(?:ылка|ылки|ылок)?|бан(?:ка|ки|ок)?)/iu;

const UNIT_ALIASES: Record<string, string> = {
  штук: 'шт',
  штука: 'шт',
  штуки: 'шт',
  шт: 'шт',
  пачка: 'пачка',
  пачки: 'пачка',
  пачек: 'пачка',
  флакон: 'флакон',
  флакона: 'флакон',
  флаконов: 'флакон',
  емкость: 'ёмкость',
  емкости: 'ёмкость',
  емкостей: 'ёмкость',
  ёмкость: 'ёмкость',
  ёмкости: 'ёмкость',
  ёмкостей: 'ёмкость',
  бутылка: 'бутылка',
  бутылки: 'бутылка',
  бутылок: 'бутылка',
  банка: 'банка',
  банки: 'банка',
  банок: 'банка',
};

const PACKAGE_ALIASES: Record<string, string> = {
  мешок: 'мешок',
  мешка: 'мешок',
  мешков: 'мешок',
  коробка: 'коробка',
  коробки: 'коробка',
  коробок: 'коробка',
  упаковка: 'упаковка',
  упаковки: 'упаковка',
  упаковок: 'упаковка',
  пачка: 'пачка',
  пачки: 'пачка',
  пачек: 'пачка',
  блок: 'блок',
  блока: 'блок',
  блоков: 'блок',
};

const normalizeSpacing = (value: string) =>
  value
    .replace(/(\d)\s*[.,]\s*(\d)/gu, '$1.$2')
    .replace(/(\d)\s+(\d)(?=\s*(?:гр|г|кг|л|мл|шт)\b)/giu, '$1.$2')
    .replace(/\s+/g, ' ')
    .trim();

const stripQuotes = (value: string) => value.replace(/[«»"“”„‟']/gu, '');

export function extractBrand(raw: string) {
  const source = String(raw || '').trim();
  const quotedMatch = source.match(QUOTED_BRAND_PATTERN);
  if (quotedMatch?.[1]) {
    return normalizeSpacing(quotedMatch[1]);
  }

  const normalized = stripQuotes(source).trim();
  const match = normalized.match(BRAND_PATTERN);
  return match ? match[0].toUpperCase() : null;
}

export function normalizeBaseUnitName(unit: string | null | undefined) {
  const normalized = stripQuotes(String(unit || ''))
    .trim()
    .toLowerCase()
    .replace(/ё/gu, 'е');

  return UNIT_ALIASES[normalized] || normalized || 'шт';
}

export function normalizePackageName(value: string | null | undefined) {
  const normalized = stripQuotes(String(value || ''))
    .trim()
    .toLowerCase()
    .replace(/ё/gu, 'е');

  return PACKAGE_ALIASES[normalized] || normalized || '';
}

export function normalizeProductName(raw: string) {
  const source = normalizeSpacing(String(raw || ''));
  const brand = extractBrand(source);
  const withoutQuotes = stripQuotes(source);
  const withoutBracketPackaging = withoutQuotes.replace(/\([^)]*\)/gu, ' ');
  const withoutTrailingPackaging = withoutBracketPackaging
    .replace(/\/\s*[^/]*$/u, ' ')
    .replace(/\/\s*\d+(?:[.,]\d+)?\s*(шт|штук|пач(?:ка|ки|ек)?|флакон(?:а|ов)?|емкост(?:ь|и|ей)|ёмкост(?:ь|и|ей))\b/giu, ' ')
    .replace(PACKAGING_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    name: withoutTrailingPackaging,
    rawName: source,
    brand,
    nameKey: buildProductNameKey(withoutTrailingPackaging),
  };
}

export function buildProductNameKey(name: string) {
  return normalizeSpacing(stripQuotes(String(name || '')))
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ё]/gu, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

export function parsePackagingFromRawName(raw: string) {
  const source = normalizeSpacing(stripQuotes(String(raw || '')));
  const match = source.match(PACKAGING_PATTERN);

  if (!match) {
    return null;
  }

  return {
    packageName: normalizePackageName(match[2]),
    baseUnitName: normalizeBaseUnitName(match[4]),
    unitsPerPackage: Number(match[3]),
  };
}

export function formatQuantityForInvoice(input: {
  packageQuantity?: number | null;
  extraUnitQuantity?: number | null;
  packageName?: string | null;
  baseUnitName?: string | null;
  totalBaseUnits?: number | null;
}) {
  const packageQuantity = Number(input.packageQuantity || 0);
  const extraUnitQuantity = Number(input.extraUnitQuantity || 0);
  const baseUnitName = normalizeBaseUnitName(input.baseUnitName);
  const packageName = normalizePackageName(input.packageName);

  if (packageQuantity > 0 && packageName) {
    if (extraUnitQuantity > 0) {
      return `${packageQuantity} ${packageName} + ${extraUnitQuantity} ${baseUnitName}`;
    }

    return `${packageQuantity} ${packageName}`;
  }

  if (Number(input.totalBaseUnits || 0) > 0) {
    return `${Number(input.totalBaseUnits || 0)} ${baseUnitName}`;
  }

  return `${extraUnitQuantity} ${baseUnitName}`;
}

export function calculateEffectiveCostPrice(purchaseCostPrice: number, expensePercent: number) {
  const purchase = Number(purchaseCostPrice || 0);
  const percent = Number(expensePercent || 0);
  if (!Number.isFinite(purchase) || purchase < 0) {
    return 0;
  }
  if (!Number.isFinite(percent) || percent < 0) {
    return purchase;
  }

  return purchase + (purchase * percent / 100);
}
