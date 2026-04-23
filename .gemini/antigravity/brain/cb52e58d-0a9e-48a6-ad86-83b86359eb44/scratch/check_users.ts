import { PrismaClient } from '../../../../../backend/node_modules/@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:D:/my_proj/wholesale_shop_desktop/backend/prisma/dev.db',
    },
  },
});

async function main() {
  const updated = await prisma.customer.update({
    where: { id: 2 },
    data: { name: 'Магазин 33' }
  });
  console.log('Updated customer:', updated.name);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
