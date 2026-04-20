import prisma from '../db/prisma.js';

async function recalibrate() {
  console.log('Starting recalibration...');
  const products = await prisma.product.findMany({
    select: { id: true, name: true }
  });

  for (const product of products) {
    const batches = await prisma.productBatch.findMany({
      where: { productId: product.id },
      select: { 
        quantity: true,
        remainingQuantity: true 
      },
    });

    const totalStock = batches.reduce(
      (sum: number, b: any) => sum + Number(b.remainingQuantity || 0),
      0
    );

    const totalIncoming = batches.reduce(
      (sum: number, b: any) => sum + Number(b.quantity || 0),
      0
    );

    await prisma.product.update({
      where: { id: product.id },
      data: {
        stock: totalStock,
        totalIncoming: totalIncoming
      },
    });
    console.log(`Recalibrated Product #${product.id} (${product.name}): Stock ${totalStock}, Incoming ${totalIncoming}`);
  }
}

recalibrate()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
