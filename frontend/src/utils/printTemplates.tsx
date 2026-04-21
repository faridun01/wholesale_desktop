
import { formatMoney } from './format';

export const generateTorg12Html = (invoice: any) => {
  const today = new Date().toLocaleDateString('ru-RU');
  const items = invoice.items || [];
  
  const totalQty = items.reduce((sum: number, i: any) => sum + Number(i.quantity), 0);
  const totalAmount = Number(invoice.netAmount || 0);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>ТОРГ-12 №${invoice.id}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 10px; margin: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid black; padding: 4px; text-align: left; }
        .no-border { border: none !important; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-bold { font-weight: bold; }
        .header-table td { border: none; padding: 2px; }
        .title { font-size: 14px; font-weight: bold; border-bottom: 2px solid black; margin-bottom: 10px; padding-bottom: 5px; }
        .stamp-box { height: 60px; border: 1px solid #ccc; margin-top: 10px; }
      </style>
    </head>
    <body>
      <div class="text-right">Унифицированная форма № ТОРГ-12<br>Утверждена постановлением Госкомстата России от 25.12.98 № 132</div>
      
      <table class="header-table" style="margin-top: 20px;">
        <tr>
          <td width="15%" class="font-bold">Грузоотправитель:</td>
          <td>Wholesale CRM Systems, Таджикистан, г. Душанбе</td>
        </tr>
        <tr>
          <td class="font-bold">Грузополучатель:</td>
          <td>${invoice.customerNameSnapshot || invoice.customer?.name}, Тел: ${invoice.customerPhoneSnapshot || ''}</td>
        </tr>
        <tr>
          <td class="font-bold">Поставщик:</td>
          <td>Wholesale CRM Systems</td>
        </tr>
        <tr>
          <td class="font-bold">Плательщик:</td>
          <td>${invoice.customerNameSnapshot || invoice.customer?.name}</td>
        </tr>
        <tr>
          <td class="font-bold">Основание:</td>
          <td>Основной договор</td>
        </tr>
      </table>

      <div class="title" style="margin-top: 20px;">ТОВАРНАЯ НАКЛАДНАЯ № ${invoice.id} от ${new Date(invoice.createdAt).toLocaleDateString('ru-RU')} г.</div>

      <table>
        <thead>
          <tr>
            <th rowspan="2" class="text-center">№</th>
            <th rowspan="2" class="text-center">Наименование, характеристика, сорт, артикул товара</th>
            <th colspan="2" class="text-center">Единица измерения</th>
            <th rowspan="2" class="text-center">Количество</th>
            <th rowspan="2" class="text-center">Цена, руб. коп.</th>
            <th rowspan="2" class="text-center">Сумма без учета НДС, руб. коп.</th>
            <th colspan="2" class="text-center">НДС</th>
            <th rowspan="2" class="text-center">Сумма с учетом НДС, руб. коп.</th>
          </tr>
          <tr>
            <th class="text-center">наим.</th>
            <th class="text-center">код</th>
            <th class="text-center">ставка, %</th>
            <th class="text-center">сумма, руб. коп.</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item: any, i: number) => `
            <tr>
              <td class="text-center">${i + 1}</td>
              <td>${item.productNameSnapshot || item.product?.name}</td>
              <td class="text-center">${item.baseUnitNameSnapshot || item.unit || 'шт'}</td>
              <td class="text-center">796</td>
              <td class="text-right">${item.quantity}</td>
              <td class="text-right">${formatMoney(item.sellingPrice)}</td>
              <td class="text-right">${formatMoney(item.totalPrice || item.sellingPrice * item.quantity)}</td>
              <td class="text-center">0%</td>
              <td class="text-right">0.00</td>
              <td class="text-right">${formatMoney(item.totalPrice || item.sellingPrice * item.quantity)}</td>
            </tr>
          `).join('')}
          <tr class="font-bold">
            <td colspan="4" class="text-right">Итого</td>
            <td class="text-right">${totalQty}</td>
            <td>X</td>
            <td class="text-right">${formatMoney(totalAmount)}</td>
            <td>X</td>
            <td class="text-right">0.00</td>
            <td class="text-right">${formatMoney(totalAmount)}</td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top: 20px;">
        Всего отпущено <b>${items.length}</b> наименований на сумму <b>${formatMoney(totalAmount)}</b>.
      </div>

      <div style="margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
        <div>
          <div class="font-bold">Отпуск груза произвел:</div>
          <div style="border-bottom: 1px solid black; margin-top: 20px;"></div>
          <div class="text-center" style="font-size: 8px;">(должность, подпись, расшифровка)</div>
          <div style="margin-top: 10px;">М.П.</div>
        </div>
        <div>
          <div class="font-bold">Груз получил:</div>
          <div style="border-bottom: 1px solid black; margin-top: 20px;"></div>
          <div class="text-center" style="font-size: 8px;">(должность, подпись, расшифровка)</div>
          <div style="margin-top: 10px;">М.П.</div>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const generateReceiptHtml = (invoice: any) => {
  const items = invoice.items || [];
  const totalAmount = Number(invoice.netAmount || 0);
  const paidAmount = Number(invoice.paidAmount || 0);
  const change = Math.max(0, paidAmount - totalAmount);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Чек №${invoice.id}</title>
      <style>
        body { font-family: 'Courier New', Courier, monospace; font-size: 12px; width: 80mm; margin: 0 auto; padding: 10px; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .dashed { border-top: 1px dashed black; margin: 5px 0; }
        .bold { font-weight: bold; }
        table { width: 100%; border-collapse: collapse; }
      </style>
    </head>
    <body>
      <div class="text-center bold">Wholesale CRM Systems</div>
      <div class="text-center">Таджикистан, г. Душанбе</div>
      <div class="dashed"></div>
      <div class="text-center bold">КАССОВЫЙ ЧЕК №${invoice.id}</div>
      <div class="text-center">${new Date(invoice.createdAt).toLocaleString('ru-RU')}</div>
      <div class="dashed"></div>
      
      <table>
        ${items.map((item: any) => `
          <tr>
            <td colspan="2">${item.productNameSnapshot || item.product?.name}</td>
          </tr>
          <tr>
            <td style="font-size: 10px;">${item.quantity} x ${formatMoney(item.sellingPrice)}</td>
            <td class="text-right bold">${formatMoney(item.totalPrice || item.sellingPrice * item.quantity)}</td>
          </tr>
        `).join('')}
      </table>

      <div class="dashed"></div>
      <div class="bold" style="font-size: 16px; display: flex; justify-content: space-between;">
        <span>ИТОГО:</span>
        <span>${formatMoney(totalAmount)}</span>
      </div>
      <div class="dashed"></div>
      
      <div style="display: flex; justify-content: space-between;">
        <span>ПРИНЯТО:</span>
        <span>${formatMoney(paidAmount)}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>СДАЧА:</span>
        <span>${formatMoney(change)}</span>
      </div>

      <div class="dashed"></div>
      <div class="text-center">СПАСИБО ЗА ПОКУПКУ!</div>
      <div class="text-center">ЖДЕМ ВАС СНОВА</div>
      <div class="dashed" style="margin-top: 20px;"></div>
    </body>
    </html>
  `;
};

export const generateReconciliationHtml = (customer: any, events: any[]) => {
  const today = new Date().toLocaleDateString('ru-RU');
  const totalDebit = events.filter(e => e.side === 'debit').reduce((sum, e) => sum + e.amount, 0);
  const totalCredit = events.filter(e => e.side === 'credit').reduce((sum, e) => sum + e.amount, 0);
  const finalBalance = totalDebit - totalCredit;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Акт сверки - ${customer.name}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; margin: 30px; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid black; padding-bottom: 10px; }
        .title { font-size: 16px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid black; padding: 6px; }
        th { background: #f2f2f2; font-weight: bold; }
        .text-right { text-align: right; }
        .font-bold { font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">Акт сверки взаиморасчетов</div>
        <div>по состоянию на ${today}</div>
      </div>
      
      <div style="margin-bottom: 20px;">
        <div><b>Организация:</b> Wholesale CRM Systems</div>
        <div><b>Контрагент:</b> ${customer.name}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th width="30">№</th>
            <th width="80">Дата</th>
            <th>Документ</th>
            <th width="100">Дебет</th>
            <th width="100">Кредит</th>
            <th width="100">Сальдо</th>
          </tr>
        </thead>
        <tbody>
          ${events.map((e, i) => `
            <tr>
              <td class="text-center">${i + 1}</td>
              <td>${new Date(e.date).toLocaleDateString('ru-RU')}</td>
              <td>${e.description}</td>
              <td class="text-right">${e.side === 'debit' ? formatMoney(e.amount) : ''}</td>
              <td class="text-right">${e.side === 'credit' ? formatMoney(e.amount) : ''}</td>
              <td class="text-right font-bold">${formatMoney(e.runningBalance)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="font-bold">
            <td colspan="3" class="text-right">ИТОГО:</td>
            <td class="text-right">${formatMoney(totalDebit)}</td>
            <td class="text-right">${formatMoney(totalCredit)}</td>
            <td class="text-right">${formatMoney(finalBalance)}</td>
          </tr>
        </tfoot>
      </table>

      <div style="margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
        <div>
          <div class="font-bold">От Организации</div>
          <div style="border-bottom: 1px solid black; margin-top: 30px;"></div>
          <div style="margin-top: 5px;">М.П.</div>
        </div>
        <div>
          <div class="font-bold">От Контрагента</div>
          <div style="border-bottom: 1px solid black; margin-top: 30px;"></div>
          <div style="margin-top: 5px;">М.П.</div>
        </div>
      </div>
    </body>
    </html>
  `;
};
