import { PrismaClient } from '../generated/client/index.js';
import path from 'path';

async function main() {
  const dbPath = path.join(process.env.APPDATA, 'wholesale-crm', 'database.sqlite');
  const dbUrl = `file:${dbPath}`;
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  
  try {
    const products = await prisma.product.count();
    const invoices = await prisma.invoice.count();
    const transactions = await prisma.inventoryTransaction.count();
    const customers = await prisma.customer.count();
    const categories = await prisma.category.count();

    console.log('--- DEEP STATS (PROD) ---');
    console.log('Products:', products);
    console.log('Invoices:', invoices);
    console.log('Transactions:', transactions);
    console.log('Customers:', customers);
    console.log('Categories:', categories);

    if (products > 0) {
        const lastProducts = await prisma.product.findMany({ take: 10, orderBy: { id: 'desc' }, select: { name: true, createdAt: true } });
        console.log('Last 10 products:', JSON.stringify(lastProducts, null, 2));
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
