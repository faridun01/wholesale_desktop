import { PrismaClient } from '../generated/client/index.js';
const prisma = new PrismaClient();

async function main() {
  try {
    const productCount = await prisma.product.count();
    const userCount = await prisma.user.count();
    const warehouseCount = await prisma.warehouse.count();
    const products = await prisma.product.findMany({ take: 5, select: { name: true, warehouseId: true } });

    console.log('--- DB STATS ---');
    console.log('Products:', productCount);
    console.log('Users:', userCount);
    console.log('Warehouses:', warehouseCount);
    console.log('Sample Products:', JSON.stringify(products, null, 2));
    
    const warehouses = await prisma.warehouse.findMany({ select: { id: true, name: true } });
    console.log('Warehouses List:', JSON.stringify(warehouses, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
