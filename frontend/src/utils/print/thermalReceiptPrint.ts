import { formatMoney } from '../format';
import { formatProductName } from '../productName';
import { openDocumentPreview } from './openDocumentPreview';

export function printThermalReceipt(invoice: any) {
  if (typeof window === 'undefined' || !invoice) return;

  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const date = new Date(invoice.createdAt).toLocaleString('ru-RU');

  const itemsHtml = items.map((item: any) => `
    <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px;">
      <div style="flex: 1; padding-right: 4px;">${formatProductName(item.product_name)}</div>
      <div style="white-space: nowrap;">${item.quantity} x ${formatMoney(item.sellingPrice)}</div>
    </div>
  `).join('');

  const html = `
    <html>
      <head>
        <style>
          body { font-family: 'Courier New', Courier, monospace; width: 280px; padding: 10px; margin: 0; }
          .center { text-align: center; }
          .header { font-weight: bold; font-size: 14px; margin-bottom: 5px; }
          .divider { border-bottom: 1px dashed #000; margin: 10px 0; }
          .total { font-weight: bold; font-size: 14px; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="center header">${invoice.company_name || 'МЫ - ОПТ'}</div>
        <div class="center" style="font-size: 10px;">КАССОВЫЙ ЧЕК №${invoice.id}</div>
        <div class="center" style="font-size: 9px;">${date}</div>
        <div class="divider"></div>
        ${itemsHtml}
        <div class="divider"></div>
        <div class="total">
          <span>ИТОГО:</span>
          <span>${formatMoney(invoice.netAmount || invoice.totalAmount || 0)}</span>
        </div>
        <div style="font-size: 10px; margin-top: 5px;">
           Оплачено: ${formatMoney(invoice.paidAmount || 0)}
        </div>
        <div class="divider"></div>
        <div class="center" style="font-size: 10px;">СПАСИБО ЗА ПОКУПКУ!</div>
      </body>
    </html>
  `;

  openDocumentPreview(`Чек №${invoice.id}`, html, 'receipt');
}
