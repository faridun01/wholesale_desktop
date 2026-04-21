import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkAndCleanup() {
  const ids = [1, 3];
  const customers = await prisma.customer.findMany({
    where: { id: { in: ids } },
    include: {
      _count: { select: { invoices: true, payments: true, returns: true } }
    }
  });

  console.log('--- Customers to Cleanup ---');
  for (const c of customers) {
    console.log(`ID: ${c.id} | Name: ${c.name} | Invoices: ${c._count.invoices} | Payments: ${c._count.payments}`);
    
    if (c._count.invoices === 0 && c._count.payments === 0) {
      console.log(`Deleting ID ${c.id}...`);
      await prisma.customer.delete({ where: { id: c.id } });
      console.log('Deleted.');
    } else {
      console.log(`ID ${c.id} has transactions! Keeping for now.`);
    }
  }
}

checkAndCleanup().finally(() => prisma.$disconnect());
