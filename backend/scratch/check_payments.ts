import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const customerId = 4;
  const payments = await prisma.payment.findMany({ where: { customerId } });
  console.log(`Payments for Customer ${customerId}:`);
  console.log(JSON.stringify(payments, null, 2));
  
  const total = payments.reduce((s, p) => s + Number(p.amount), 0);
  console.log(`Total Paid: ${total}`);
}

main().finally(() => prisma.$disconnect());
