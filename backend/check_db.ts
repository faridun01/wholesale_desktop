import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function main() {
  console.log('ENV DATABASE_URL:', process.env.DATABASE_URL);
  const count = await prisma.user.count();
  console.log('User Count:', count);
  const users = await prisma.user.findMany();
  users.forEach(u => console.log('Found user:', u.username));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
