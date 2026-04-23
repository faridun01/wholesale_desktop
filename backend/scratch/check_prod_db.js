import { PrismaClient } from '../generated/client/index.js';
import path from 'path';

async function main() {
  const dbPath = path.join(process.env.APPDATA, 'wholesale-crm', 'database.sqlite');
  const dbUrl = `file:${dbPath}`;
  console.log('Checking database at:', dbUrl);
  
  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } }
  });
  
  try {
    const productCount = await prisma.product.count();
    const products = await prisma.product.findMany({ take: 5, select: { name: true } });

    console.log('--- PRODUCTION DB STATS ---');
    console.log('Products:', productCount);
    console.log('Sample Products:', JSON.stringify(products, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
