import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- RECONCILIATION DATA AUDIT ---');
  
  const customerId = 2; // Based on the user's screenshot
  
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true }
  });
  
  console.log(`\nCustomer: ${customer?.name} (ID: ${customerId})`);
  
  const invoices = await prisma.invoice.findMany({
    where: { customerId, cancelled: false },
    orderBy: { createdAt: 'asc' },
    select: { id: true, totalAmount: true, netAmount: true, returnedAmount: true, paidAmount: true, createdAt: true }
  });
  
  console.log('\nINVOICES:');
  console.table(invoices.map(inv => ({
    ID: inv.id,
    Date: inv.createdAt.toLocaleDateString(),
    Total: inv.totalAmount,
    Net: inv.netAmount,
    Returned: inv.returnedAmount,
    Paid: inv.paidAmount,
    ActualDebit: inv.netAmount + inv.returnedAmount
  })));
  
  const payments = await prisma.payment.findMany({
    where: { customerId },
    orderBy: { createdAt: 'asc' }
  });
  
  console.log('\nPAYMENTS:');
  console.table(payments.map(p => ({
    ID: p.id,
    Date: p.createdAt.toLocaleDateString(),
    Amount: p.amount,
    Method: p.method,
    Invoice: p.invoiceId
  })));
  
  const returns = await prisma.return.findMany({
    where: { customerId },
    orderBy: { createdAt: 'asc' }
  });
  
  console.log('\nRETURNS:');
  console.table(returns.map(r => ({
    ID: r.id,
    Date: r.createdAt.toLocaleDateString(),
    TotalValue: r.totalValue,
    Invoice: r.invoiceId
  })));

  // Calculate current real balance
  const totalDebit = invoices.reduce((sum, inv) => sum + (inv.netAmount + inv.returnedAmount), 0);
  const totalCredit = payments.reduce((sum, p) => sum + p.amount, 0) + returns.reduce((sum, r) => sum + r.totalValue, 0);
  
  console.log(`\nTOTAL DEBIT: ${totalDebit}`);
  console.log(`TOTAL CREDIT: ${totalCredit}`);
  console.log(`CURRENT BALANCE: ${totalDebit - totalCredit}`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
