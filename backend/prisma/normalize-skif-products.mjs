import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const normalizeVolumeSpacing = (value) =>
  String(value || '')
    .replace(/(\d)\s*[.,]\s*(\d)/gu, '$1.$2')
    .replace(/(\d)\s+(\d)(?=\s*(?:гр|г|кг|л|мл)\b)/giu, '$1.$2')
    .replace(/(\d(?:\.\d+)?)\s*(гр|г|кг|л|мл|шт)\b/giu, '$1 $2');

const normalizeProductName = (value) =>
  normalizeVolumeSpacing(value)
    .replace(/\s*\[[^\]]*\]\s*$/u, '')
    .replace(/[«"“”„‟'][^«"“”„‟']+[»"“”„‟']/gu, ' ')
    .replace(/\bskif\b/giu, ' ')
    .replace(/[«»“”„‟"']/gu, '')
    .replace(/[(),]/gu, ' ')
    .replace(/plasticковых/giu, 'пластиковых')
    .replace(/[ёЁ]/gu, 'е')
    .replace(/\s+/g, ' ')
    .trim();

const mergeProducts = async (tx, sourceProduct, targetProduct) => {
  await tx.productBatch.updateMany({
    where: { productId: sourceProduct.id },
    data: { productId: targetProduct.id },
  });

  await tx.invoiceItem.updateMany({
    where: { productId: sourceProduct.id },
    data: { productId: targetProduct.id },
  });

  await tx.inventoryTransaction.updateMany({
    where: { productId: sourceProduct.id },
    data: { productId: targetProduct.id },
  });

  await tx.priceHistory.updateMany({
    where: { productId: sourceProduct.id },
    data: { productId: targetProduct.id },
  });

  const targetBatches = await tx.productBatch.findMany({
    where: { productId: targetProduct.id },
    select: { quantity: true, remainingQuantity: true },
  });

  const nextStock = targetBatches.reduce((sum, batch) => sum + Number(batch.remainingQuantity || 0), 0);
  const nextIncoming = targetBatches.reduce((sum, batch) => sum + Number(batch.quantity || 0), 0);

  await tx.product.update({
    where: { id: targetProduct.id },
    data: {
      stock: nextStock,
      totalIncoming: nextIncoming,
      initialStock: Math.max(Number(targetProduct.initialStock || 0), nextIncoming),
      photoUrl: targetProduct.photoUrl || sourceProduct.photoUrl || null,
      costPrice: Number(targetProduct.costPrice || 0) || Number(sourceProduct.costPrice || 0),
      sellingPrice: Number(targetProduct.sellingPrice || 0) || Number(sourceProduct.sellingPrice || 0),
    },
  });

  await tx.product.update({
    where: { id: sourceProduct.id },
    data: {
      active: false,
      stock: 0,
      totalIncoming: 0,
      initialStock: 0,
      name: `${sourceProduct.name} [merged ${sourceProduct.id}]`,
      photoUrl: null,
      sku: null,
    },
  });
};

async function main() {
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const groups = new Map();
  for (const product of products) {
    const canonicalName = normalizeProductName(product.name);
    if (!canonicalName) continue;
    const group = groups.get(canonicalName) || [];
    group.push(product);
    groups.set(canonicalName, group);
  }

  let mergedCount = 0;
  let renamedCount = 0;

  for (const [canonicalName, group] of groups.entries()) {
    const byWarehouse = new Map();
    for (const product of group) {
      const key = String(product.warehouseId ?? 'null');
      const items = byWarehouse.get(key) || [];
      items.push(product);
      byWarehouse.set(key, items);
    }

    for (const warehouseProducts of byWarehouse.values()) {
      const [target, ...duplicates] = warehouseProducts;

      if (target.name !== canonicalName) {
        await prisma.product.update({
          where: { id: target.id },
          data: { name: canonicalName },
        });
        target.name = canonicalName;
        renamedCount += 1;
      }

      for (const duplicate of duplicates) {
        await prisma.$transaction(async (tx) => {
          await mergeProducts(tx, duplicate, target);
        });
        mergedCount += 1;
      }
    }
  }

  const remainingProducts = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ warehouseId: 'asc' }, { name: 'asc' }],
    select: { id: true, warehouseId: true, name: true },
  });

  console.log(
    JSON.stringify(
      {
        mergedCount,
        renamedCount,
        activeProducts: remainingProducts.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
