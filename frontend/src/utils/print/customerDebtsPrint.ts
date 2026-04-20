import { formatCount, formatMoney } from '../format';
import {
  customerPaymentStatusMeta,
  getCustomerDebtTotal,
  getCustomerPaidTotal,
  getCustomerPaymentStatus,
  getCustomerPurchasedTotal,
  type DebtCustomer,
} from '../customerDebt';

type PrintCustomerDebtOptions = {
  customers: DebtCustomer[];
  filterLabel: string;
  generatedAt?: Date;
  hideFinancials?: boolean;
};

const PRINT_PAGE_SIZE = 12;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function printCustomerDebts({ customers, filterLabel, generatedAt = new Date(), hideFinancials = false }: PrintCustomerDebtOptions) {
  if (typeof window === 'undefined') {
    return { ok: false as const, reason: 'unavailable' as const };
  }

  const buildRows = (items: DebtCustomer[]) =>
    items
      .map((customer) => {
        const status = getCustomerPaymentStatus(customer);
        const statusLabel = customerPaymentStatusMeta[status].label;
        const purchased = hideFinancials ? 'Скрыто' : formatMoney(getCustomerPurchasedTotal(customer));
        const paid = hideFinancials ? 'Скрыто' : formatMoney(getCustomerPaidTotal(customer));
        const debt = hideFinancials ? 'Скрыто' : formatMoney(getCustomerDebtTotal(customer));
        const lastPurchase = customer.last_purchase_at
          ? new Date(customer.last_purchase_at).toLocaleDateString('ru-RU')
          : 'Нет покупок';
        const printableStatus = hideFinancials ? 'Скрыто' : statusLabel;

        return `
          <tr>
            <td>${escapeHtml(customer.name || '---')}</td>
            <td>${escapeHtml(customer.phone || 'Нет телефона')}</td>
            <td>${escapeHtml(purchased)}</td>
            <td>${escapeHtml(paid)}</td>
            <td>${escapeHtml(debt)}</td>
            <td>${escapeHtml(lastPurchase)}</td>
            <td>${escapeHtml(printableStatus)}</td>
          </tr>
        `;
      })
      .join('');

  const totalPages = Math.max(1, Math.ceil(customers.length / PRINT_PAGE_SIZE));
  const chunks = Array.from({ length: totalPages }, (_, index) =>
    customers.slice(index * PRINT_PAGE_SIZE, (index + 1) * PRINT_PAGE_SIZE),
  );

  const pagesHtml = chunks
    .map((chunk, index) => {
      const rows = buildRows(chunk);

      return `
        <section class="print-page ${index < chunks.length - 1 ? 'page-break' : ''}">
          <div class="header">
            <p class="title">Долги и оплаты клиентов</p>
            <p class="meta">Фильтр: ${escapeHtml(filterLabel)} | Записей: ${customers.length} | Сформировано: ${escapeHtml(generatedAt.toLocaleString('ru-RU'))}</p>
            <p class="meta">Страница ${index + 1} из ${totalPages}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Клиент</th>
                <th>Телефон</th>
                <th>Купил всего</th>
                <th>Оплатил всего</th>
                <th>Долг</th>
                <th>Последняя покупка</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="7">Нет данных для печати</td></tr>'}
            </tbody>
          </table>
        </section>
      `;
    })
    .join('');

  const html = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <title>Долги и оплаты клиентов</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        color: #0f172a;
        margin: 0;
      }
      .print-page {
        padding: 12mm 10mm;
      }
      .page-break {
        page-break-after: always;
      }
      .header {
        margin-bottom: 10px;
      }
      .title {
        font-size: 14px;
        font-weight: 700;
        margin: 0 0 3px;
      }
      .meta {
        font-size: 9px;
        color: #64748b;
        margin: 0 0 2px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      th,
      td {
        border: 1px solid #cbd5e1;
        padding: 4px 3px;
        text-align: left;
        vertical-align: top;
        font-size: 9px;
        line-height: 1.15;
        word-break: break-word;
      }
      th {
        background: #f8fafc;
        font-weight: 700;
      }
      tbody tr:nth-child(even) {
        background: #f8fafc;
      }
      @page {
        size: A4 portrait;
        margin: 8mm;
      }
    </style>
  </head>
  <body>
    ${pagesHtml}
    <script>
      window.onload = function () {};
    </script>
  </body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';

  const cleanup = () => {
    window.setTimeout(() => {
      iframe.remove();
    }, 300);
  };

  document.body.appendChild(iframe);

  const iframeDocument = iframe.contentDocument || iframe.contentWindow?.document;
  const iframeWindow = iframe.contentWindow;

  if (!iframeDocument || !iframeWindow) {
    cleanup();
    return { ok: false as const, reason: 'unavailable' as const };
  }

  iframeDocument.open();
  iframeDocument.write(html);
  iframeDocument.close();

  iframe.onload = () => {
    iframeWindow.focus();
    iframeWindow.print();
    cleanup();
  };

  return { ok: true as const };
}
