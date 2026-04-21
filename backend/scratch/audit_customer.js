
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const customer = await prisma.customer.findFirst({
    where: { name: { contains: 'Рахмонов' } },
    include: {
      invoices: { where: { cancelled: false } },
      payments: true,
      returns: true
    }
  });

  if (!customer) {
    console.log('Customer not found');
    return;
  }

  console.log('Customer:', customer.name);
  console.log('--- INVOICES ---');
  let totalInvoiced = 0;
  customer.invoices.forEach(inv => {
    console.log(`Invoice #${inv.id}: Net=${inv.netAmount}, Paid=${inv.paidAmount}, Returned=${inv.returnedAmount}`);
    totalInvoiced += inv.netAmount;
  });

  console.log('--- PAYMENTS ---');
  let totalPaid = 0;
  customer.payments.forEach(p => {
    console.log(`Payment #${p.id}: Amount=${p.amount}, InvoiceId=${p.invoiceId}`);
    totalPaid += p.amount;
  });

  console.log('--- RETURNS ---');
  let totalReturned = 0;
  customer.returns.forEach(r => {
    console.log(`Return #${r.id}: TotalValue=${r.totalValue}, InvoiceId=${r.invoiceId}`);
    totalReturned += r.totalValue;
  });

  console.log('--- SUMMARY ---');
  console.log('Total Invoiced:', totalInvoiced);
  console.log('Total Paid:', totalPaid);
  console.log('Total Returned:', totalReturned);
  console.log('True Balance (Invoiced - Returned - Paid):', totalInvoiced - totalReturned - totalPaid);
}

main().catch(console.error).finally(() => prisma.$disconnect());
