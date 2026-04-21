import { formatMoney, roundMoney, ceilMoney } from '../format';
import { formatProductName } from '../productName';
import { openDocumentPreview } from './openDocumentPreview';

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeAddressLine = (value: unknown) =>
  String(value ?? '')
    .split(/\r?\n/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

const formatMoneyWithoutCurrency = (value: unknown) => formatMoney(value, '').trim();
const roundMoneyValue = (value: number) => roundMoney(value);

const splitAddressLines = (value: unknown) => {
  const parts = normalizeAddressLine(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return {
      primary: parts[0] || '',
      secondary: '',
    };
  }

  if (parts.length === 2) {
    return {
      primary: parts[0],
      secondary: parts[1],
    };
  }

  return {
    primary: parts.slice(0, 2).join(', '),
    secondary: parts.slice(2).join(', '),
  };
};

interface SalesInvoicePrintOptions {
  invoice: any;
  statusLabel: string;
  subtotal: number;
  discountAmount: number;
  netAmount: number;
  balanceAmount: number;
  changeAmount: number;
  appliedPaidAmount: number;
}

export function printSalesInvoice({
  invoice,
  subtotal,
  discountAmount,
  netAmount: _netAmount,
}: SalesInvoicePrintOptions) {
  if (typeof window === 'undefined' || !invoice) {
    return { ok: false, reason: 'invalid' as const };
  }


  const customerName = invoice.customer_name || 'Обычный клиент';
  const customerPhone = invoice.customer_phone || '';
  const customerAddress = splitAddressLines(invoice.customer_address || '');
  const sellerRegionLine = [invoice.company_country, invoice.company_region].filter(Boolean).join(', ');
  const sellerCityLine = [invoice.company_city, invoice.company_address].filter(Boolean).join(', ');
  const invoiceDateLabel = new Date(invoice.createdAt).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const invoiceItems = Array.isArray(invoice.items) ? invoice.items : [];
  const fallbackSubtotal = Math.max(0, Number(subtotal || 0));
  const fallbackDiscountAmount = Math.max(0, Number(discountAmount || 0));

  const getDisplayPrice = (item: any) => {
    const sellingPricePerUnit = Number(item.sellingPrice || 0);
    const packageQuantity = Number(item.packageQuantity || 0);
    const unitsPerPackage = Number(item.unitsPerPackageSnapshot || item.unitsPerPackage || 0);

    if (packageQuantity > 0 && unitsPerPackage > 0) {
      return sellingPricePerUnit * unitsPerPackage;
    }

    return sellingPricePerUnit;
  };

  const getCurrentUnitPrice = (item: any) => Number(item.sellingPrice || 0);
  const getUnitPrice = (item: any) => {
    const explicitOriginalPrice = Number(
      item?.originalSellingPrice ?? item?.originalUnitPrice ?? item?.sellingPriceBeforeDiscount ?? item?.listPrice,
    );
    if (Number.isFinite(explicitOriginalPrice) && explicitOriginalPrice > 0) {
      return explicitOriginalPrice;
    }

    const snapshotProductPrice = Number(item?.product?.sellingPrice);
    if (Number.isFinite(snapshotProductPrice) && snapshotProductPrice > 0) {
      return snapshotProductPrice;
    }

    const currentPrice = getCurrentUnitPrice(item);
    const lineDiscountPercent = Number(item?.lineDiscountPercent ?? item?.discountPercent ?? item?.discount ?? 0);
    if (Number.isFinite(lineDiscountPercent) && lineDiscountPercent > 0 && lineDiscountPercent < 100) {
      return currentPrice; // Wait, if currentPrice is ALREADY discounted in DB, then Original is current / (1 - d/100)
    }

    return currentPrice;
  };
  const getDiscountedUnitPrice = (item: any) => {
    const originalPrice = getUnitPrice(item);
    const lineDiscountPercent = Number(item?.lineDiscountPercent ?? item?.discountPercent ?? item?.discount ?? 0);
    if (lineDiscountPercent > 0) {
      return ceilMoney(originalPrice * (1 - lineDiscountPercent / 100));
    }
    return getCurrentUnitPrice(item);
  };
  const getItemBaseUnits = (item: any) => {
    const totalBaseUnits = Number(item?.totalBaseUnits);
    if (Number.isFinite(totalBaseUnits) && totalBaseUnits > 0) {
      return totalBaseUnits;
    }

    const quantity = Number(item?.quantity);
    if (Number.isFinite(quantity) && quantity > 0) {
      return quantity;
    }

    const unitsPerPackage = Number(item?.unitsPerPackageSnapshot ?? item?.unitsPerPackage ?? 0);
    const packageQuantity = Number(item?.packageQuantity ?? 0);
    const extraUnitQuantity = Number(item?.extraUnitQuantity ?? 0);
    if (unitsPerPackage > 0 && packageQuantity > 0) {
      return packageQuantity * unitsPerPackage + Math.max(0, extraUnitQuantity);
    }

    return 0;
  };
  const invoiceDiscountPercent = Math.max(0, Number(invoice?.discount || 0));
  const getLineTotalAfterFinalDiscount = (item: any) => {
    const lineTotalBeforeGlobal = roundMoneyValue(getItemBaseUnits(item) * getDiscountedUnitPrice(item));
    if (invoiceDiscountPercent > 0) {
      return roundMoneyValue(lineTotalBeforeGlobal * (1 - invoiceDiscountPercent / 100));
    }
    return lineTotalBeforeGlobal;
  };
  const getFinalUnitPrice = (item: any) => {
    const qty = getItemBaseUnits(item);
    if (qty > 0) {
      return getLineTotalAfterFinalDiscount(item) / qty;
    }
    return getDiscountedUnitPrice(item);
  };
  const hasLineDiscount = (item: any) => {
    const originalUnitPrice = Number(getUnitPrice(item));
    const finalUnitPrice = Number(getFinalUnitPrice(item));

    if (!Number.isFinite(originalUnitPrice) || !Number.isFinite(finalUnitPrice)) {
      return false;
    }

    return originalUnitPrice - finalUnitPrice > 0.0001;
  };
  const hasLineDiscountItems = invoiceItems.some(hasLineDiscount);
  const hasPriceAfterDiscountColumn = hasLineDiscountItems || invoiceDiscountPercent > 0;
  const subtotalBeforeDiscountFromItems = roundMoneyValue(
    invoiceItems.reduce((sum: number, item: any) => sum + getItemBaseUnits(item) * getUnitPrice(item), 0),
  );
  const netAmountFromItems = roundMoneyValue(
    invoiceItems.reduce((sum: number, item: any) => sum + getLineTotalAfterFinalDiscount(item), 0),
  );
  const subtotalBeforeDiscount = invoiceItems.length > 0 ? subtotalBeforeDiscountFromItems : fallbackSubtotal;
  const amountAfterDiscount = invoiceItems.length > 0 ? netAmountFromItems : roundMoneyValue(fallbackSubtotal - fallbackDiscountAmount);
  const totalDiscountAmount = roundMoneyValue(Math.max(0, subtotalBeforeDiscount - amountAfterDiscount));
  const returnedAmount = Math.max(0, Number(invoice.returnedAmount || 0));
  const finalTotalAmount = roundMoneyValue(Math.max(0, amountAfterDiscount - returnedAmount));
  const paidAmount = Math.max(0, Number(invoice.paidAmount || 0));
  const balanceDue = roundMoneyValue(Math.max(0, finalTotalAmount - paidAmount));
  const discountLabel = 'Скидка';

  const getQuantityLabel = (item: any) => {
    const packageQuantity = Number(item.packageQuantity || 0);
    const extraUnitQuantity = Number(item.extraUnitQuantity || 0);
    const unitsPerPackage = Number(item.unitsPerPackageSnapshot || item.unitsPerPackage || 0);
    const packageName = String(item.packageNameSnapshot || item.packageName || '').trim();
    const baseUnitName = 'шт';
    const quantity = Number(item.quantity || 0);

    if (packageQuantity > 0 && packageName) {
      const primaryLine =
        extraUnitQuantity > 0
          ? `${packageQuantity} ${packageName} + ${extraUnitQuantity} ${baseUnitName}`
          : `${packageQuantity} ${packageName}`;
      const lines = [primaryLine];

      if (unitsPerPackage > 0) {
        lines.push(`${packageQuantity * unitsPerPackage} ${baseUnitName} в ${packageName}`);
      }

      return lines;
    }

    return [`${quantity} ${baseUnitName}`];
  };

  const itemsRows = invoiceItems
        .map(
          (item: any, index: number) => `
            <tr>
              <td class="num-cell">${index + 1}</td>
              <td class="product-cell"><span class="product-name">${escapeHtml(formatProductName(item.product_name || item.productNameSnapshot || item.product_name_snapshot))}</span></td>
              <td class="quantity-cell">${getQuantityLabel(item)
                .map((line) => `<span class="quantity-line">${escapeHtml(line)}</span>`)
                .join('')}</td>
              <td class="num-cell">${escapeHtml(formatMoneyWithoutCurrency(getDisplayPrice(item)))}</td>
              <td class="num-cell">${escapeHtml(formatMoneyWithoutCurrency(getUnitPrice(item)))}</td>
              ${hasPriceAfterDiscountColumn 
                ? `<td class="num-cell">${escapeHtml(formatMoneyWithoutCurrency(getFinalUnitPrice(item)))}</td>` 
                : ''}
              <td class="num-cell">${escapeHtml(formatMoneyWithoutCurrency(getLineTotalAfterFinalDiscount(item)))}</td>
            </tr>
          `,
        )
        .join('');

  const html = `
    <!doctype html>
    <html lang="ru">
      <head>
        <meta charset="utf-8" />
        <title>Накладная</title>
        <style>
          @page { size: A4 portrait; margin: 7mm; }
          * { box-sizing: border-box; }
          body { margin: 0; padding: 6px; font-family: Arial, sans-serif; color: #0f172a; background: #ffffff; }
          .sheet { max-width: 920px; margin: 0 auto; }
          .doc-title { text-align: center; border-bottom: 1px solid #d9e3ef; padding-bottom: 8px; margin-bottom: 8px; }
          .doc-title-text {
            margin: 0;
            font-family: Georgia, "Times New Roman", serif;
            font-size: 22px;
            font-weight: 700;
            letter-spacing: 0.02em;
          }
          .doc-title-date {
            margin: 5px 0 0;
            font-family: Georgia, "Times New Roman", serif;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.03em;
            color: #334155;
          }
          .header { display: flex; justify-content: space-between; align-items: stretch; gap: 16px; margin-bottom: 8px; }
          .party-block { min-width: 0; border: none; border-radius: 0; padding: 6px 0; background: transparent; }
          .seller-block { flex: 1; }
          .client-block { width: 235px; margin-left: auto; text-align: left; }
          .label { margin: 0 0 3px; color: #64748b; font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.07em; font-weight: 700; }
          .party-name { margin: 0; font-size: 11px; font-weight: 700; line-height: 1.1; color: #0f172a; }
          .party-line { margin: 1px 0 0; color: #334155; font-size: 8.5px; line-height: 1.1; }
          .section { margin-top: 8px; border-top: 3px solid #0f172a; padding-top: 6px; }
          .section h3 { margin: 0 0 4px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.07em; color: #1e3a8a; font-weight: 800; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th, td { border: 2px solid #0f172a; padding: 3px 4px; font-size: 8.5px; text-align: left; vertical-align: top; line-height: 1.05; font-weight: 700; }
          th { background: #ffffff; font-weight: 800; font-size: 8px; color: #111827; }
          .num-cell { text-align: center; vertical-align: middle; }
          .col-number { width: 28px; }
          .col-product { width: 292px; }
          .col-quantity { width: 78px; }
          .col-package-price { width: 74px; }
          .col-unit-price { width: 70px; }
          .col-discounted-price { width: 70px; }
          .col-total { width: 70px; }
          .product-cell { width: 292px; }
          .has-discount-column .col-number { width: 24px; }
          .has-discount-column .col-product { width: 236px; }
          .has-discount-column .product-cell { width: 236px; }
          .has-discount-column .col-quantity { width: 72px; }
          .has-discount-column .col-package-price { width: 62px; }
          .has-discount-column .col-unit-price { width: 62px; }
          .has-discount-column .col-discounted-price { width: 68px; }
          .has-discount-column .col-total { width: 62px; }
          .product-name {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            line-height: 1.08;
            max-height: 2.16em;
            overflow: hidden;
            word-break: break-word;
            font-size: 8.4px;
          }
          .quantity-cell { line-height: 1.1; }
          .quantity-line { display: block; }
          .quantity-line + .quantity-line { margin-top: 1px; font-size: 7.4px; color: #475569; }
          .summary { margin-left: auto; margin-top: 6px; width: 220px; }
          .summary-row { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; border-bottom: 2px solid #0f172a; font-size: 9px; font-weight: 700; }
          .summary-row.total { font-size: 10.5px; font-weight: 800; margin-top: 2px; padding-top: 4px; }
          @media print {
            body { padding: 0; }
            .sheet { max-width: none; }
          }
        </style>
      </head>
      <body>
        <div class="sheet ${hasPriceAfterDiscountColumn ? 'has-discount-column' : ''}">
          <div class="doc-title">
            <p class="doc-title-text">Накладная №${invoice.id}</p>
            <p class="doc-title-date">${escapeHtml(invoiceDateLabel)}</p>
          </div>
          <div class="header">
            <div class="party-block seller-block">
              <p class="label">ПРОДАВЕЦ</p>
              ${invoice.company_name ? `<p class="party-name">${escapeHtml(invoice.company_name)}</p>` : ''}
              ${sellerRegionLine ? `<p class="party-line">${escapeHtml(sellerRegionLine)}</p>` : ''}
              ${sellerCityLine ? `<p class="party-line">${escapeHtml(sellerCityLine)}</p>` : ''}
              ${invoice.company_phone ? `<p class="party-line">${escapeHtml(invoice.company_phone)}</p>` : ''}
            </div>
            <div class="party-block client-block">
              <p class="label">Клиент</p>
              <p class="party-name">${escapeHtml(customerName)}</p>
              ${customerAddress.primary ? `<p class="party-line">${escapeHtml(customerAddress.primary)}</p>` : ''}
              ${customerAddress.secondary ? `<p class="party-line">${escapeHtml(customerAddress.secondary)}</p>` : ''}
              ${customerPhone ? `<p class="party-line">Тел: ${escapeHtml(customerPhone)}</p>` : ''}
            </div>
          </div>

          <div class="section">
          <br />
            <table>
              <thead>
                <tr>
                  <th class="col-number">№</th>
                  <th class="col-product">Товар</th>
                  <th class="col-quantity">Количество</th>
                  <th class="col-package-price">Цена за упаковку</th>
                  <th class="col-unit-price">Цена за штуку</th>
                  ${hasPriceAfterDiscountColumn ? '<th class="col-discounted-price">&#1062;&#1077;&#1085;&#1072; &#1087;&#1086;&#1089;&#1083;&#1077; &#1089;&#1082;&#1080;&#1076;&#1082;&#1080;</th>' : ''}
                  <th class="col-total">Сумма</th>
                </tr>
              </thead>
              <tbody>${itemsRows}</tbody>
            </table>
          </div>

          <div class="summary">
            <div class="summary-row"><span>Сумма до скидки</span><strong>${escapeHtml(formatMoneyWithoutCurrency(subtotalBeforeDiscount))}</strong></div>
            <div class="summary-row"><span>${escapeHtml(discountLabel)}</span><strong>-${escapeHtml(formatMoneyWithoutCurrency(totalDiscountAmount))}</strong></div>
            <div class="summary-row"><span>Сумма после скидки</span><strong>${escapeHtml(formatMoneyWithoutCurrency(amountAfterDiscount))}</strong></div>
            ${returnedAmount > 0 ? `<div class="summary-row"><span>Возвращено</span><strong>-${escapeHtml(formatMoneyWithoutCurrency(returnedAmount))}</strong></div>` : ''}
            ${paidAmount > 0 ? `<div class="summary-row"><span>Оплачено</span><strong>-${escapeHtml(formatMoneyWithoutCurrency(paidAmount))}</strong></div>` : ''}
            <div class="summary-row total"><span>Итого</span><span>${escapeHtml(formatMoneyWithoutCurrency(paidAmount > 0 ? balanceDue : finalTotalAmount))}</span></div>
          </div>
        </div>
      </body>
    </html>
  `;

  return openDocumentPreview(`Накладная №${invoice.id}`, html, 'a4');
}

