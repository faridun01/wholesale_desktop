import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tables: any[] = await prisma.$queryRaw`SELECT name FROM sqlite_master WHERE type='table'`;
  console.log('Tables found:', tables.map(t => t.name).join(', '));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
