import { formatMoney } from '../format';

const PAYMENT_EPSILON = 0.01;

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeAddressLine = (...parts: unknown[]) =>
  parts
    .flatMap((value) => String(value ?? '').split(/\r?\n/g))
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeDisplayBaseUnit = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'шт';
  if (['пачка', 'пачки', 'пачек', 'шт', 'штук', 'штука', 'штуки', 'pcs', 'piece', 'pieces'].includes(normalized)) {
    return 'шт';
  }
  return normalized;
};

const normalizeStatusLabel = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized.includes('част')) {
    return 'Частично оплачено';
  }

  if (normalized.includes('не')) {
    return 'Не оплачено';
  }

  if (normalized.includes('смеш')) {
    return 'Смешанные статусы';
  }

  return 'Оплачено';
};

const formatRuDate = (value: unknown, withTime = false) => {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) {
    return '---';
  }

  return withTime ? date.toLocaleString('ru-RU') : date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const getCustomerInvoiceQuantityLines = (item: any) => {
  const packageQuantity = Math.max(0, Number(item?.packageQuantity || 0));
  const extraUnitQuantity = Math.max(0, Number(item?.extraUnitQuantity || 0));
  const unitsPerPackage = Math.max(0, Number(item?.unitsPerPackageSnapshot ?? item?.unitsPerPackage ?? 0));
  const packageName = String(item?.packageNameSnapshot || item?.packageName || '').trim();
  const baseUnitName = normalizeDisplayBaseUnit(item?.baseUnitNameSnapshot || item?.baseUnitName || item?.unit || 'шт');
  const quantity = Math.max(0, Number(item?.quantity || 0));

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

export interface CustomerInvoicePrintCustomer {
  name?: string;
  phone?: string;
  country?: string;
  region?: string;
  city?: string;
  address?: string;
}

export interface CustomerInvoicePrintOptions {
  invoice: any;
  customer: CustomerInvoicePrintCustomer | null;
  statusLabel: string;
  subtotal: number;
  discountAmount: number;
  netAmount: number;
  appliedPaidAmount: number;
  changeAmount: number;
}

export interface CustomerInvoicesBatchCustomer {
  id: number;
  name: string;
  phone?: string;
  purchasedTotal: number;
  paidTotal: number;
  debtTotal: number;
  statusLabel: string;
  invoices: CustomerInvoicePrintOptions[];
}

interface BatchCustomerInvoicePrintOptions {
  customers: CustomerInvoicesBatchCustomer[];
  filterLabel: string;
  generatedAt?: Date;
}

const renderPaymentsBlock = (invoice: any) =>
  Array.isArray(invoice.paymentEvents) && invoice.paymentEvents.length > 0
    ? `
      <div class="section">
        <h3>Оплаты</h3>
        <table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Сумма</th>
              <th>Сотрудник</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.paymentEvents
              .map(
                (payment: any) => `
                  <tr>
                    <td>${escapeHtml(formatRuDate(payment.createdAt, true))}</td>
                    <td>${escapeHtml(formatMoney(payment.amount))}</td>
                    <td>${escapeHtml(payment.staff_name)}</td>
                  </tr>
                `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `
    : '';

const renderReturnsBlock = (invoice: any) =>
  Array.isArray(invoice.returnEvents) && invoice.returnEvents.length > 0
    ? `
      <div class="section">
        <h3>Возвраты</h3>
        <table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Сумма</th>
              <th>Причина</th>
              <th>Сотрудник</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.returnEvents
              .map(
                (itemReturn: any) => `
                  <tr>
                    <td>${escapeHtml(formatRuDate(itemReturn.createdAt, true))}</td>
                    <td>-${escapeHtml(formatMoney(itemReturn.totalValue))}</td>
                    <td>${escapeHtml(itemReturn.reason || '---')}</td>
                    <td>${escapeHtml(itemReturn.staff_name)}</td>
                  </tr>
                `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `
    : '';

const renderCustomerInvoiceSection = (
  {
    invoice,
    customer,
    statusLabel,
    subtotal,
    discountAmount,
    netAmount,
    appliedPaidAmount,
    changeAmount,
  }: CustomerInvoicePrintOptions,
  meta?: {
    pageNumber?: number;
    totalPages?: number;
    generatedAt?: Date;
    filterLabel?: string;
  },
) => {
  const customerAddress = normalizeAddressLine(customer?.country, customer?.region, customer?.city, customer?.address);
  const sellerRegionLine = [invoice.company_country, invoice.company_region].filter(Boolean).join(', ');
  const sellerCityLine = [invoice.company_city, invoice.company_address].filter(Boolean).join(', ');
  const invoiceDateLabel = formatRuDate(invoice.createdAt);
  const normalizedInvoiceStatusLabel = normalizeStatusLabel(statusLabel);
  const invoiceBalance = Math.max(0, Number(invoice?.invoiceBalance || 0));
  const itemsRows = Array.isArray(invoice.items)
    ? invoice.items
        .map(
          (item: any, index: number) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(item.product?.name || '---')}</td>
              <td>${getCustomerInvoiceQuantityLines(item).map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</td>
              <td>${escapeHtml(formatMoney(item.sellingPrice))}</td>
              <td>${escapeHtml(formatMoney(Number(item.quantity || 0) * Number(item.sellingPrice || 0)))}</td>
            </tr>
          `,
        )
        .join('')
    : '';

  const pageMeta =
    meta?.pageNumber && meta?.totalPages
      ? `
        <div class="doc-meta">
          <div>Страница: ${escapeHtml(`${meta.pageNumber} из ${meta.totalPages}`)}</div>
          ${meta?.filterLabel ? `<div>Фильтр: ${escapeHtml(meta.filterLabel)}</div>` : ''}
          ${meta?.generatedAt ? `<div>Сформировано: ${escapeHtml(meta.generatedAt.toLocaleString('ru-RU'))}</div>` : ''}
        </div>
      `
      : '';

  return `
    <section class="sheet">
      ${pageMeta}
      <div class="header">
        <h1 class="title">Накладная №${invoice.id}</h1>
        <div class="subtitle">${escapeHtml(invoiceDateLabel)}</div>
      </div>
      <div class="parties">
        <div class="party-block">
          <p class="label">Компания</p>
          <p class="value">${escapeHtml(invoice.company_name || '---')}</p>
          ${sellerRegionLine ? `<p class="subvalue">${escapeHtml(sellerRegionLine)}</p>` : ''}
          ${sellerCityLine ? `<p class="subvalue">${escapeHtml(sellerCityLine)}</p>` : ''}
          ${invoice.company_phone ? `<p class="subvalue">${escapeHtml(invoice.company_phone)}</p>` : ''}
        </div>
        <div class="party-block">
          <p class="label">Клиент</p>
          <p class="value">${escapeHtml(customer?.name || '---')}</p>
          ${customer?.phone ? `<p class="subvalue">Телефон: ${escapeHtml(customer.phone)}</p>` : ''}
          ${customerAddress ? `<p class="subvalue">Адрес: ${escapeHtml(customerAddress)}</p>` : ''}
        </div>
        <div class="party-block party-meta">
          <p class="label">Информация</p>
          <p class="value">Статус: ${escapeHtml(normalizedInvoiceStatusLabel)}</p>
          <p class="subvalue">${
            changeAmount > PAYMENT_EPSILON
              ? `Сдача клиенту: ${escapeHtml(formatMoney(changeAmount))}`
              : `Остаток: ${escapeHtml(formatMoney(invoiceBalance))}`
          }</p>
        </div>
      </div>
      <div class="section">
        <h3>Товары</h3>
        <table>
          <thead>
            <tr>
              <th style="width: 52px;">№</th>
              <th>Товар</th>
              <th style="width: 120px;">Количество</th>
              <th style="width: 140px;">Цена</th>
              <th style="width: 140px;">Сумма</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>
      </div>
      <div class="summary">
        <div class="summary-row"><span>Подытог</span><strong>${escapeHtml(formatMoney(subtotal))}</strong></div>
        <div class="summary-row"><span>Скидка (${escapeHtml(invoice.discount)}%)</span><strong>-${escapeHtml(formatMoney(discountAmount))}</strong></div>
        ${Number(invoice.returnedAmount || 0) > 0 ? `<div class="summary-row"><span>Возвращено</span><strong>-${escapeHtml(formatMoney(invoice.returnedAmount))}</strong></div>` : ''}
        <div class="summary-row total"><span>ИТОГО</span><strong>${escapeHtml(formatMoney(netAmount))}</strong></div>
        <div class="summary-row"><span>Оплачено</span><strong>${escapeHtml(formatMoney(appliedPaidAmount))}</strong></div>
        <div class="summary-row"><span>Остаток</span><strong>${escapeHtml(formatMoney(invoiceBalance))}</strong></div>
      </div>
      ${renderPaymentsBlock(invoice)}
      ${renderReturnsBlock(invoice)}
    </section>
  `;
};

const renderBatchOverviewSection = (
  customers: CustomerInvoicesBatchCustomer[],
  filterLabel: string,
  generatedAt: Date,
) => `
  <section class="sheet">
    <div class="header">
      <h1 class="title">Клиенты и долги</h1>
      <div class="subtitle">Фильтр: ${escapeHtml(filterLabel)} | ${escapeHtml(generatedAt.toLocaleString('ru-RU'))}</div>
    </div>
    <div class="section section-no-gap">
      <h3>Список клиентов</h3>
      <table>
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Телефон</th>
            <th>Купил всего</th>
            <th>Оплатил всего</th>
            <th>Долг</th>
            <th>Статус оплаты</th>
          </tr>
        </thead>
        <tbody>
          ${customers
            .map(
              (customer) => `
                <tr>
                  <td>${escapeHtml(customer.name)}</td>
                  <td>${escapeHtml(customer.phone || 'Нет телефона')}</td>
                  <td>${escapeHtml(formatMoney(customer.purchasedTotal))}</td>
                  <td>${escapeHtml(formatMoney(customer.paidTotal))}</td>
                  <td>${escapeHtml(formatMoney(customer.debtTotal))}</td>
                  <td>${escapeHtml(normalizeStatusLabel(customer.statusLabel))}</td>
                </tr>
              `,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  </section>
`;

const renderCustomerGroupHeader = (customer: CustomerInvoicesBatchCustomer) => `
  <section class="sheet customer-group-sheet">
    <div class="customer-group-card">
      <div>
        <p class="label">Клиент</p>
        <p class="value">${escapeHtml(customer.name)}</p>
        <p class="subvalue">${escapeHtml(customer.phone || 'Нет телефона')}</p>
        <p class="subvalue">Накладные: ${escapeHtml(customer.invoices.map((entry) => `#${entry.invoice?.id}`).join(', '))}</p>
      </div>
      <div class="customer-group-grid">
        <div class="customer-group-stat">
          <span class="customer-group-stat-label">Номера накладных</span>
          <strong>${escapeHtml(customer.invoices.map((entry) => `#${entry.invoice?.id}`).join(', '))}</strong>
        </div>
        <div class="customer-group-stat">
          <span class="customer-group-stat-label">Купил всего</span>
          <strong>${escapeHtml(formatMoney(customer.purchasedTotal))}</strong>
        </div>
        <div class="customer-group-stat">
          <span class="customer-group-stat-label">Оплатил всего</span>
          <strong>${escapeHtml(formatMoney(customer.paidTotal))}</strong>
        </div>
        <div class="customer-group-stat">
          <span class="customer-group-stat-label">Долг</span>
          <strong>${escapeHtml(formatMoney(customer.debtTotal))}</strong>
        </div>
        <div class="customer-group-stat">
          <span class="customer-group-stat-label">Статус оплаты</span>
          <strong>${escapeHtml(normalizeStatusLabel(customer.statusLabel))}</strong>
        </div>
      </div>
    </div>
  </section>
`;

const buildDocumentHtml = (sectionsHtml: string, title: string, autoClose = false) => `<!doctype html>
  <html lang="ru">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(title)}</title>
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; padding: 16px; font-family: Arial, sans-serif; color: #0f172a; background: #fff; }
        .sheet { max-width: 900px; margin: 0 auto; }
        .sheet + .sheet { page-break-before: always; margin-top: 24px; }
        .doc-meta { display: flex; justify-content: space-between; gap: 12px; margin: 0 auto 8px; max-width: 900px; color: #64748b; font-size: 9px; }
        .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; }
        .title { font-size: 24px; font-weight: 800; margin: 0; }
        .subtitle { margin-top: 4px; font-size: 12px; font-weight: 700; color: #334155; }
        .parties { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
        .party-block { padding: 0; border: none; background: transparent; }
        .party-meta { text-align: right; }
        .label { margin: 0 0 4px; color: #64748b; font-size: 8px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
        .value { margin: 0; font-size: 13px; font-weight: 800; }
        .subvalue { margin: 2px 0 0; color: #475569; font-size: 10px; line-height: 1.25; font-weight: 700; }
        .section { margin-top: 12px; }
        .section h3 { margin: 0 0 6px; font-size: 11px; font-weight: 800; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #0f172a; padding: 5px 6px; font-size: 10px; text-align: left; vertical-align: top; font-weight: 700; }
        th { background: #f8fafc; font-weight: 800; }
        .summary { margin-left: auto; margin-top: 12px; width: 260px; }
        .summary-row { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: 1px solid #0f172a; font-size: 10px; font-weight: 700; }
        .summary-row.total { font-size: 16px; font-weight: 900; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; margin-top: 6px; padding: 8px 0; letter-spacing: 0.06em; }
        .section-no-gap { margin-top: 0; }
        .customer-group-sheet { page-break-before: always; }
        .customer-group-card { display: grid; grid-template-columns: minmax(0, 180px) minmax(0, 1fr); gap: 12px; border: 2px solid #0f172a; padding: 12px; }
        .customer-group-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .customer-group-stat { border: 1px solid #0f172a; padding: 8px 10px; }
        .customer-group-stat-label { display: block; margin-bottom: 3px; color: #64748b; font-size: 8px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
        @page { size: A4 portrait; margin: 10mm; }
      </style>
    </head>
    <body>
      ${sectionsHtml}
      ${
        autoClose
          ? `<script>
              window.onload = () => {
                window.print();
                setTimeout(() => window.close(), 300);
              };
            </script>`
          : ''
      }
    </body>
  </html>`;

export function printCustomerInvoice(options: CustomerInvoicePrintOptions) {
  if (typeof window === 'undefined' || !options.invoice || !options.customer) {
    return { ok: false, reason: 'invalid' as const };
  }

  const printWindow = window.open('', '_blank', 'width=980,height=900');
  if (!printWindow) {
    return { ok: false, reason: 'blocked' as const };
  }

  const html = buildDocumentHtml(renderCustomerInvoiceSection(options), `Накладная #${options.invoice.id}`, true);

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  return { ok: true as const };
}

export function printCustomerInvoicesBatch({
  customers,
  filterLabel,
  generatedAt = new Date(),
}: BatchCustomerInvoicePrintOptions) {
  if (typeof window === 'undefined' || !Array.isArray(customers) || customers.length === 0) {
    return { ok: false as const, reason: 'invalid' as const };
  }

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

  const sectionsHtml = renderBatchOverviewSection(customers, filterLabel, generatedAt);

  iframeDocument.open();
  iframeDocument.write(buildDocumentHtml(sectionsHtml, `Клиенты и долги - ${filterLabel}`));
  iframeDocument.close();

  iframe.onload = () => {
    iframeWindow.focus();
    iframeWindow.print();
    cleanup();
  };

  return { ok: true as const };
}
