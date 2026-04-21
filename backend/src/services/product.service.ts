import prisma from '../db/prisma.js';
import { StockService } from './stock.service.js';
import { 
  normalizeProductName, 
  buildProductNameKey, 
  normalizeBaseUnitName, 
  calculateEffectiveCostPrice, 
  parsePackagingFromRawName,
  normalizePackageName
} from '../utils/product-packaging.js';
import { roundMoney } from '../utils/money.js';
import { ValidationError, NotFoundError, ConflictError, ForbiddenError } from '../utils/errors.js';
import { ensureWarehouseAccess } from '../utils/access.js';

export class ProductService {
  /**
   * Simple helper for money formatting
   */
  private static formatMoneyValue(value: unknown) {
    return Number(value || 0).toFixed(2);
  }

  /**
   * Build a family key to detect variations of the same product
   */
  private static normalizeProductFamilyName(value: string | null | undefined) {
    return normalizeProductName(String(value || '')).name
      .toLowerCase()
      .replace(/\bмассой\s+\d+(?:[.,]\d+)?\s*(?:гр|г|кг|л|мл|шт)\b/giu, '')
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:гр|г|кг|л|мл|шт)\b/giu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract weight/volume indicator
   */
  private static extractMassKey(value: string | null | undefined) {
    const match = normalizeProductName(String(value || '')).name.toLowerCase().match(/(\d+(?:\.\d+)?)\s*(гр|г|кг|л|мл|шт)\b/u);
    return match ? `${match[1]} ${match[2]}` : '';
  }

  /**
   * Finds the oldest active product with same family/mass to use its name as canonical
   */
  public static async findCanonicalProductName(categoryId: number, name: string, excludeProductId?: number) {
    const familyKey = this.normalizeProductFamilyName(name);
    const massKey = this.extractMassKey(name);

    if (!familyKey || !massKey) return null;

    const products = await prisma.product.findMany({
      where: {
        active: true,
        categoryId,
        id: excludeProductId ? { not: excludeProductId } : undefined,
      },
      select: {
        id: true,
        name: true,
        stock: true,
        totalIncoming: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const candidate = products
      .filter((p: any) => this.normalizeProductFamilyName(p.name) === familyKey && this.extractMassKey(p.name) === massKey)
      .sort((a: any, b: any) => Number(b.stock || 0) - Number(a.stock || 0) || Number(b.totalIncoming || 0) - Number(a.totalIncoming || 0))[0];

    return candidate?.name || null;
  }

  /**
   * Comprehensive verification for duplicate products in a warehouse
   */
  public static async checkDuplicate(warehouseId: number, name: string, excludeProductId?: number) {
    const normalizedName = normalizeProductName(name).name;
    const familyKey = this.normalizeProductFamilyName(normalizedName);
    const massKey = this.extractMassKey(normalizedName);

    const existing = await prisma.product.findMany({
      where: { warehouseId, active: true, id: excludeProductId ? { not: excludeProductId } : undefined },
      select: { id: true, name: true }
    });

    for (const p of existing) {
      const pNormalized = normalizeProductName(p.name).name;
      if (pNormalized === normalizedName) return true;
      
      const pFamily = this.normalizeProductFamilyName(pNormalized);
      const pMass = this.extractMassKey(pNormalized);
      if (familyKey && pFamily === familyKey && massKey && pMass === massKey) return true;
    }

    return false;
  }

  /**
   * Creates a product with all associated packaging and initial stock in a single transaction
   */
  public static async createProduct(userId: number, warehouseId: number, data: any) {
    const { initialStock, packagings, ...rest } = data;
    
    const normalized = normalizeProductName(rest.name || rest.rawName);
    const canonicalName = await this.findCanonicalProductName(Number(rest.categoryId), normalized.name);
    const finalName = canonicalName || normalized.name;

    if (await this.checkDuplicate(warehouseId, finalName)) {
      throw new ConflictError(`Товар "${finalName}" уже существует на этом складе`);
    }

    const baseUnitName = normalizeBaseUnitName(String(rest.baseUnitName || rest.unit || ''));
    const purchasePrice = roundMoney(Number(rest.purchaseCostPrice || rest.costPrice || 0));
    const expensePercent = Number(rest.expensePercent || 0);
    const effectiveCost = roundMoney(calculateEffectiveCostPrice(purchasePrice, expensePercent));
    const sellingPrice = roundMoney(Number(rest.sellingPrice || 0));

    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          ...rest,
          name: finalName,
          rawName: normalized.rawName,
          brand: normalized.brand,
          nameKey: buildProductNameKey(finalName),
          sku: null,
          baseUnitName,
          unit: baseUnitName,
          purchaseCostPrice: purchasePrice,
          expensePercent,
          costPrice: effectiveCost,
          sellingPrice,
          warehouseId,
          initialStock: Number(initialStock || 0),
          stock: 0,
        }
      });

      // Handle Packagings
      const defaultPack = parsePackagingFromRawName(rest.name || rest.rawName);
      const allPacks = [...(Array.isArray(packagings) ? packagings : []), defaultPack]
        .filter(Boolean)
        .map((p: any, idx: number) => ({
          productId: product.id,
          warehouseId,
          packageName: normalizePackageName(p.packageName),
          baseUnitName: normalizeBaseUnitName(p.baseUnitName || baseUnitName),
          unitsPerPackage: Number(p.unitsPerPackage || 0),
          packageSellingPrice: p.packageSellingPrice ? roundMoney(p.packageSellingPrice) : null,
          barcode: p.barcode || null,
          isDefault: Boolean(p.isDefault ?? idx === 0),
          sortOrder: Number(p.sortOrder || idx),
        }))
        .filter(p => p.packageName && p.unitsPerPackage > 0);

      if (allPacks.length > 0) {
        await tx.productPackaging.createMany({ data: allPacks });
      }

      await tx.priceHistory.create({
        data: { productId: product.id, costPrice: effectiveCost, sellingPrice }
      });

      if (Number(initialStock) > 0) {
        await (StockService as any).addStock(
          product.id,
          warehouseId,
          Number(initialStock),
          effectiveCost,
          userId,
          'Начальный остаток',
          purchasePrice,
          expensePercent,
          tx
        );
      }

      return product;
    });
  }

  /**
   * Updates product details and coordinates price history/photo synchronizations
   */
  public static async updateProduct(productId: number, userId: number, data: any, access: any) {
    const { packaging, packagings, ...payload } = data;
    
    const old = await prisma.product.findUnique({ where: { id: productId } });
    if (!old) throw new NotFoundError('Товар не найден');

    if (!access.isAdmin && old.warehouseId !== access.warehouseId) {
      throw new ForbiddenError('Forbidden');
    }

    const normalized = normalizeProductName(payload.rawName || payload.name || old.rawName || old.name);
    const categoryId = payload.categoryId !== undefined ? Number(payload.categoryId) : old.categoryId;
    const canonicalName = await this.findCanonicalProductName(categoryId, normalized.name, productId);
    const newName = canonicalName || normalized.name;
    
    const warehouseId = access.isAdmin
      ? (payload.warehouseId !== undefined ? Number(payload.warehouseId) : old.warehouseId)
      : access.warehouseId;

    if (newName !== old.name || warehouseId !== old.warehouseId) {
      if (await this.checkDuplicate(warehouseId!, newName, productId)) {
        throw new ConflictError(`Товар "${newName}" уже существует на этом складе`);
      }
    }

    const baseUnitName = normalizeBaseUnitName(payload.baseUnitName || old.baseUnitName || old.unit);
    const purchasePrice = payload.purchaseCostPrice !== undefined 
      ? roundMoney(payload.purchaseCostPrice) 
      : roundMoney(old.purchaseCostPrice ?? old.costPrice);
    const expensePercent = payload.expensePercent !== undefined ? Number(payload.expensePercent) : Number(old.expensePercent || 0);
    const effectiveCost = roundMoney(calculateEffectiveCostPrice(purchasePrice, expensePercent));
    const sellingPrice = payload.sellingPrice !== undefined ? roundMoney(payload.sellingPrice) : old.sellingPrice;

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: productId },
        data: {
          ...payload,
          name: newName,
          rawName: normalized.rawName,
          brand: normalized.brand,
          nameKey: buildProductNameKey(newName),
          baseUnitName,
          unit: baseUnitName,
          purchaseCostPrice: purchasePrice,
          expensePercent,
          costPrice: effectiveCost,
          sellingPrice,
          sku: null,
          warehouseId
        }
      });

      // Photo fallback sync
      if (payload.photoUrl !== undefined) {
        const familyKey = this.normalizeProductFamilyName(newName);
        const related = await tx.product.findMany({
          where: { active: true, id: { not: productId } },
          select: { id: true, name: true }
        });
        const relatedIds = related
          .filter(r => this.normalizeProductFamilyName(r.name) === familyKey)
          .map(r => r.id);

        if (relatedIds.length > 0) {
          await tx.product.updateMany({
            where: { id: { in: relatedIds } },
            data: { photoUrl: payload.photoUrl || null }
          });
        }
      }

      // Price history audit
      if (effectiveCost !== Number(old.costPrice) || sellingPrice !== Number(old.sellingPrice)) {
        await tx.priceHistory.create({
          data: { productId, costPrice: effectiveCost, sellingPrice }
        });

        const historyWId = old.warehouseId ?? warehouseId ?? null;
        if (historyWId) {
          await tx.inventoryTransaction.create({
            data: {
              productId,
              warehouseId: historyWId,
              userId,
              qtyChange: 0,
              type: 'adjustment',
              reason: `Изменение цены: ${old.sellingPrice} -> ${sellingPrice}`,
              costAtTime: effectiveCost,
              sellingAtTime: sellingPrice,
            }
          });
        }
      }

      return updated;
    });
  }

  /**
   * soft or hard delete a product based on constraints
   */
  public static async deleteProduct(productId: number, access: any, force = false) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        batches: { where: { remainingQuantity: { gt: 0 } }, select: { id: true } }
      }
    });

    if (!product) throw new NotFoundError('Товар не найден');
    if (!access.isAdmin && product.warehouseId !== access.warehouseId) {
      throw new ForbiddenError('Forbidden');
    }

    if (force) {
      const [salesCount, purchasesCount] = await Promise.all([
        prisma.invoiceItem.count({ where: { productId } }),
        prisma.purchaseDocumentItem.count({ where: { matchedProductId: productId } }),
      ]);

      if (salesCount > 0) {
        throw new ValidationError('Нельзя удалить навсегда: товар уже участвовал в продажах. Используйте скрытие.');
      }

      return await prisma.$transaction(async (tx) => {
        if (purchasesCount > 0) {
          await tx.purchaseDocumentItem.updateMany({
            where: { matchedProductId: productId },
            data: { matchedProductId: null }
          });
        }

        await tx.inventoryTransaction.deleteMany({ where: { productId } });
        await tx.productBatch.deleteMany({ where: { productId } });
        await tx.productPackaging.deleteMany({ where: { productId } });
        await tx.priceHistory.deleteMany({ where: { productId } });
        await tx.product.delete({ where: { id: productId } });
        
        return { success: true, hardDeleted: true };
      });
    }

    await prisma.product.update({
      where: { id: productId },
      data: { active: false, stock: 0 }
    });
    return { success: true, hardDeleted: false };
  }

  /**
   * Decodes mojibake strings (often caused by encoding mismatches in older data)
   */
  private static decodeMojibake(value: string) {
    const source = String(value || '');
    if (!/[ÐÑ]/.test(source)) return source;
    try {
      return Buffer.from(source, 'latin1').toString('utf8');
    } catch {
      return source;
    }
  }

  /**
   * High-level history reason formatter with warehouse name resolution
   */
  private static async formatHistoryReason(reason: string | null | undefined, warehousesById: Map<number, string>) {
    const normalized = this.decodeMojibake(String(reason || ''))
      .replace(/Warehouse\s+#(\d+)/gi, (_match, idText) => {
        const warehouseName = warehousesById.get(Number(idText));
        return warehouseName || `Склад #${idText}`;
      });

    if (!normalized) return '';
    if (/^Initial Stock$/i.test(normalized)) return 'Начальный остаток';
    if (/^Stock Arrival$/i.test(normalized)) return 'Приход товара';
    if (/^Transfer to (.+)$/i.test(normalized)) return normalized.replace(/^Transfer to (.+)$/i, 'Перенос на $1');
    if (/^Transfer from (.+)$/i.test(normalized)) return normalized.replace(/^Transfer from (.+)$/i, 'Перенос со $1');
    if (/^Invoice #(\d+) Cancelled$/i.test(normalized)) return normalized.replace(/^Invoice #(\d+) Cancelled$/i, 'Отмена накладной #$1');

    return normalized
      .replace(/^Price change:/i, 'Изменение цены:')
      .replace(/^Selling price:/i, 'Цена продажи:')
      .replace(/^Cost price:/i, 'Себестоимость:');
  }

  /**
   * Complex product history aggregator (Transactions + Price events)
   */
  public static async getProductHistory(productId: number, access: any, pagination: { skip: number, limit: number }) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { warehouseId: true }
    });
    if (!product) throw new NotFoundError('Товар не найден');

    if (!access.isAdmin && product.warehouseId !== access.warehouseId) {
      throw new ForbiddenError('Forbidden');
    }

    const transactionWhere: any = { productId };
    if (product.warehouseId) transactionWhere.warehouseId = product.warehouseId;

    const [transactions, priceHistory, totalTransactions, totalPriceEvents] = await Promise.all([
      prisma.inventoryTransaction.findMany({
        where: transactionWhere,
        include: { user: true, warehouse: true },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.priceHistory.findMany({
        where: { productId },
        take: Math.min(pagination.limit, 300),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.inventoryTransaction.count({ where: transactionWhere }),
      prisma.priceHistory.count({ where: { productId } }),
    ]);

    // Resolve warehouse names used in reasons
    const warehouseIds = Array.from(new Set(
      transactions.flatMap((t: any) => {
        const matches = String(t.reason || '').match(/Warehouse\s+#(\d+)/gi) || [];
        return matches.map(m => Number((m.match(/(\d+)/) || [])[0])).filter(id => Number.isFinite(id));
      })
    ));

    const warehouses = await prisma.warehouse.findMany({
      where: { id: { in: warehouseIds } },
      select: { id: true, name: true }
    });
    const warehousesById = new Map(warehouses.map(w => [w.id, w.name]));

    const transactionHistory = await Promise.all(transactions.map(async (t: any) => {
      // Calculate return status for write-offs
      const returnedQty = (await prisma.inventoryTransaction.findMany({
        where: { referenceId: t.id, type: 'adjustment', qtyChange: { gt: 0 } }
      })).reduce((sum, c) => sum + Number(c.qtyChange || 0), 0);

      const originalQty = Math.abs(Number(t.qtyChange || 0));
      const isWriteOff = t.type === 'adjustment' && Number(t.qtyChange || 0) < 0 && String(t.reason || '').includes('Списание');
      const isWriteOffReturn = t.type === 'adjustment' && Number(t.qtyChange || 0) > 0 && String(t.reason || '').includes('Возврат списания');

      let writeOffStatus: string | null = null;
      if (isWriteOff) {
        writeOffStatus = returnedQty <= 0 ? 'writeoff' : (returnedQty < originalQty ? 'partial_return' : 'full_return');
      } else if (isWriteOffReturn) {
        writeOffStatus = 'return_record';
      }

      return {
        id: `tx-${t.id}`,
        transactionId: t.id,
        createdAt: t.createdAt,
        type: t.type,
        qtyChange: t.qtyChange,
        warehouse: t.warehouse,
        warehouseName: t.warehouse?.name || '---',
        username: t.user.username,
        reason: await this.formatHistoryReason(t.reason, warehousesById),
        returnedQty,
        writeOffStatus,
        canReverseIncoming: access.isAdmin && t.type === 'incoming' && Number(t.qtyChange || 0) > 0,
        canReverseCorrectionWriteOff: access.isAdmin && isWriteOff && !String(t.reason || '').includes('коррект') && returnedQty <= 0,
        canReturnWriteOff: access.isAdmin && isWriteOff && originalQty > returnedQty,
        canDeleteWriteOffPermanently: access.isAdmin && isWriteOff && returnedQty <= 0,
      };
    }));

    const priceEvents = access.isAdmin ? priceHistory.map((p: any) => ({
      id: `price-${p.id}`,
      createdAt: p.createdAt,
      type: 'price_change',
      qtyChange: 0,
      warehouse: null,
      warehouseName: '---',
      username: 'system',
      reason: `Цена продажи: ${this.formatMoneyValue(p.sellingPrice)}, себестоимость: ${this.formatMoneyValue(p.costPrice)}`,
    })) : [];
    return {
      history: [...transactionHistory, ...priceEvents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      total: totalTransactions + (access.isAdmin ? totalPriceEvents : 0)
    };
  }

  public static async restockProduct(productId: number, userId: number, data: any, access: any) {
    const { quantity, costPrice, purchaseCostPrice, sellingPrice, expensePercent, reason } = data;
    const warehouseId = access.isAdmin ? Number(data.warehouseId) : access.warehouseId;

    if (!warehouseId || !ensureWarehouseAccess(access, warehouseId)) {
      throw new ForbiddenError('No access to this warehouse');
    }

    return await prisma.$transaction(async (tx: any) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new NotFoundError('Товар не найден');

      const resolvedPurchaseCost = roundMoney(purchaseCostPrice ?? costPrice ?? 0);
      const resolvedExpensePercent = Number(expensePercent ?? 0);
      const resolvedEffectiveCost = roundMoney(resolvedPurchaseCost * (1 + resolvedExpensePercent / 100));
      const resolvedSellingPrice = (sellingPrice != null && sellingPrice !== '') ? roundMoney(sellingPrice) : Number(product.sellingPrice);

      await tx.product.update({
        where: { id: productId },
        data: {
          purchaseCostPrice: resolvedPurchaseCost,
          expensePercent: resolvedExpensePercent,
          costPrice: resolvedEffectiveCost,
          sellingPrice: resolvedSellingPrice,
        }
      });

      if (resolvedEffectiveCost !== Number(product.costPrice) || resolvedSellingPrice !== Number(product.sellingPrice)) {
        await tx.priceHistory.create({
          data: { productId, costPrice: resolvedEffectiveCost, sellingPrice: resolvedSellingPrice }
        });
      }

      return await StockService.addStock(
        productId,
        warehouseId,
        quantity,
        resolvedEffectiveCost,
        userId,
        reason,
        resolvedPurchaseCost,
        resolvedExpensePercent,
        tx
      );
    });
  }

  public static async mergeProducts(sourceId: number, targetId: number, access: any) {
    if (sourceId === targetId) throw new ValidationError('Нельзя объединить товар с самим собой');

    return await prisma.$transaction(async (tx: any) => {
      const [src, dst] = await Promise.all([
        tx.product.findUnique({ where: { id: sourceId } }),
        tx.product.findUnique({ where: { id: targetId } }),
      ]);

      if (!src || !dst) throw new NotFoundError('Один из товаров не найден');
      if (src.warehouseId !== dst.warehouseId) throw new ValidationError('Объединять можно только товары из одного склада');

      await tx.productBatch.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });
      await tx.invoiceItem.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });
      await tx.inventoryTransaction.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });
      await tx.priceHistory.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });
      await tx.productPackaging.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });

      const targetBatches = await tx.productBatch.findMany({
        where: { productId: targetId },
        select: { quantity: true, remainingQuantity: true },
      });

      const nextStock = targetBatches.reduce((sum: number, b: any) => sum + Number(b.remainingQuantity || 0), 0);
      const nextIncoming = targetBatches.reduce((sum: number, b: any) => sum + Number(b.quantity || 0), 0);

      await tx.product.update({
        where: { id: targetId },
        data: {
          stock: nextStock,
          totalIncoming: nextIncoming,
          initialStock: Math.max(Number(dst.initialStock || 0), nextIncoming),
          photoUrl: dst.photoUrl || src.photoUrl || null,
        },
      });

      await tx.product.update({
        where: { id: sourceId },
        data: {
          active: false,
          stock: 0,
          totalIncoming: 0,
          initialStock: 0,
          name: `${src.name} [merged ${sourceId}]`,
          photoUrl: null,
          sku: null,
          barcode: null
        },
      });

      return { success: true };
    });
  }
}
