import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatMoney, roundMoney } from '../format';
import { formatProductName } from '../productName';

export async function saveSalesInvoicePdf(invoice: any) {
  const doc = new jsPDF();
  
  // Font setup (using standard helvetica as fallback, but ideally we'd load a Cyrillic font)
  // For standard jsPDF, we need to ensure Russian characters work. 
  // Since this is a desktop app, we usually rely on the system or bundled fonts.
  
  const title = `РАСХОДНАЯ НАКЛАДНАЯ № ${invoice.id}`;
  const date = new Date(invoice.createdAt).toLocaleDateString('ru-RU');
  
  // Header
  doc.setFontSize(18);
  doc.text(title, 14, 20);
  
  doc.setFontSize(10);
  doc.text(`Дата: ${date}`, 14, 30);
  doc.text(`Склад: ${invoice.warehouse?.name || 'Основной склад'}`, 14, 35);
  doc.text(`Клиент: ${invoice.customer?.name || 'Розничный покупатель'}`, 14, 40);

  // Table
  const tableData = invoice.items.map((item: any, index: number) => {
    const qty = Number(item.quantity);
    const price = Number(item.sellingPrice);
    const total = roundMoney(qty * price);
    
    return [
      index + 1,
      formatProductName(item.product?.name || item.product_name),
      `${qty} ${item.unit || item.product?.unit || 'шт'}`,
      formatMoney(price),
      formatMoney(total)
    ];
  });

  autoTable(doc, {
    startY: 50,
    head: [['№', 'Наименование товара', 'Кол-во', 'Цена', 'Сумма']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillStyle: 'F', fillColor: [240, 140, 0], textColor: [255, 255, 255] },
    styles: { fontSize: 9, font: 'helvetica' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      2: { halign: 'center', cellWidth: 30 },
      3: { halign: 'right', cellWidth: 30 },
      4: { halign: 'right', cellWidth: 30 },
    }
  });

  const finalY = (doc as any).lastAutoTable.finalY || 150;
  
  // Totals
  doc.setFontSize(11);
  const subtotal = invoice.items.reduce((acc: number, item: any) => acc + (Number(item.quantity) * Number(item.sellingPrice)), 0);
  const discount = Number(invoice.discountAmount || 0);
  const total = Number(invoice.netAmount);

  doc.text(`Итого: ${formatMoney(subtotal)}`, 140, finalY + 10);
  if (discount > 0) {
    doc.text(`Скидка: -${formatMoney(discount)}`, 140, finalY + 15);
  }
  doc.setFontSize(12);
  doc.text(`К ОПЛАТЕ: ${formatMoney(total)}`, 140, finalY + 22);

  // Footer
  doc.setFontSize(8);
  doc.text('Благодарим за покупку!', 14, finalY + 35);
  
  // Save the PDF
  doc.save(`Invoice_${invoice.id}.pdf`);
}
