import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type StockReportRow = {
  index: number;
  name: string;
  stock: string;
};

type StockReportOptions = {
  warehouseName: string;
  generatedAt?: Date;
  rows: StockReportRow[];
};

const PDF_TEXT = {
  title: 'ОТЧЕТ ПО ОСТАТКАМ ТОВАРОВ',
  number: '№',
  item: 'Товары',
  stock: 'Остаток',
  warehouse: 'Склад',
  generatedAt: 'Дата',
  positions: 'Позиций',
  shortTitle: 'Остатки товаров',
  page: 'Стр.',
} as const;

const PDF_FONT_FILE = 'arial.ttf';
const PDF_FONT_NAME = 'ArialUnicode';
const PDF_FONT_URL = '/fonts/arial.ttf';
const PDF_FONT_LOAD_ERROR = 'Не удалось загрузить PDF-шрифт';

let fontBase64Promise: Promise<string> | null = null;

const formatDateTime = (value: Date) =>
  value.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatDateForFile = (value: Date) => value.toISOString().slice(0, 10);

const buildSafeFilePart = (value: string) =>
  String(value || 'vse-sklady')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]+/gi, '') || 'vse-sklady';

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
        throw new Error(PDF_FONT_LOAD_ERROR);
      }

      return arrayBufferToBase64(await response.arrayBuffer());
    });
  }

  return fontBase64Promise;
};

const ensurePdfFont = async (doc: jsPDF) => {
  const fonts = doc.getFontList();
  if (fonts[PDF_FONT_NAME]) {
    return;
  }

  const base64Font = await loadPdfFontBase64();
  doc.addFileToVFS(PDF_FONT_FILE, base64Font);
  doc.addFont(PDF_FONT_FILE, PDF_FONT_NAME, 'normal');
  doc.addFont(PDF_FONT_FILE, PDF_FONT_NAME, 'bold');
};

export async function downloadStockReportPdf({
  warehouseName,
  generatedAt = new Date(),
  rows,
}: StockReportOptions) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  await ensurePdfFont(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 8;
  const fileDate = formatDateForFile(generatedAt);
  const safeWarehouse = buildSafeFilePart(warehouseName);
  const generatedAtLabel = formatDateTime(generatedAt);

  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, margin, pageWidth - margin * 2, 16, 3, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont(PDF_FONT_NAME, 'bold');
  doc.setFontSize(12.5);
  doc.text(PDF_TEXT.title, margin + 3, 14.2);

  doc.setFont(PDF_FONT_NAME, 'normal');
  doc.setFontSize(7);
  doc.text(`${PDF_TEXT.warehouse}: ${warehouseName}`, margin + 3, 19.3);
  doc.text(`${PDF_TEXT.generatedAt}: ${generatedAtLabel}`, pageWidth - margin - 3, 19.3, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin, 28, pageWidth - margin * 2, 8, 2.5, 2.5, 'F');
  doc.setFont(PDF_FONT_NAME, 'bold');
  doc.setFontSize(7.1);
  doc.text(`${PDF_TEXT.positions}: ${rows.length}`, margin + 3, 33.2);

  autoTable(doc, {
    startY: 40,
    margin: { left: margin, right: margin, bottom: 10 },
    head: [[PDF_TEXT.number, PDF_TEXT.item, PDF_TEXT.stock]],
    body: rows.map((row) => [String(row.index), row.name, row.stock]),
    theme: 'grid',
    styles: {
      font: PDF_FONT_NAME,
      fontSize: 7,
      lineColor: [203, 213, 225],
      lineWidth: 0.12,
      cellPadding: { top: 1.2, right: 1.5, bottom: 1.2, left: 1.5 },
      textColor: [15, 23, 42],
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      font: PDF_FONT_NAME,
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.2,
      halign: 'center',
      cellPadding: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 142, fontStyle: 'bold' },
      2: { cellWidth: 32, halign: 'center' },
    },
    didDrawPage: () => {
      const pageNumber = doc.getNumberOfPages();

      doc.setDrawColor(226, 232, 240);
      doc.line(margin, pageHeight - 7.5, pageWidth - margin, pageHeight - 7.5);
      doc.setTextColor(100, 116, 139);
      doc.setFont(PDF_FONT_NAME, 'normal');
      doc.setFontSize(6.2);
      doc.text(`${PDF_TEXT.shortTitle} - ${warehouseName}`, margin, pageHeight - 4);
      doc.text(`${PDF_TEXT.page} ${pageNumber}`, pageWidth - margin, pageHeight - 4, { align: 'right' });
    },
  });

  doc.save(`ostatki_${safeWarehouse}_${fileDate}.pdf`);
}
