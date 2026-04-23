import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // 1. Create Admin User
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'Администратор' },
    update: {},
    create: {
      username: 'Администратор',
      passwordHash: hashedPassword,
      role: 'ADMIN',
    },
  });

  // 2. Create Warehouse
  const warehouse = await prisma.warehouse.create({
    data: {
      name: 'Main Warehouse',
      city: 'Dushanbe',
      address: 'Rudaki 10',
    },
  });

  // 3. Create Category
  const category = await prisma.category.create({
    data: { name: 'Electronics' },
  });

  // 4. Create Product
  const product = await prisma.product.create({
    data: {
      name: 'iPhone 15 Pro',
      unit: 'pcs',
      costPrice: 10000,
      sellingPrice: 12000,
      categoryId: category.id,
      warehouseId: warehouse.id,
      stock: 0, // Initial stock
    },
  });

  // 5. Create Initial Batch (FIFO)
  await prisma.productBatch.create({
    data: {
      productId: product.id,
      warehouseId: warehouse.id,
      quantity: 50,
      remainingQuantity: 50,
      costPrice: 9500,
    },
  });

  // Update product stock cache
  await prisma.product.update({
    where: { id: product.id },
    data: { stock: 50 },
  });

  // 6. Create Customer
  await prisma.customer.create({
    data: {
      name: 'Обычный клиент',
      phone: '---',
    },
  });

  await prisma.customer.create({
    data: {
      name: 'Alijon Rahmonov',
      phone: '+992 900 11 22 33',
    },
  });

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
