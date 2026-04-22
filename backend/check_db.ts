import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log('Total Users:', users.length);
  users.forEach(u => {
    console.log(`- User: ${u.username}, Role: ${u.role}, Active: ${u.active}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
