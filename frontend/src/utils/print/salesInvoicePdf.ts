import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatMoney, roundMoney, ceilMoney } from '../format';
import { formatProductName } from '../productName';

const PDF_FONT_NAME = 'ArialUnicode';
const PDF_FONT_URL = '/fonts/arial.ttf';

let fontBase64Promise: Promise<string> | null = null;

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const loadPdfFontBase64 = async () => {
  if (!fontBase64Promise) {
    fontBase64Promise = fetch(PDF_FONT_URL).then(async (response) => {
      if (!response.ok) {
        console.error(`Font load error: ${response.status} ${response.statusText} for ${PDF_FONT_URL}`);
        throw new Error(`Font load error: ${response.status}`);
      }
      return arrayBufferToBase64(await response.arrayBuffer());
    }).catch(err => {
      console.error('Failed to fetch font', err);
      fontBase64Promise = null; // Allow retry
      throw err;
    });
  }
  return fontBase64Promise;
};

const ensurePdfFont = async (doc: jsPDF) => {
  const fonts = doc.getFontList();
  if (fonts[PDF_FONT_NAME]) return true;
  
  try {
    const base64Font = await loadPdfFontBase64();
    doc.addFileToVFS('arial.ttf', base64Font);
    doc.addFont('arial.ttf', PDF_FONT_NAME, 'normal');
    doc.addFont('arial.ttf', PDF_FONT_NAME, 'bold');
    return true;
  } catch (e) {
    console.warn('Could not load custom PDF font, falling back to standard font', e);
    return false;
  }
};

const formatRuDate = (value: unknown) => {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '---';
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const normalizeMoney = (value: unknown) => formatMoney(value, '').trim();

export async function saveSalesInvoicePdf(invoice: any) {
  if (!invoice) throw new Error('Invoice data is missing');

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const fontLoaded = await ensurePdfFont(doc);
  
  // Use custom font if loaded, otherwise fallback to Helvetica/Arial (builtin)
  // Note: Standard fonts don't support Cyrillic well in jsPDF without extra work,
  // but we try to continue regardless.
  const activeFont = fontLoaded ? PDF_FONT_NAME : 'helvetica';
  doc.setFont(activeFont);

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;

  // Title
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(18);
  doc.text(`ТОВАРНАЯ НАКЛАДНАЯ №${invoice.id}`, pageWidth / 2, 20, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont(activeFont, 'normal');
  doc.text(`от ${formatRuDate(invoice.createdAt)} г.`, pageWidth / 2, 26, { align: 'center' });

  // 1C STYLE HEADER
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);

  let currentY = 35;
  const labelWidth = 30;

  const add1CHeaderRow = (label: string, value: string, isBold = false) => {
    doc.setFontSize(8);
    doc.setFont(activeFont, 'bold');
    doc.text(label + ':', margin, currentY);
    
    doc.setFont(activeFont, isBold ? 'bold' : 'normal');
    doc.setFontSize(9);
    const textValue = value || '---';
    const lines = doc.splitTextToSize(textValue, contentWidth - labelWidth - 5);
    doc.text(lines, margin + labelWidth, currentY);
    
    const rowHeight = lines.length * 4;
    currentY += Math.max(6, rowHeight + 2);
  };

  // Supplier (Поставщик)
  const supplierName = invoice.company_name || invoice.companyNameSnapshot || 'Мэй Фу Душанбе';
  const supplierAddress = [invoice.company_country, invoice.company_region, invoice.company_city, invoice.company_address].filter(Boolean).join(', ') || invoice.companyAddressSnapshot || '';
  const supplierFull = supplierAddress ? `${supplierName}, ${supplierAddress}` : supplierName;
  
  add1CHeaderRow('Поставщик', supplierFull, true);
  
  // Customer (Грузополучатель / Плательщик)
  const customerName = invoice.customer_name || invoice.customerNameSnapshot || invoice.customer?.name || 'Обычный клиент';
  const customerAddressStr = invoice.customer_address || invoice.customerAddressSnapshot || [invoice.customer?.country, invoice.customer?.region, invoice.customer?.city, invoice.customer?.address].filter(Boolean).join(', ') || '';
  const customerPhone = invoice.customer_phone || invoice.customerPhoneSnapshot || invoice.customer?.phone;
  const customerFull = [customerName, customerAddressStr, customerPhone ? `тел: ${customerPhone}` : ''].filter(Boolean).join(', ');

  add1CHeaderRow('Покупатель', customerFull, true);

  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 5;

  // Items Table
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  
  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['№', 'Наименование товара', 'Кол-во', 'Цена', 'Сумма']],
    body: items.map((item: any, idx: number) => {
      const qtyLabel = item.packageQuantity > 0 
        ? `${item.packageQuantity} ${item.packageNameSnapshot || 'уп'}${item.extraUnitQuantity > 0 ? ` + ${item.extraUnitQuantity} шт` : ''}`
        : `${item.totalBaseUnits || item.quantity} шт`;
        
      return [
        String(idx + 1),
        formatProductName(item.product_name || item.productNameSnapshot || item.product?.name || '---'),
        qtyLabel,
        normalizeMoney(item.sellingPrice),
        normalizeMoney(item.totalPrice)
      ];
    }),
    theme: 'grid',
    styles: {
      font: activeFont,
      fontSize: 9,
      lineColor: [15, 23, 42],
      lineWidth: 0.1,
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 35, halign: 'center' },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
    }
  });

  // Summary
  const finalY = (doc as any).lastAutoTable.cursor.y + 10;
  const summaryX = pageWidth - margin - 60;

  doc.setFontSize(9);
  doc.setFont(activeFont, 'normal');
  
  const subtotal = invoice.totalAmount || 0;
  const discount = invoice.discount || 0;
  const discountAmount = roundMoney(subtotal * (discount / 100));
  const netAmount = invoice.netAmount || (subtotal - discountAmount);
  const paidAmount = invoice.paidAmount || 0;
  const balance = Math.max(0, netAmount - paidAmount);

  currentY = finalY;

  const addSummaryRow = (label: string, value: string, isBold = false) => {
    doc.setFont(activeFont, isBold ? 'bold' : 'normal');
    doc.text(label, summaryX - 20, currentY, { align: 'right' });
    doc.text(value, pageWidth - margin, currentY, { align: 'right' });
    currentY += 5;
  };

  addSummaryRow('Сумма без скидки:', normalizeMoney(subtotal));
  if (discountAmount > 0.01) {
    doc.setTextColor(220, 38, 38);
    addSummaryRow(`Скидка (${discount}%):`, `-${normalizeMoney(discountAmount)}`, true);
    doc.setTextColor(15, 23, 42);
  }
  
  if (Number(invoice.returnedAmount || 0) > 0) {
    addSummaryRow('Возвращено:', `-${normalizeMoney(invoice.returnedAmount)}`);
  }

  currentY += 2;
  doc.setFontSize(12);
  addSummaryRow('ИТОГО К ОПЛАТЕ:', normalizeMoney(netAmount), true);
  
  doc.setFontSize(9);
  currentY += 2;
  addSummaryRow('Оплачено:', normalizeMoney(paidAmount));
  addSummaryRow('Остаток долга:', normalizeMoney(balance), true);

  // Footer Signatures
  currentY += 20;
  doc.setDrawColor(0, 0, 0);
  doc.line(margin, currentY, margin + 50, currentY);
  doc.line(pageWidth - margin - 50, currentY, pageWidth - margin, currentY);
  
  doc.setFontSize(8);
  doc.text('Отпустил (подпись)', margin + 25, currentY + 5, { align: 'center' });
  doc.text('Получил (подпись)', pageWidth - margin - 25, currentY + 5, { align: 'center' });

  doc.save(`Invoice_${invoice.id}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
