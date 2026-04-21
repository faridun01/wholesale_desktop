import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const customerName = 'Аличон Рахмонов';
  console.log(`Checking customer: ${customerName}`);

  const customer = await prisma.customer.findFirst({
    where: { name: { contains: 'Рахмонов' } },
  });

  if (!customer) {
    console.log('Customer not found');
    return;
  }

  console.log(`Found Customer ID: ${customer.id}, Name: ${customer.name}`);

  const invoices = await prisma.invoice.findMany({
    where: { customerId: customer.id },
    include: { payments: true }
  });

  console.log('\n--- INVOICES ---');
  invoices.forEach(inv => {
    const totalPaidInPayments = inv.payments.reduce((acc, p) => acc + p.amount, 0);
    console.log(`Invoice #${inv.id}: netAmount=${inv.netAmount}, paidAmount(field)=${inv.paidAmount}, SumOfPayments=${totalPaidInPayments}, Status=${inv.status}`);
  });

  const allPayments = await prisma.payment.findMany({
    where: { customerId: customer.id }
  });

  console.log('\n--- ALL PAYMENTS FOR CUSTOMER ---');
  allPayments.forEach(p => {
    console.log(`Payment ID ${p.id}: amount=${p.amount}, invoiceId=${p.invoiceId}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
