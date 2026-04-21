import prisma from '../db/prisma.js';
import { ValidationError, ConflictError, NotFoundError } from '../utils/errors.js';

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNumber(value: any, fallback = 0): number {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Rounds a quantity to standard precision (2 decimal places)
 */
function roundQty(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}



export class StockService {
  static isCorrectionWriteOffReason(reason: unknown) {
    const normalized = String(reason || '').trim().toLowerCase();
    return normalized.includes('коррект');
  }

  /**
   * Allocates stock from batches using FIFO logic.
   */
  static async allocateStock(
    productId: number,
    warehouseId: number,
    quantity: number,
    invoiceItemId: number,
    tx?: any
  ) {
    const client = tx || prisma;
    const requiredQty = roundQty(toNumber(quantity, 0));

    if (requiredQty <= 0) {
      throw new ValidationError('Количество для списания должно быть больше 0');
    }

    let remainingToAllocate = requiredQty;
    let totalCost = 0;

    const batches = await client.productBatch.findMany({
      where: {
        productId,
        warehouseId,
        remainingQuantity: { gt: 0 },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const totalAvailable = batches.reduce(
      (sum: number, b: any) => sum + Number(b.remainingQuantity || 0),
      0
    );

    if (totalAvailable < requiredQty) {
      throw new ValidationError(
        `Недостаточно товара на складе (ID: ${productId}). Доступно: ${totalAvailable}, Требуется: ${requiredQty}`
      );
    }

    for (const batch of batches) {
      if (remainingToAllocate <= 0) break;

      const batchRemaining = roundQty(toNumber(batch.remainingQuantity, 0));
      const takeFromBatch = Math.min(batchRemaining, remainingToAllocate);
      totalCost += takeFromBatch * Number(batch.costPrice || 0);

      await client.productBatch.update({
        where: { id: batch.id },
        data: {
          remainingQuantity: { decrement: takeFromBatch },
        },
      });

      await client.saleAllocation.create({
        data: {
          invoiceItemId,
          batchId: batch.id,
          quantity: takeFromBatch,
        },
      });

      remainingToAllocate -= takeFromBatch;
    }

    await this.updateProductStockCache(productId, client);

    return round2(totalCost / requiredQty);
  }

  /**
   * Returns stock to batches.
   */
  static async deallocateStock(
    invoiceItemId: number,
    quantityToReturn?: number,
    specificBatchId?: number,
    tx?: any,
    shouldUpdateCache = true
  ) {
    const client = tx || prisma;
    const whereClause: any = { invoiceItemId };

    if (specificBatchId) {
      whereClause.batchId = specificBatchId;
    }

    const allocations = await client.saleAllocation.findMany({
      where: whereClause,
      include: { batch: true },
      orderBy: {
        batch: {
          createdAt: 'asc',
        },
      },
    });

    let remainingToReturn =
      quantityToReturn != null
        ? roundQty(toNumber(quantityToReturn, 0))
        : allocations.reduce((sum: number, a: any) => sum + Number(a.quantity || 0), 0);

    for (const allocation of allocations) {
      if (remainingToReturn <= 0) break;

      const allocQty = roundQty(toNumber(allocation.quantity, 0));
      const amountToReturnToThisBatch = Math.min(allocQty, remainingToReturn);

      await client.productBatch.update({
        where: { id: allocation.batchId },
        data: {
          remainingQuantity: { increment: amountToReturnToThisBatch },
        },
      });

      if (amountToReturnToThisBatch === allocQty) {
        await client.saleAllocation.delete({ where: { id: allocation.id } });
      } else {
        await client.saleAllocation.update({
          where: { id: allocation.id },
          data: { quantity: { decrement: amountToReturnToThisBatch } },
        });
      }

      remainingToReturn -= amountToReturnToThisBatch;
    }

    if (shouldUpdateCache) {
      const item = await client.invoiceItem.findUnique({ where: { id: invoiceItemId } });
      if (item) {
        await this.updateProductStockCache(item.productId, client);
      }
    }
  }

  /**
   * Transfers stock between warehouses.
   */
  static async transferStock(
    productId: number,
    fromWarehouseId: number,
    toWarehouseId: number,
    quantity: number,
    userId: number
  ) {
    const transferQty = roundQty(toNumber(quantity, 0));

    if (transferQty <= 0) {
      throw new ValidationError('Количество для переноса должно быть больше 0');
    }

    return await prisma.$transaction(async (tx: any) => {
      const sourceBatches = await tx.productBatch.findMany({
        where: {
          productId,
          warehouseId: fromWarehouseId,
          remainingQuantity: { gt: 0 },
        },
        orderBy: { createdAt: 'asc' },
      });

      const totalAvailable = sourceBatches.reduce(
        (sum: number, b: any) => sum + Number(b.remainingQuantity || 0),
        0
      );

      if (totalAvailable < transferQty) {
      throw new ValidationError(
          `Недостаточно товара для перемещения. Доступно: ${totalAvailable}, Требуется: ${transferQty}`
        );
      }

      let remainingToTransfer = transferQty;

      for (const batch of sourceBatches) {
        if (remainingToTransfer <= 0) break;

        const batchRemaining = roundQty(toNumber(batch.remainingQuantity, 0));
        const takeFromBatch = Math.min(batchRemaining, remainingToTransfer);

        await tx.productBatch.update({
          where: { id: batch.id },
          data: { remainingQuantity: { decrement: takeFromBatch } },
        });

        await tx.productBatch.create({
          data: {
            productId,
            warehouseId: toWarehouseId,
            quantity: takeFromBatch,
            remainingQuantity: takeFromBatch,
            costPrice: round2(toNumber(batch.costPrice, 0)),
          },
        });

        remainingToTransfer -= takeFromBatch;
      }

      await tx.inventoryTransaction.create({
        data: {
          productId,
          warehouseId: fromWarehouseId,
          userId,
          qtyChange: -transferQty,
          type: 'transfer',
          reason: `Transfer to Warehouse #${toWarehouseId}`,
        },
      });

      await tx.inventoryTransaction.create({
        data: {
          productId,
          warehouseId: toWarehouseId,
          userId,
          qtyChange: transferQty,
          type: 'transfer',
          reason: `Transfer from Warehouse #${fromWarehouseId}`,
        },
      });

      await this.updateProductStockCache(productId, tx);

      return { success: true };
    });
  }

  /**
   * Adds incoming stock.
   * quantity must already be in pieces (шт)
   * costPrice must already be in TJS per 1 piece
   */
  static async addStock(
    productId: number,
    warehouseId: number,
    quantity: number,
    costPrice: number,
    userId: number,
    reason?: string,
    purchaseCostPrice?: number,
    expensePercent?: number,
    tx?: any,
    type: string = 'incoming',
    referenceId?: number
  ) {
    const client = tx || prisma;
    const normalizedQty = roundQty(toNumber(quantity, 0));
    const normalizedCost = round2(toNumber(costPrice, 0));
    const normalizedReason = String(reason || 'Stock Arrival').trim();
    const normalizedPurchaseCost = purchaseCostPrice !== undefined ? round2(toNumber(purchaseCostPrice, 0)) : normalizedCost;
    const normalizedExpensePercent = expensePercent !== undefined ? toNumber(expensePercent, 0) : 0;

    if (normalizedQty <= 0) {
      throw new ValidationError('Количество должно быть больше 0');
    }

    if (normalizedCost < 0) {
      throw new ValidationError('Цена закупки не может быть отрицательной');
    }

    const execute = async (t: any) => {
      const batch = await t.productBatch.create({
        data: {
          productId,
          warehouseId,
          quantity: normalizedQty,
          remainingQuantity: normalizedQty,
          costPrice: normalizedCost,
          purchaseCostPrice: normalizedPurchaseCost,
          expensePercent: normalizedExpensePercent,
        },
      });

      await t.inventoryTransaction.create({
        data: {
          productId,
          warehouseId,
          userId,
          qtyChange: normalizedQty,
          type: type as any,
          reason: normalizedReason,
          costAtTime: normalizedCost,
          referenceId: referenceId
        },
      });

      await t.product.update({
        where: { id: productId },
        data: {
          stock: { increment: normalizedQty },
          totalIncoming: { increment: normalizedQty },
          costPrice: normalizedCost,
          purchaseCostPrice: normalizedPurchaseCost,
          expensePercent: normalizedExpensePercent,
          unit: 'шт',
        },
      });

      return batch;
    };

    if (tx) {
      return await execute(tx);
    } else {
      return await prisma.$transaction(async (t) => await execute(t));
    }
  }

  static async reverseIncomingTransaction(transactionId: number, userId: number) {
    return await prisma.$transaction(async (tx) => {
      const transaction = await tx.inventoryTransaction.findUnique({
        where: { id: transactionId },
      });

      if (!transaction || transaction.type !== 'incoming') {
        throw new NotFoundError('Приходная транзакция не найдена');
      }

      // Find the batch created by this transaction
      const batch = await tx.productBatch.findFirst({
        where: {
          productId: transaction.productId,
          warehouseId: transaction.warehouseId,
          quantity: transaction.qtyChange,
          createdAt: {
            gte: new Date(transaction.createdAt.getTime() - 2000),
            lte: new Date(transaction.createdAt.getTime() + 2000)
          }
        }
      });

      if (!batch) {
        throw new Error('Партия для этого прихода не найдена или уже была изменена.');
      }

      if (Math.abs(batch.remainingQuantity - batch.quantity) > 0.001) {
        throw new ConflictError('Нельзя отменить приход: товар из этой партии уже продан или списан.');
      }

      await tx.productBatch.delete({ where: { id: batch.id } });
      await tx.inventoryTransaction.delete({ where: { id: transactionId } });
      await this.updateProductStockCache(transaction.productId, tx);

      return { success: true };
    });
  }

  private static async addStockToExistingBatches(
    productId: number,
    warehouseId: number,
    quantity: number,
    tx: any
  ) {
    const batches = await tx.productBatch.findMany({
      where: { productId, warehouseId },
      orderBy: { createdAt: 'asc' },
    });

    let remaining = quantity;
    for (const batch of batches) {
      if (remaining <= 0) break;

      await tx.productBatch.update({
        where: { id: batch.id },
        data: { 
          remainingQuantity: { increment: remaining } 
        },
      });
      remaining = 0;
    }

    if (remaining > 0 && batches.length > 0) {
      await tx.productBatch.update({
        where: { id: batches[batches.length - 1].id },
        data: { remainingQuantity: { increment: remaining } },
      });
      remaining = 0;
    }

    return remaining === 0;
  }

  static async reverseCorrectionWriteOff(transactionId: number, userId: number) {
    return await prisma.$transaction(async (tx) => {
      const transaction = await tx.inventoryTransaction.findUnique({
        where: { id: transactionId }
      });

      if (!transaction || transaction.qtyChange >= 0) {
        throw new NotFoundError('Транзакция списания не найдена');
      }

      const qtyToReturn = Math.abs(transaction.qtyChange);

      const returnedToExisting = await this.addStockToExistingBatches(
        transaction.productId,
        transaction.warehouseId,
        qtyToReturn,
        tx
      );

      if (!returnedToExisting) {
        await this.addStock(
          transaction.productId,
          transaction.warehouseId,
          qtyToReturn,
          Number(transaction.costAtTime || 0),
          userId,
          `Отмена списания #${transactionId}`,
          undefined,
          undefined,
          tx
        );
      }

      await tx.inventoryTransaction.delete({ where: { id: transactionId } });
      await this.updateProductStockCache(transaction.productId, tx);

      return { success: true };
    });
  }

  static async returnWriteOffTransaction(transactionId: number, quantity: number, userId: number, reason: string) {
    return await prisma.$transaction(async (tx) => {
      const transaction = await tx.inventoryTransaction.findUnique({
        where: { id: transactionId }
      });

      if (!transaction || transaction.qtyChange >= 0) {
        throw new NotFoundError('Транзакция списания не найдена');
      }

      const maxReturn = Math.abs(transaction.qtyChange);
      if (quantity <= 0 || quantity > maxReturn + 0.001) {
        throw new ValidationError(`Некорректное количество. Макс: ${maxReturn}`);
      }

      const returnedToExisting = await this.addStockToExistingBatches(
        transaction.productId,
        transaction.warehouseId,
        quantity,
        tx
      );

      if (!returnedToExisting) {
        await this.addStock(
          transaction.productId,
          transaction.warehouseId,
          quantity,
          Number(transaction.costAtTime || 0),
          userId,
          reason || `Возврат списания #${transactionId}`,
          undefined,
          undefined,
          tx,
          'adjustment',
          transactionId
        );
      } else {
        // If returned to existing batches, addStock wasn't called, so we must create transaction manually
        await tx.inventoryTransaction.create({
          data: {
            productId: transaction.productId,
            warehouseId: transaction.warehouseId,
            userId,
            qtyChange: quantity,
            type: 'adjustment',
            reason: reason || `Возврат списания #${transactionId}`,
            referenceId: transactionId,
            costAtTime: Number(transaction.costAtTime || 0)
          }
        });
      }

      await this.updateProductStockCache(transaction.productId, tx);
      return { success: true };
    });
  }


  static async deleteWriteOffTransactionPermanently(transactionId: number) {
    await prisma.inventoryTransaction.delete({ where: { id: transactionId } });
    return { success: true };
  }

  static async writeOffStock(
    productId: number,
    warehouseId: number,
    quantity: number,
    userId: number,
    reason: string,
  ) {
    const normalizedQty = roundQty(toNumber(quantity, 0));
    const normalizedReason = String(reason || '').trim();

    if (normalizedQty <= 0) {
      throw new ValidationError('Количество для списания должно быть больше 0');
    }

    if (!normalizedReason) {
      throw new ValidationError('Укажите причину списания');
    }

    return await prisma.$transaction(async (tx: any) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          stock: true,
          sellingPrice: true,
        },
      });

      if (!product) {
        throw new NotFoundError('Товар не найден');
      }

      if (Number(product.stock || 0) < normalizedQty) {
        throw new ValidationError('Недостаточно остатка для списания');
      }

      const batches = await tx.productBatch.findMany({
        where: {
          productId,
          warehouseId,
          remainingQuantity: { gt: 0 },
        },
        orderBy: { createdAt: 'asc' },
      });

      const totalAvailable = batches.reduce(
        (sum: number, batch: any) => sum + Number(batch.remainingQuantity || 0),
        0,
      );

      if (totalAvailable < normalizedQty) {
        throw new ValidationError('Недостаточно остатка в партиях для списания');
      }

      let remainingToWriteOff = normalizedQty;
      let totalCost = 0;

      for (const batch of batches) {
        if (remainingToWriteOff <= 0) break;

        const batchRemaining = roundQty(toNumber(batch.remainingQuantity, 0));
        const takeFromBatch = Math.min(batchRemaining, remainingToWriteOff);
        totalCost += takeFromBatch * toNumber(batch.costPrice, 0);

        await tx.productBatch.update({
          where: { id: batch.id },
          data: {
            remainingQuantity: { decrement: takeFromBatch },
          },
        });

        remainingToWriteOff -= takeFromBatch;
      }

      const averageCost = normalizedQty > 0 ? round2(totalCost / normalizedQty) : 0;

      const transaction = await tx.inventoryTransaction.create({
        data: {
          productId,
          warehouseId,
          userId,
          qtyChange: -normalizedQty,
          type: 'adjustment',
          reason: `Списание: ${normalizedReason}`,
          costAtTime: averageCost,
          sellingAtTime: round2(toNumber(product.sellingPrice, 0)),
        },
      });

      await this.updateProductStockCache(productId, tx);

      return {
        success: true,
        transactionId: transaction.id,
      };
    });
  }

  /**
   * Rebuild product stock and total incoming from batches.
   */
  static async updateProductStockCache(productId: number, tx?: any) {
    const client = tx || prisma;

    const batches = await client.productBatch.findMany({
      where: { productId },
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

    await client.product.update({
      where: { id: productId },
      data: {
        stock: totalStock,
        totalIncoming: totalIncoming,
        unit: 'шт',
      },
    });
  }

  static async zeroBatchRemaining(batchId: number, userId: number) {
    return await prisma.$transaction(async (tx: any) => {
      const batch = await tx.productBatch.findUnique({
        where: { id: batchId },
        select: { 
          id: true, 
          productId: true, 
          warehouseId: true, 
          remainingQuantity: true, 
          costPrice: true,
          product: { select: { sellingPrice: true } }
        }
      });
      if (!batch) throw new NotFoundError('Партия не найдена');
      if (batch.remainingQuantity <= 0) return { success: true };

      const qtyToWriteOff = batch.remainingQuantity;

      await tx.productBatch.update({
        where: { id: batch.id },
        data: { remainingQuantity: 0 }
      });

      await tx.inventoryTransaction.create({
        data: {
          productId: batch.productId,
          warehouseId: batch.warehouseId,
          userId,
          qtyChange: -qtyToWriteOff,
          type: 'adjustment',
          reason: `Batch #${batchId} Zeroed`,
          costAtTime: Number(batch.costPrice || 0),
          sellingAtTime: Number((batch as any).product?.sellingPrice || 0)
        }
      });

      await this.updateProductStockCache(batch.productId, tx);
      return { success: true };
    });
  }

  static async deleteBatch(batchId: number) {
    return await prisma.$transaction(async (tx: any) => {
      const batch = await tx.productBatch.findUnique({
        where: { id: batchId },
        include: { saleAllocations: true }
      });
      if (!batch) throw new NotFoundError('Партия не найдена');
      if (batch.remainingQuantity !== batch.quantity) throw new ConflictError('Нельзя удалить партию, из которой уже продан товар');
      if (batch.saleAllocations.length > 0) throw new ConflictError('Партия используется в резервах');

      await tx.productBatch.delete({ where: { id: batchId } });
      await this.updateProductStockCache(batch.productId, tx);
      return { success: true };
    });
  }
}
