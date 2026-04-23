import { jsPDF } from 'jspdf';
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

const PDF_FONT_NAME = 'ArialUnicode';
const PDF_FONT_URL = '/fonts/arial.ttf';

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
      if (!response.ok) throw new Error('Font load error');
      return arrayBufferToBase64(await response.arrayBuffer());
    });
  }
  return fontBase64Promise;
};

const ensurePdfFont = async (doc: jsPDF) => {
  const fonts = doc.getFontList();
  if (fonts[PDF_FONT_NAME]) return;
  const base64Font = await loadPdfFontBase64();
  doc.addFileToVFS('arial.ttf', base64Font);
  doc.addFont('arial.ttf', PDF_FONT_NAME, 'normal');
  doc.addFont('arial.ttf', PDF_FONT_NAME, 'bold');
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
  });

  await ensurePdfFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  const fileDate = formatDateForFile(generatedAt);
  const safeWarehouse = buildSafeFilePart(warehouseName);

  // 1C STYLE HEADER
  doc.setFont(PDF_FONT_NAME, 'bold');
  doc.setFontSize(16);
  doc.text('Прайс-лист товаров', margin, 15);
  
  doc.setFont(PDF_FONT_NAME, 'normal');
  doc.setFontSize(9);
  doc.text(`Организация: 3CLICK: СКЛАД`, margin, 22);
  doc.text(`Склад: ${warehouseName}`, margin, 27);
  doc.text(`Дата: ${formatDateTime(generatedAt)}`, margin, 32);
  
  doc.setLineWidth(0.5);
  doc.line(margin, 35, pageWidth - margin, 35);

  autoTable(doc, {
    startY: 40,
    margin: { left: margin, right: margin },
    head: [['№', 'Наименование товара', 'Цена за шт', 'Упаковка', 'Цена за упак.']],
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
      fontSize: 8,
      lineColor: [0, 0, 0],
      lineWidth: 0.1,
      textColor: [0, 0, 0],
      valign: 'middle',
    },
    headStyles: {
      fillColor: [235, 235, 235],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 25, halign: 'right' },
      3: { cellWidth: 25, halign: 'center' },
      4: { cellWidth: 30, halign: 'right' },
    },
  });

  doc.save(`price_list_${safeWarehouse}_${fileDate}.pdf`);
}
