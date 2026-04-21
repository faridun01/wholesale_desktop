
import { formatMoney } from './format';

export const printReconciliation = (customer: any, events: any[]) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const today = new Date().toLocaleDateString('ru-RU');
  
  const totalDebit = events.filter(e => e.side === 'debit').reduce((sum, e) => sum + e.amount, 0);
  const totalCredit = events.filter(e => e.side === 'credit').reduce((sum, e) => sum + e.amount, 0);
  const finalBalance = totalDebit - totalCredit;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Акт сверки - ${customer.name}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
        
        body {
          font-family: 'Roboto', sans-serif;
          font-size: 11px;
          line-height: 1.4;
          color: #333;
          margin: 40px;
        }
        
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #000;
          padding-bottom: 10px;
        }
        
        .title {
          font-size: 18px;
          font-weight: bold;
          text-transform: uppercase;
          margin-bottom: 5px;
        }
        
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 20px;
        }
        
        .info-box {
          border: 1px solid #ccc;
          padding: 10px;
        }
        
        .info-label {
          font-weight: bold;
          text-transform: uppercase;
          font-size: 9px;
          color: #666;
          margin-bottom: 5px;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        
        th, td {
          border: 1px solid #333;
          padding: 6px 8px;
          text-align: left;
        }
        
        th {
          background-color: #f2f2f2;
          font-weight: bold;
          text-transform: uppercase;
          font-size: 9px;
        }
        
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-bold { font-weight: bold; }
        
        .summary {
          margin-top: 20px;
          float: right;
          width: 300px;
        }
        
        .footer {
          margin-top: 60px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 50px;
        }
        
        .signature-line {
          border-top: 1px solid #000;
          margin-top: 40px;
          text-align: center;
          font-size: 10px;
        }
        
        @media print {
          body { margin: 20px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body onload="window.print()">
      <div class="header">
        <div class="title">Акт сверки взаиморасчетов</div>
        <div>по состоянию на ${today}</div>
      </div>
      
      <div class="info-grid">
        <div class="info-box">
          <div class="info-label">Организация:</div>
          <div class="font-bold">Wholesale CRM Systems</div>
          <div>Таджикистан, г. Душанбе</div>
        </div>
        <div class="info-box">
          <div class="info-label">Контрагент:</div>
          <div class="font-bold">${customer.name}</div>
          <div>Тел: ${customer.phone || '---'}</div>
          <div>Адрес: ${customer.address || '---'}</div>
        </div>
      </div>
      
      <table>
        <thead>
          <tr>
            <th width="30" class="text-center">№</th>
            <th width="80">Дата</th>
            <th>Содержание операции</th>
            <th width="100" class="text-right">Дебет (Продажа)</th>
            <th width="100" class="text-right">Кредит (Оплата)</th>
            <th width="100" class="text-right">Сальдо</th>
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
            <td colspan="3" class="text-right">ОБОРОТЫ ЗА ПЕРИОД:</td>
            <td class="text-right">${formatMoney(totalDebit)}</td>
            <td class="text-right">${formatMoney(totalCredit)}</td>
            <td></td>
          </tr>
          <tr class="font-bold">
            <td colspan="3" class="text-right">КОНЕЧНОЕ САЛЬДО:</td>
            <td colspan="3" class="text-right" style="font-size: 14px;">
              ${finalBalance > 0 ? `Задолженность в пользу Организации: ${formatMoney(finalBalance)}` : 
                finalBalance < 0 ? `Задолженность в пользу Контрагента: ${formatMoney(Math.abs(finalBalance))}` : 
                'Задолженность отсутствует'}
            </td>
          </tr>
        </tfoot>
      </table>
      
      <div style="margin-top: 40px;">
        На состояние ${today} задолженность ${finalBalance > 0 ? 'составляет' : 'отсутствует'} <b>${formatMoney(Math.abs(finalBalance))}</b>.
      </div>

      <div class="footer">
        <div>
          <div class="font-bold">От Организации</div>
          <div class="signature-line">(должность, подпись, ФИО)</div>
          <div style="margin-top: 10px; font-style: italic;">М.П.</div>
        </div>
        <div>
          <div class="font-bold">От Контрагента</div>
          <div class="signature-line">(должность, подпись, ФИО)</div>
          <div style="margin-top: 10px; font-style: italic;">М.П.</div>
        </div>
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
};
