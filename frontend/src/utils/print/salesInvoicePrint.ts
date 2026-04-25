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

    return getCurrentUnitPrice(item);
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
    const totalBaseUnits = Number(item?.totalBaseUnits ?? item?.quantity ?? 0);
    return totalBaseUnits;
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

  const getQuantityLabel = (item: any) => {
    const packageQuantity = Number(item.packageQuantity || 0);
    const extraUnitQuantity = Number(item.extraUnitQuantity || 0);
    const packageName = String(item.packageNameSnapshot || item.packageName || '').trim();
    const baseUnitName = 'шт';
    const quantity = Number(item.quantity || 0);

    if (packageQuantity > 0 && packageName) {
      return [`${packageQuantity} ${packageName}${extraUnitQuantity > 0 ? ` + ${extraUnitQuantity} ${baseUnitName}` : ''}`];
    }
    return [`${quantity} ${baseUnitName}`];
  };

  const itemsRows = invoiceItems
    .map(
      (item: any, index: number) => `
        <tr>
          <td class="num-cell">${index + 1}</td>
          <td class="product-cell"><span class="product-name">${escapeHtml(formatProductName(item.product_name || item.productNameSnapshot))}</span></td>
          <td class="quantity-cell">${getQuantityLabel(item).map(line => `<span class="quantity-line">${escapeHtml(line)}</span>`).join('')}</td>
          <td class="num-cell">${escapeHtml(formatMoneyWithoutCurrency(getUnitPrice(item)))}</td>
          ${hasPriceAfterDiscountColumn ? `<td class="num-cell">${escapeHtml(formatMoneyWithoutCurrency(getFinalUnitPrice(item)))}</td>` : ''}
          <td class="num-cell">${escapeHtml(formatMoneyWithoutCurrency(getLineTotalAfterFinalDiscount(item)))}</td>
        </tr>
      `
    )
    .join('');

  const html = `
    <!doctype html>
    <html lang="ru">
      <head>
        <meta charset="utf-8" />
        <title>Накладная №${invoice.id}</title>
        <style>
          @page { size: A4 portrait; margin: 7mm; }
          * { box-sizing: border-box; }
          body { margin: 0; padding: 6px; font-family: Arial, sans-serif; color: #0f172a; background: #ffffff; }
          .sheet { max-width: 920px; margin: 0 auto; }
          .doc-title { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
          .doc-title-text { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.02em; }
          .doc-title-date { margin: 5px 0 0; font-size: 11px; font-weight: 600; color: #334155; }
          .doc-header-1c { margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
          .header-row { display: flex; margin-bottom: 4px; font-size: 11px; line-height: 1.4; }
          .header-label { width: 100px; font-weight: 400; flex-shrink: 0; }
          .header-value { flex: 1; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #0f172a; padding: 6px; font-size: 10px; text-align: left; }
          th { background: #f1f5f9; font-weight: 800; text-transform: uppercase; font-size: 8px; }
          .num-cell { text-align: right; white-space: nowrap; }
          .summary { margin-left: auto; margin-top: 15px; width: 280px; }
          .summary-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #e2e8f0; font-size: 10px; }
          .summary-row.total { font-size: 14px; font-weight: 800; border-bottom: 3px double #0f172a; margin-top: 5px; padding-top: 8px; }
          .discount-val { color: #dc2626; font-weight: 700; }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="doc-title">
            <p class="doc-title-text">ТОВАРНАЯ НАКЛАДНАЯ №${invoice.id}</p>
            <p class="doc-title-date">от ${escapeHtml(invoiceDateLabel)} г.</p>
          </div>
          <div class="doc-header-1c">
            <div class="header-row">
              <span class="header-label">Поставщик:</span>
              <span class="header-value"><strong>${escapeHtml(invoice.company_name || 'Мэй Фу Душанбе')}</strong>${sellerRegionLine || sellerCityLine ? ', ' : ''}${escapeHtml([sellerRegionLine, sellerCityLine].filter(Boolean).join(', '))}</span>
            </div>
            <div class="header-row">
              <span class="header-label">Покупатель:</span>
              <span class="header-value"><strong>${escapeHtml(customerName)}</strong>${customerAddress.primary || customerAddress.secondary ? ', ' : ''}${escapeHtml([customerAddress.primary, customerAddress.secondary].filter(Boolean).join(', '))}${customerPhone ? ', тел: ' + escapeHtml(customerPhone) : ''}</span>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 40px">№</th>
                <th>Наименование товара</th>
                <th style="width: 100px">Кол-во</th>
                <th style="width: 90px">Цена</th>
                ${hasPriceAfterDiscountColumn ? '<th style="width: 90px">Цена со ск.</th>' : ''}
                <th style="width: 100px">Сумма</th>
              </tr>
            </thead>
            <tbody>${itemsRows}</tbody>
          </table>
          <div class="summary">
            <div class="summary-row"><span>Сумма без скидки:</span><span>${escapeHtml(formatMoneyWithoutCurrency(subtotalBeforeDiscount))}</span></div>
            ${totalDiscountAmount > 0.01 ? `<div class="summary-row"><span class="discount-val">Скидка:</span><span class="discount-val">-${escapeHtml(formatMoneyWithoutCurrency(totalDiscountAmount))}</span></div>` : ''}
            <div class="summary-row"><span>Итого за товары:</span><span>${escapeHtml(formatMoneyWithoutCurrency(amountAfterDiscount))}</span></div>
            ${returnedAmount > 0 ? `<div class="summary-row"><span>Возвращено:</span><span>-${escapeHtml(formatMoneyWithoutCurrency(returnedAmount))}</span></div>` : ''}
            <div class="summary-row total"><span>ИТОГО К ОПЛАТЕ:</span><span>${escapeHtml(formatMoneyWithoutCurrency(finalTotalAmount))}</span></div>
            ${paidAmount > 0 ? `
              <div class="summary-row" style="border-top: 1px solid #000; margin-top: 5px;"><span>Оплачено:</span><span>${escapeHtml(formatMoneyWithoutCurrency(paidAmount))}</span></div>
              <div class="summary-row" style="font-weight: 700;"><span>Остаток долга:</span><span>${escapeHtml(formatMoneyWithoutCurrency(balanceDue))}</span></div>
            ` : ''}
          </div>
          <div style="margin-top: 40px; display: flex; justify-content: space-between; font-size: 10px;">
            <div style="width: 200px; border-top: 1px solid #000; padding-top: 5px; text-align: center;">Отпустил (подпись)</div>
            <div style="width: 200px; border-top: 1px solid #000; padding-top: 5px; text-align: center;">Получил (подпись)</div>
          </div>
        </div>
      </body>
    </html>
  `;

  return openDocumentPreview(`Накладная №${invoice.id}`, html, 'a4');
}
