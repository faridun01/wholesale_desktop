import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type PriceListRow = {
  index: number;
  name: string;
  pricePerUnit: string;
  unitsPerPackage: string;
  pricePerPackage: string;
};

type PriceListOptions = {
  warehouseName: string;
  generatedAt?: Date;
  rows: PriceListRow[];
};

const PDF_TEXT = {
  title: 'ПРАЙС-ЛИСТ ТОВАРОВ',
  number: '№',
  item: 'Наименование товара',
  pricePerUnit: 'Цена за шт',
  unitsPerPackage: 'Упаковка',
  pricePerPackage: 'Цена за упак.',
  warehouse: 'Склад',
  generatedAt: 'Дата',
  shortTitle: 'Прайс-лист',
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

export async function downloadPriceListPdf({
  warehouseName,
  generatedAt = new Date(),
  rows,
}: PriceListOptions) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  await ensurePdfFont(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  const fileDate = formatDateForFile(generatedAt);
  const safeWarehouse = buildSafeFilePart(warehouseName);
  const generatedAtLabel = formatDateTime(generatedAt);

  // Simple Header
  doc.setTextColor(0, 0, 0);
  doc.setFont(PDF_FONT_NAME, 'bold');
  doc.setFontSize(14);
  doc.text(PDF_TEXT.title, pageWidth / 2, 12, { align: 'center' });

  doc.setFont(PDF_FONT_NAME, 'normal');
  doc.setFontSize(9);
  doc.text(`${PDF_TEXT.generatedAt}: ${generatedAtLabel}`, pageWidth / 2, 18, { align: 'center' });

  autoTable(doc, {
    startY: 24,
    margin: { left: margin, right: margin, bottom: 8 },
    head: [[PDF_TEXT.number, PDF_TEXT.item, PDF_TEXT.pricePerUnit, PDF_TEXT.unitsPerPackage, PDF_TEXT.pricePerPackage]],
    body: rows.map((row) => [
      String(row.index),
      row.name,
      row.pricePerUnit,
      row.unitsPerPackage,
      row.pricePerPackage
    ]),
    theme: 'grid',
    styles: {
      font: PDF_FONT_NAME,
      fontSize: 7.2, // Smaller font to fit more items
      lineColor: [180, 180, 180],
      lineWidth: 0.1,
      cellPadding: 0.8, // Minimal padding
      textColor: [0, 0, 0],
      valign: 'middle',
    },
    headStyles: {
      fillColor: [245, 245, 245],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 25, halign: 'right' },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 30, halign: 'right' },
    },
    // Attempt to make it compact to fit more items
    rowPageBreak: 'avoid',
  });

  doc.save(`price_list_${safeWarehouse}_${fileDate}.pdf`);
}
