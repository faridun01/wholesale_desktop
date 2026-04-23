import { PrismaClient } from '../generated/client/index.js';
import fs from 'fs';
import path from 'path';

async function checkFile(filePath) {
  const dbUrl = `file:${path.resolve(filePath)}`;
  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } }
  });
  
  try {
    const productCount = await prisma.product.count();
    console.log(`File: ${path.basename(filePath)} | Products: ${productCount}`);
    return productCount;
  } catch (err) {
    console.log(`File: ${path.basename(filePath)} | Error: ${err.message}`);
    return -1;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const dir = './prisma';
  const files = fs.readdirSync(dir).filter(f => f.includes('dev.db.bak'));
  
  console.log('--- SCANNING BACKUPS ---');
  for (const file of files) {
    await checkFile(path.join(dir, file));
  }
}

main();
