import { jsPDF } from 'jspdf';
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

export async function downloadStockReportPdf({
  warehouseName,
  generatedAt = new Date(),
  rows,
}: StockReportOptions) {
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
  doc.setFontSize(14);
  doc.text('Ведомость по остаткам товаров на складах', margin, 15);
  
  doc.setFont(PDF_FONT_NAME, 'normal');
  doc.setFontSize(9);
  doc.text(`Склад: ${warehouseName}`, margin, 22);
  doc.text(`Дата отчета: ${formatDateTime(generatedAt)}`, margin, 27);
  
  doc.setLineWidth(0.5);
  doc.line(margin, 30, pageWidth - margin, 30);

  autoTable(doc, {
    startY: 35,
    margin: { left: margin, right: margin },
    head: [['№', 'Номенклатура', 'Остаток']],
    body: rows.map((row) => [String(row.index), row.name, row.stock]),
    theme: 'grid',
    styles: {
      font: PDF_FONT_NAME,
      fontSize: 8,
      lineColor: [0, 0, 0],
      lineWidth: 0.1,
      textColor: [0, 0, 0],
    },
    headStyles: {
      fillColor: [230, 230, 230],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 40, halign: 'center' },
    },
    didDrawPage: () => {
      doc.setFontSize(7);
      doc.text(
        `Страница ${doc.getNumberOfPages()}`,
        pageWidth - margin,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'right' }
      );
    },
  });

  doc.save(`ostatki_${safeWarehouse}_${fileDate}.pdf`);
}
