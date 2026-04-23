import { formatMoney } from '../format';
import { formatProductName } from '../productName';
import { openDocumentPreview } from './openDocumentPreview';

export function printThermalReceipt(invoice: any) {
  if (typeof window === 'undefined' || !invoice) return;

  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const date = new Date(invoice.createdAt).toLocaleString('ru-RU');
  const netAmount = Number(invoice.netAmount || invoice.totalAmount || 0);
  const totalBeforeDiscount = items.reduce((sum: number, i: any) => sum + Number(i.totalPrice || i.sellingPrice * i.quantity), 0);
  const discountAmount = totalBeforeDiscount - netAmount;
  const hasGlobalDiscount = Number(invoice.discount || 0) > 0;

  const itemsHtml = items.map((item: any) => {
    const itemTotal = Number(item.totalPrice || item.sellingPrice * item.quantity);
    const discountPercent = Number(item.discount || 0);
    
    return `
      <div style="margin-bottom: 5px;">
        <div style="font-size: 11px; font-weight: bold;">${formatProductName(item.product_name)}</div>
        <div style="display: flex; justify-content: space-between; font-size: 10px;">
          <span>${item.quantity} x ${formatMoney(item.sellingPrice)}</span>
          <span style="font-weight: bold;">${formatMoney(itemTotal)}</span>
        </div>
        ${discountPercent > 0 ? `
          <div style="text-align: right; font-size: 9px; font-style: italic; color: #444;">
            Скидка: ${discountPercent}%
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  const html = `
    <html>
      <head>
        <style>
          body { font-family: 'Courier New', Courier, monospace; width: 280px; padding: 10px; margin: 0; line-height: 1.2; }
          .center { text-align: center; }
          .header { font-weight: bold; font-size: 14px; margin-bottom: 5px; }
          .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
          .total { font-weight: bold; font-size: 16px; display: flex; justify-content: space-between; margin-top: 5px; }
          .summary-line { display: flex; justify-content: space-between; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="center header">${invoice.company_name || '3CLICK: СКЛАД'}</div>
        <div class="center" style="font-size: 10px;">КАССОВЫЙ ЧЕК №${invoice.id}</div>
        <div class="center" style="font-size: 9px;">${date}</div>
        <div class="divider"></div>
        ${itemsHtml}
        <div class="divider"></div>
        
        ${hasGlobalDiscount ? `
          <div class="summary-line">
            <span>СУММА БЕЗ СКИДКИ:</span>
            <span>${formatMoney(totalBeforeDiscount)}</span>
          </div>
          <div class="summary-line" style="color: #444;">
            <span>СКИДКА (${invoice.discount}%):</span>
            <span>-${formatMoney(discountAmount)}</span>
          </div>
        ` : ''}

        <div class="total">
          <span>ИТОГО:</span>
          <span>${formatMoney(netAmount)}</span>
        </div>
        
        <div class="divider"></div>
        <div class="summary-line">
           <span>ОПЛАЧЕНО:</span>
           <span>${formatMoney(invoice.paidAmount || 0)}</span>
        </div>
        ${(invoice.paidAmount || 0) > netAmount ? `
          <div class="summary-line">
             <span>СДАЧА:</span>
             <span>${formatMoney((invoice.paidAmount || 0) - netAmount)}</span>
          </div>
        ` : ''}
        
        <div class="divider"></div>
        <div class="center" style="font-size: 10px; font-weight: bold;">СПАСИБО ЗА ПОКУПКУ!</div>
        <div class="center" style="font-size: 9px; margin-top: 4px;">ЖДЕМ ВАС СНОВА</div>
        <div style="height: 20px;"></div>
      </body>
    </html>
  `;

  openDocumentPreview(`Чек №${invoice.id}`, html, 'receipt');
}
