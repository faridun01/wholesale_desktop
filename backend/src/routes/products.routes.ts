import { Router } from 'express';
import prisma from '../db/prisma.js';
import { StockService } from '../services/stock.service.js';
import { AuthRequest } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/auth.middleware.js';
import { ensureWarehouseAccess, getAccessContext, getScopedWarehouseId } from '../utils/access.js';
import { parsePaginationQuery, setPaginationHeaders } from '../utils/pagination.js';
import {
  buildProductNameKey,
  calculateEffectiveCostPrice,
  normalizeBaseUnitName,
  normalizePackageName,
  normalizeProductName,
  parsePackagingFromRawName,
} from '../utils/product-packaging.js';
import { roundMoney } from '../utils/money.js';

const router = Router();
const StockSvc = StockService as any;
const isCorrectionWriteOffReason = (reason: unknown) => {
  const nativeCheck = StockSvc?.isCorrectionWriteOffReason;
  if (typeof nativeCheck === 'function') {
    return Boolean(nativeCheck.call(StockSvc, reason));
  }
  return true;
};

const normalizeProductFamilyName = (value: string | null | undefined) =>
  normalizeProductName(String(value || '')).name
    .toLowerCase()
    .replace(/\bмассой\s+\d+(?:[.,]\d+)?\s*(?:гр|г|кг|л|мл|шт)\b/giu, '')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:гр|г|кг|л|мл|шт)\b/giu, '')
    .replace(/\s+/g, ' ')
    .trim();

const extractMassKey = (value: string | null | undefined) => {
  const match = normalizeProductName(String(value || '')).name.toLowerCase().match(/(\d+(?:\.\d+)?)\s*(гр|г|кг|л|мл|шт)\b/u);
  return match ? `${match[1]} ${match[2]}` : '';
};

const findCanonicalProductName = async (categoryId: number, name: string, excludeProductId?: number) => {
  const familyKey = normalizeProductFamilyName(name);
  const massKey = extractMassKey(name);

  if (!familyKey || !massKey) {
    return null;
  }

  const products = await prisma.product.findMany({
    where: {
      active: true,
      categoryId,
      id: excludeProductId ? { not: excludeProductId } : undefined,
    },
    select: {
      id: true,
      name: true,
      warehouseId: true,
      stock: true,
      totalIncoming: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const candidate = products
    .filter((product: any) => normalizeProductFamilyName(product.name) === familyKey && extractMassKey(product.name) === massKey)
    .sort((a: any, b: any) => Number(b.stock || 0) - Number(a.stock || 0) || Number(b.totalIncoming || 0) - Number(a.totalIncoming || 0))[0];

  return candidate?.name || null;
};

const isDuplicateProductCandidate = (
  candidateName: string | null | undefined,
  nextName: string | null | undefined,
) => {
  const normalizedCandidate = normalizeProductName(String(candidateName || '')).name;
  const normalizedNext = normalizeProductName(String(nextName || '')).name;

  if (!normalizedCandidate || !normalizedNext) {
    return false;
  }

  if (normalizedCandidate === normalizedNext) {
    return true;
  }

  const candidateFamily = normalizeProductFamilyName(normalizedCandidate);
  const nextFamily = normalizeProductFamilyName(normalizedNext);
  const candidateMass = extractMassKey(normalizedCandidate);
  const nextMass = extractMassKey(normalizedNext);

  return Boolean(candidateFamily && nextFamily && candidateMass && nextMass && candidateFamily === nextFamily && candidateMass === nextMass);
};

const findWarehouseDuplicateProduct = (
  products: Array<{ id: number; name: string }>,
  nextName: string,
  excludeProductId?: number,
) =>
  products.find((product) => (
    (!excludeProductId || product.id !== excludeProductId) &&
    isDuplicateProductCandidate(product.name, nextName)
  )) || null;

const formatMoneyValue = (value: unknown) => Number(value || 0).toFixed(2);

const ensureAdminProductAccess = (access: Awaited<ReturnType<typeof getAccessContext>>, res: any) => {
  if (!access.isAdmin) {
    res.status(403).json({ error: 'Только администратор может выполнять это действие' });
    return false;
  }

  return true;
};

const applyFamilyPhotoFallback = <T extends { id: number; name: string | null; photoUrl?: string | null }>(items: T[]) => {
  const familyPhotoMap = new Map<string, string>();

  for (const item of items) {
    const familyKey = normalizeProductFamilyName(item.name);
    if (!familyKey || !item.photoUrl) continue;
    if (!familyPhotoMap.has(familyKey)) {
      familyPhotoMap.set(familyKey, item.photoUrl);
    }
  }

  return items.map((item) => {
    if (item.photoUrl) {
      return item;
    }

    const familyKey = normalizeProductFamilyName(item.name);
    const inheritedPhoto = familyKey ? familyPhotoMap.get(familyKey) : null;

    return inheritedPhoto ? { ...item, photoUrl: inheritedPhoto } : item;
  });
};

router.get('/', async (req, res, next) => {
  try {
    const access = await getAccessContext(req as AuthRequest);
    const warehouseId = getScopedWarehouseId(access, req.query.warehouseId);
    const sortBy = String(req.query.sortBy || '').toLowerCase();
    const { page, limit, skip } = parsePaginationQuery(req.query, { defaultLimit: 500, maxLimit: 1000 });
    const where = {
      active: true,
      warehouseId: warehouseId ?? undefined,
    };
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { 
          category: true, 
          warehouse: true,
          packagings: {
            where: { active: true },
            orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { unitsPerPackage: 'asc' }],
          },
          priceHistory: {
            take: 2,
            orderBy: { createdAt: 'desc' }
          },
          batches: warehouseId ? {
            where: { warehouseId: Number(warehouseId) }
          } : false
        },
        skip,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);
    setPaginationHeaders(res, { page, limit, total });

    const productsWithResolvedPhoto = applyFamilyPhotoFallback(products as any[])
      .sort((a: any, b: any) => {
        if (sortBy === 'brand') {
          return String(a.brand || '').localeCompare(String(b.brand || ''), 'ru') || String(a.name || '').localeCompare(String(b.name || ''), 'ru');
        }

        return 0;
      });

    if (warehouseId) {
      const productsWithWarehouseStock = productsWithResolvedPhoto.map((p: any) => {
        // Fallback to p.stock if no batches found to ensure products are visible even if batch data is missing
        const hasBatches = Array.isArray(p.batches) && p.batches.length > 0;
        const warehouseStock = hasBatches 
          ? p.batches.reduce((sum: number, b: any) => sum + b.remainingQuantity, 0)
          : Number(p.stock || 0);

        return {
          ...p,
          stock: warehouseStock,
          costPrice: access.isAdmin ? p.costPrice : null,
        };
      });
      return res.json(productsWithWarehouseStock);
    }

    res.json(
      productsWithResolvedPhoto.map((product: any) => ({
        ...product,
        costPrice: access.isAdmin ? product.costPrice : null,
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    if (!ensureAdminProductAccess(access, res)) {
      return;
    }
    const { initialStock, warehouseId, costPrice, purchaseCostPrice, expensePercent, packaging, packagings, ...rest } = req.body;
    const userId = req.user?.id || 1;
    const requestedWarehouseId = warehouseId ? Number(warehouseId) : null;
    const wId = access.isAdmin ? requestedWarehouseId : access.warehouseId;

    if (!access.isAdmin && !wId) {
      return res.status(400).json({ error: 'Warehouse ID is required' });
    }
    const normalizedName = normalizeProductName(rest.rawName || rest.name);
    const canonicalName =
      Number.isFinite(Number(rest.categoryId))
        ? await findCanonicalProductName(Number(rest.categoryId), normalizedName.name)
        : null;
    const finalName = canonicalName || normalizedName.name;
    const parsedPackaging = packaging || parsePackagingFromRawName(rest.rawName || rest.name);
    const resolvedBaseUnitName = normalizeBaseUnitName(String(rest.baseUnitName || parsedPackaging?.baseUnitName || rest.unit || ''));
    const resolvedPurchaseCostPrice = roundMoney(Number(purchaseCostPrice ?? costPrice ?? 0));
    const resolvedExpensePercent = Number(expensePercent ?? 0);
    const resolvedEffectiveCostPrice = roundMoney(calculateEffectiveCostPrice(resolvedPurchaseCostPrice, resolvedExpensePercent));

    // Check for unique constraints
    const existingProducts = await prisma.product.findMany({
      where: {
        warehouseId: wId,
        active: true
      },
      select: {
        id: true,
        name: true,
      }
    });
    const existingProduct = findWarehouseDuplicateProduct(existingProducts as Array<{ id: number; name: string }>, finalName);

    if (existingProduct) {
      return res.status(400).json({
        error: `Товар с названием "${rest.name}" уже существует на этом складе`
      });
    }

    const resolvedPhotoUrl = rest.photoUrl || null;

    // Create product with 0 stock first
    const product = await prisma.product.create({
      data: {
        ...rest,
        name: finalName,
        rawName: normalizedName.rawName,
        brand: normalizedName.brand,
        nameKey: buildProductNameKey(finalName),
        sku: null,
        baseUnitName: resolvedBaseUnitName,
        unit: resolvedBaseUnitName,
        purchaseCostPrice: resolvedPurchaseCostPrice,
        expensePercent: resolvedExpensePercent,
        photoUrl: resolvedPhotoUrl,
        initialStock: Number(initialStock || 0),
        totalIncoming: 0,
        stock: 0,
        warehouseId: wId,
        costPrice: resolvedEffectiveCostPrice,
        sellingPrice: roundMoney(rest.sellingPrice || 0),
      },
    });

    const packagingRows = [...(Array.isArray(packagings) ? packagings : []), parsedPackaging]
      .filter(Boolean)
      .map((entry: any, index: number) => ({
        productId: product.id,
        warehouseId: wId,
        packageName: normalizePackageName(entry.packageName),
        baseUnitName: normalizeBaseUnitName(entry.baseUnitName || resolvedBaseUnitName),
        unitsPerPackage: Number(entry.unitsPerPackage || 0),
        packageSellingPrice: entry.packageSellingPrice !== undefined && entry.packageSellingPrice !== null ? roundMoney(entry.packageSellingPrice) : null,
        barcode: entry.barcode ? String(entry.barcode) : null,
        isDefault: Boolean(entry.isDefault ?? index === 0),
        sortOrder: Number(entry.sortOrder || index),
      }))
      .filter((entry: any) => entry.packageName && entry.unitsPerPackage > 0);

    if (packagingRows.length > 0) {
      await prisma.productPackaging.createMany({
        data: packagingRows,
      });
    }

    // Record initial price history
    await prisma.priceHistory.create({
      data: {
        productId: product.id,
        costPrice: resolvedEffectiveCostPrice,
        sellingPrice: roundMoney(rest.sellingPrice || 0),
      }
    });

    // Then add initial stock via StockService to create batches and transactions
    if (Number(initialStock) > 0 && wId) {
      await StockSvc.addStock(
        product.id,
        Number(wId),
        Number(initialStock),
        resolvedEffectiveCostPrice,
        userId,
        'Initial Stock',
        resolvedPurchaseCostPrice,
        resolvedExpensePercent,
      );
    }

    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    if (!ensureAdminProductAccess(access, res)) {
      return;
    }
    const { packaging, packagings, ...productPayload } = req.body;
    const productId = Number(req.params.id);
    const userId = req.user?.id || 1;
    const oldProduct = await prisma.product.findUnique({ where: { id: productId } });
    
    if (!oldProduct) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    if (!access.isAdmin && !ensureWarehouseAccess(access, oldProduct.warehouseId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Check for unique constraints if name or warehouseId changed
    const normalizedRequestedName = normalizeProductName(productPayload.rawName || productPayload.name || oldProduct.rawName || oldProduct.name);
    const nextCategoryId = productPayload.categoryId !== undefined ? Number(productPayload.categoryId) : oldProduct.categoryId;
    const canonicalName = await findCanonicalProductName(nextCategoryId, normalizedRequestedName.name, productId);
    const newName = canonicalName || normalizedRequestedName.name;
    const newWarehouseId = access.isAdmin
      ? (productPayload.warehouseId !== undefined ? Number(productPayload.warehouseId) : oldProduct.warehouseId)
      : access.warehouseId;
    const nextBaseUnitName = normalizeBaseUnitName(productPayload.baseUnitName || oldProduct.baseUnitName || oldProduct.unit);
    const nextPurchaseCostPrice = productPayload.purchaseCostPrice !== undefined
      ? roundMoney(productPayload.purchaseCostPrice)
      : (productPayload.costPrice !== undefined ? roundMoney(productPayload.costPrice) : roundMoney(oldProduct.purchaseCostPrice ?? oldProduct.costPrice));
    const nextExpensePercent = productPayload.expensePercent !== undefined
      ? Number(productPayload.expensePercent)
      : Number(oldProduct.expensePercent || 0);
    const nextEffectiveCostPrice = roundMoney(calculateEffectiveCostPrice(nextPurchaseCostPrice, nextExpensePercent));

    if (newName !== oldProduct.name || newWarehouseId !== oldProduct.warehouseId) {
      const existingProducts = await prisma.product.findMany({
        where: {
          warehouseId: newWarehouseId,
          active: true
        },
        select: {
          id: true,
          name: true,
        }
      });
      const existingProduct = findWarehouseDuplicateProduct(
        existingProducts as Array<{ id: number; name: string }>,
        newName,
        productId,
      );

      if (existingProduct) {
        return res.status(400).json({
          error: `Товар с названием "${newName}" уже существует на этом складе`
        });
      }
    }
    
    const product = await prisma.product.update({
      where: { id: productId },
      data: {
        ...productPayload,
        name: newName,
        rawName: normalizedRequestedName.rawName,
        brand: normalizedRequestedName.brand,
        nameKey: buildProductNameKey(newName),
        baseUnitName: nextBaseUnitName,
        unit: nextBaseUnitName,
        purchaseCostPrice: nextPurchaseCostPrice,
        expensePercent: nextExpensePercent,
        costPrice: nextEffectiveCostPrice,
        sellingPrice: productPayload.sellingPrice !== undefined ? roundMoney(productPayload.sellingPrice) : oldProduct.sellingPrice,
        sku: null
      }
    });

    if (productPayload.photoUrl !== undefined) {
      const familyName = normalizeProductFamilyName(newName);
      const relatedProducts = await prisma.product.findMany({
        where: {
          active: true,
          id: { not: productId },
        },
        select: {
          id: true,
          name: true,
        }
      });

      const relatedIds = relatedProducts
        .filter((relatedProduct: { id: number; name: string }) => normalizeProductFamilyName(relatedProduct.name) === familyName)
        .map((relatedProduct: { id: number; name: string }) => relatedProduct.id);

      await prisma.product.updateMany({
        where: {
          id: { in: relatedIds },
        },
        data: {
          photoUrl: productPayload.photoUrl || null
        }
      });
    }

    // If price changed, record history
    if (oldProduct && (productPayload.costPrice !== undefined || productPayload.purchaseCostPrice !== undefined || productPayload.expensePercent !== undefined || productPayload.sellingPrice !== undefined)) {
      const newCost = nextEffectiveCostPrice;
      const newSelling = productPayload.sellingPrice !== undefined ? roundMoney(productPayload.sellingPrice) : roundMoney(oldProduct.sellingPrice);
      
      if (newCost !== Number(oldProduct.costPrice) || newSelling !== Number(oldProduct.sellingPrice)) {
        const historyWarehouseId = oldProduct.warehouseId ?? newWarehouseId ?? null;

        await prisma.priceHistory.create({
          data: {
            productId,
            costPrice: newCost,
            sellingPrice: newSelling
          }
        });

        if (historyWarehouseId) {
          await prisma.inventoryTransaction.create({
            data: {
              productId,
              warehouseId: historyWarehouseId,
              userId,
              qtyChange: 0,
              type: 'adjustment',
              reason: `Изменение цены: ${oldProduct.sellingPrice} -> ${newSelling}`,
              costAtTime: newCost,
              sellingAtTime: newSelling,
            }
          });
        }
      }
    }

    const parsedPackaging = packaging || parsePackagingFromRawName(productPayload.rawName || productPayload.name || oldProduct.rawName || oldProduct.name);
    const nextPackagings = [...(Array.isArray(packagings) ? packagings : []), parsedPackaging]
      .filter(Boolean)
      .map((entry: any, index: number) => ({
        productId,
        warehouseId: newWarehouseId,
        packageName: normalizePackageName(entry.packageName),
        baseUnitName: normalizeBaseUnitName(entry.baseUnitName || nextBaseUnitName),
        unitsPerPackage: Number(entry.unitsPerPackage || 0),
        packageSellingPrice: entry.packageSellingPrice !== undefined && entry.packageSellingPrice !== null ? roundMoney(entry.packageSellingPrice) : null,
        barcode: entry.barcode ? String(entry.barcode) : null,
        isDefault: Boolean(entry.isDefault ?? index === 0),
        sortOrder: Number(entry.sortOrder || index),
      }))
      .filter((entry: any) => entry.packageName && entry.unitsPerPackage > 0);

    if (nextPackagings.length > 0) {
      await prisma.productPackaging.createMany({
        data: nextPackagings,
      });
    }

    res.json(product);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/merge', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    if (!ensureAdminProductAccess(access, res)) {
      return;
    }

    const sourceProductId = Number(req.params.id);
    const targetProductId = Number(req.body?.targetProductId);

    if (!Number.isFinite(sourceProductId) || !Number.isFinite(targetProductId) || sourceProductId <= 0 || targetProductId <= 0) {
      return res.status(400).json({ error: 'Некорректные товары для объединения' });
    }

    if (sourceProductId === targetProductId) {
      return res.status(400).json({ error: 'Нельзя объединить товар с самим собой' });
    }

    const [sourceProduct, targetProduct] = await Promise.all([
      prisma.product.findUnique({ where: { id: sourceProductId } }),
      prisma.product.findUnique({ where: { id: targetProductId } }),
    ]);

    if (!sourceProduct || !targetProduct) {
      return res.status(404).json({ error: 'Один из товаров не найден' });
    }

    if (sourceProduct.warehouseId !== targetProduct.warehouseId) {
      return res.status(400).json({ error: 'Объединять можно только товары из одного склада' });
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.productBatch.updateMany({
        where: { productId: sourceProductId },
        data: { productId: targetProductId },
      });

      await tx.invoiceItem.updateMany({
        where: { productId: sourceProductId },
        data: { productId: targetProductId },
      });

      await tx.inventoryTransaction.updateMany({
        where: { productId: sourceProductId },
        data: { productId: targetProductId },
      });

      await tx.priceHistory.updateMany({
        where: { productId: sourceProductId },
        data: { productId: targetProductId },
      });

      await tx.productPackaging.updateMany({
        where: { productId: sourceProductId },
        data: { productId: targetProductId },
      });

      const targetBatches = await tx.productBatch.findMany({
        where: { productId: targetProductId },
        select: { quantity: true, remainingQuantity: true },
      });

      const nextStock = targetBatches.reduce((sum: number, batch: any) => sum + Number(batch.remainingQuantity || 0), 0);
      const nextIncoming = targetBatches.reduce((sum: number, batch: any) => sum + Number(batch.quantity || 0), 0);

      await tx.product.update({
        where: { id: targetProductId },
        data: {
          stock: nextStock,
          totalIncoming: nextIncoming,
          initialStock: Math.max(Number(targetProduct.initialStock || 0), nextIncoming),
          photoUrl: targetProduct.photoUrl || sourceProduct.photoUrl || null,
        },
      });

      await tx.product.update({
        where: { id: sourceProductId },
        data: {
          active: false,
          stock: 0,
          totalIncoming: 0,
          initialStock: 0,
          name: `${sourceProduct.name} [merged ${sourceProductId}]`,
          photoUrl: null,
          sku: null,
        },
      });
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const access = await getAccessContext(req as AuthRequest);
    if (!ensureAdminProductAccess(access, res)) {
      return;
    }
    const productId = Number(req.params.id);
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        batches: {
          where: { remainingQuantity: { gt: 0 } },
          select: { remainingQuantity: true },
        },
      },
    });

    if (!product) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    if (!access.isAdmin && !ensureWarehouseAccess(access, product.warehouseId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const forceDelete = String(req.query.force || '').toLowerCase() === 'true';

    if (forceDelete) {
      const [invoiceItemCount, purchaseItemCount] = await Promise.all([
        prisma.invoiceItem.count({ where: { productId } }),
        prisma.purchaseDocumentItem.count({ where: { matchedProductId: productId } }),
      ]);

      if (invoiceItemCount > 0) {
        return res.status(400).json({
          error: 'Нельзя удалить навсегда: товар уже участвовал в продажах. Используйте скрытие товара вместо полного удаления.',
        });
      }

      await prisma.$transaction(async (tx: any) => {
        if (purchaseItemCount > 0) {
          await tx.purchaseDocumentItem.updateMany({
            where: { matchedProductId: productId },
            data: { matchedProductId: null },
          });
        }

        await tx.inventoryTransaction.deleteMany({
          where: { productId },
        });

        await tx.productBatch.deleteMany({
          where: { productId },
        });

        await tx.productPackaging.deleteMany({
          where: { productId },
        });

        await tx.priceHistory.deleteMany({
          where: { productId },
        });

        await tx.product.delete({
          where: { id: productId },
        });
      });

      return res.json({ success: true, hardDeleted: true });
    }

    await prisma.product.update({
      where: { id: productId },
      data: {
        active: false,
        stock: 0,
      }
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/restock', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    if (!ensureAdminProductAccess(access, res)) {
      return;
    }
    const productId = Number(req.params.id);
    const userId = req.user!.id;
    const warehouseId = access.isAdmin ? Number(req.body.warehouseId) : access.warehouseId;
    const { quantity, costPrice, purchaseCostPrice, sellingPrice, expensePercent, reason } = req.body;

    if (!warehouseId || !ensureWarehouseAccess(access, warehouseId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const resolvedPurchaseCostPrice = roundMoney(purchaseCostPrice ?? costPrice ?? 0);
    const resolvedExpensePercent = Number(expensePercent ?? 0);
    const resolvedEffectiveCostPrice = roundMoney(calculateEffectiveCostPrice(resolvedPurchaseCostPrice, resolvedExpensePercent));

    const existingProduct = await prisma.product.findUnique({
      where: { id: productId },
      select: { costPrice: true, sellingPrice: true, warehouseId: true },
    });

    if (!existingProduct) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    const resolvedSellingPrice =
      sellingPrice !== undefined && sellingPrice !== null && sellingPrice !== ''
        ? roundMoney(sellingPrice)
        : roundMoney(existingProduct.sellingPrice);

    await prisma.product.update({
      where: { id: productId },
      data: {
        purchaseCostPrice: resolvedPurchaseCostPrice,
        expensePercent: resolvedExpensePercent,
        costPrice: resolvedEffectiveCostPrice,
        sellingPrice: resolvedSellingPrice,
      },
    });

    if (
      resolvedEffectiveCostPrice !== Number(existingProduct.costPrice) ||
      resolvedSellingPrice !== Number(existingProduct.sellingPrice)
    ) {
      await prisma.priceHistory.create({
        data: {
          productId,
          costPrice: resolvedEffectiveCostPrice,
          sellingPrice: resolvedSellingPrice,
        },
      });
    }

    const batch = await StockSvc.addStock(
      productId,
      warehouseId,
      quantity,
      resolvedEffectiveCostPrice,
      userId,
      reason,
      resolvedPurchaseCostPrice,
      resolvedExpensePercent,
    );
    res.json(batch);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/transfer', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    if (!ensureAdminProductAccess(access, res)) {
      return;
    }
    const productId = Number(req.params.id);
    const userId = req.user!.id;
    const { quantity } = req.body;
    const fromWarehouseId = access.isAdmin ? Number(req.body.fromWarehouseId) : access.warehouseId;
    const toWarehouseId = Number(req.body.toWarehouseId);

    if (!fromWarehouseId || !ensureWarehouseAccess(access, fromWarehouseId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await StockSvc.transferStock(
      productId,
      fromWarehouseId,
      toWarehouseId,
      quantity,
      userId
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/history/:transactionId/reverse-incoming', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    if (!ensureAdminProductAccess(access, res)) {
      return;
    }

    const transactionId = Number(req.params.transactionId);
    if (!Number.isFinite(transactionId) || transactionId <= 0) {
      return res.status(400).json({ error: 'Некорректный приход для отмены' });
    }

    const transaction = await prisma.inventoryTransaction.findUnique({
      where: { id: transactionId },
      select: { warehouseId: true, type: true },
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Приход не найден' });
    }

    if (!access.isAdmin && !ensureWarehouseAccess(access, transaction.warehouseId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await StockSvc.reverseIncomingTransaction(transactionId, req.user!.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/history/:transactionId/reverse-writeoff', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    if (!ensureAdminProductAccess(access, res)) {
      return;
    }

    const transactionId = Number(req.params.transactionId);
    if (!Number.isFinite(transactionId) || transactionId <= 0) {
      return res.status(400).json({ error: 'Некорректное списание для отмены' });
    }

    const transaction = await prisma.inventoryTransaction.findUnique({
      where: { id: transactionId },
      select: { warehouseId: true },
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Списание не найдено' });
    }

    if (!access.isAdmin && !ensureWarehouseAccess(access, transaction.warehouseId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await StockSvc.reverseCorrectionWriteOff(transactionId, req.user!.id);
    res.json(result);
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

router.post('/history/:transactionId/return-writeoff', authorize(['ADMIN', 'MANAGER']), async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);

    const transactionId = Number(req.params.transactionId);
    if (!Number.isFinite(transactionId) || transactionId <= 0) {
      return res.status(400).json({ error: 'Некорректное списание для возврата' });
    }

    const transaction = await prisma.inventoryTransaction.findUnique({
      where: { id: transactionId },
      select: { warehouseId: true },
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Списание не найдено' });
    }

    if (!access.isAdmin && !ensureWarehouseAccess(access, transaction.warehouseId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const quantity = Number(req.body.quantity || 0);
    const reason = String(req.body.reason || '').trim();
    const result = await StockSvc.returnWriteOffTransaction(transactionId, quantity, req.user!.id, reason);
    res.json(result);
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

router.delete('/history/:transactionId/writeoff', authorize(['ADMIN', 'MANAGER']), async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);

    const transactionId = Number(req.params.transactionId);
    if (!Number.isFinite(transactionId) || transactionId <= 0) {
      return res.status(400).json({ error: 'Некорректное списание для удаления' });
    }

    const transaction = await prisma.inventoryTransaction.findUnique({
      where: { id: transactionId },
      select: { warehouseId: true },
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Списание не найдено' });
    }

    if (!access.isAdmin && !ensureWarehouseAccess(access, transaction.warehouseId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await StockSvc.deleteWriteOffTransactionPermanently(transactionId);
    res.json(result);
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

router.post('/:id/write-off', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    if (!ensureAdminProductAccess(access, res)) {
      return;
    }

    const productId = Number(req.params.id);
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Некорректный товар' });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, warehouseId: true, stock: true },
    });

    if (!product) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    if (!ensureWarehouseAccess(access, product.warehouseId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const quantity = Number(req.body.quantity || 0);
    const reason = String(req.body.reason || '').trim();

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'Количество для списания должно быть больше нуля' });
    }

    if (!reason) {
      return res.status(400).json({ error: 'Укажите причину списания' });
    }

    if (Number(product.stock || 0) < quantity) {
      return res.status(400).json({ error: 'Недостаточно остатка для списания' });
    }

    if (!product.warehouseId) {
      return res.status(400).json({ error: 'У товара не найден склад для списания' });
    }

    const result = await StockSvc.writeOffStock(
      productId,
      product.warehouseId,
      quantity,
      req.user!.id,
      reason
    );

    res.json(result);
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

router.post('/inventory/transaction', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    if (!ensureAdminProductAccess(access, res)) {
      return;
    }
    const userId = req.user!.id;
    const { product_id, quantity_change, type, reason, cost_at_time } = req.body;
    const warehouse_id = access.isAdmin ? Number(req.body.warehouse_id) : access.warehouseId;

    if (!warehouse_id || !ensureWarehouseAccess(access, warehouse_id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const batch = await StockSvc.addStock(
      Number(product_id),
      Number(warehouse_id),
      Number(quantity_change),
      Number(cost_at_time),
      userId,
      reason
    );
    res.json(batch);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/price-history', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const { page, limit, skip } = parsePaginationQuery(req.query, { defaultLimit: 200, maxLimit: 1000 });
    const product = await prisma.product.findUnique({
      where: { id: Number(req.params.id) },
      select: { warehouseId: true },
    });
    if (!product) {
      return res.status(404).json({ error: 'Товар не найден' });
    }
    if (!access.isAdmin && !ensureWarehouseAccess(access, product.warehouseId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const where = { productId: Number(req.params.id) };
    const [history, total] = await Promise.all([
      prisma.priceHistory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.priceHistory.count({ where }),
    ]);
    setPaginationHeaders(res, { page, limit, total });
    res.json(history);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/history', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const productId = Number(req.params.id);
    const { page, limit, skip } = parsePaginationQuery(req.query, { defaultLimit: 500, maxLimit: 1000 });
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { warehouseId: true },
    });
    if (!product) {
      return res.status(404).json({ error: 'Товар не найден' });
    }
    if (!access.isAdmin && !ensureWarehouseAccess(access, product.warehouseId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const decodeMojibake = (value: string) => {
      const source = String(value || '');
      if (!/[ÐÑ]/.test(source)) {
        return source;
      }

      try {
        return Buffer.from(source, 'latin1').toString('utf8');
      } catch {
        return source;
      }
    };

    const productWarehouseId = product.warehouseId ?? undefined;
    const transactionWhere = {
      productId,
      ...(productWarehouseId ? { warehouseId: productWarehouseId } : {}),
    };

    const [transactions, priceHistory, totalTransactions, totalPriceEvents] = await Promise.all([
      prisma.inventoryTransaction.findMany({
        where: transactionWhere,
        include: { user: true, warehouse: true },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.priceHistory.findMany({
        where: { productId },
        take: Math.min(limit, 300),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.inventoryTransaction.count({ where: transactionWhere }),
      prisma.priceHistory.count({ where: { productId } }),
    ]);
    setPaginationHeaders(res, {
      page,
      limit,
      total: totalTransactions + (access.isAdmin ? totalPriceEvents : 0),
    });

    const warehouseIdsFromReasons = Array.from(
      new Set(
        transactions
          .flatMap((transaction: any) => {
            const matches = String(transaction.reason || '').match(/Warehouse\s+#(\d+)/gi) || [];
            return matches
              .map((match) => Number((match.match(/(\d+)/) || [])[0]))
              .filter((id) => Number.isFinite(id));
          })
      )
    );

    const warehousesById = warehouseIdsFromReasons.length
      ? new Map(
          (
            await prisma.warehouse.findMany({
              where: { id: { in: warehouseIdsFromReasons } },
              select: { id: true, name: true },
            })
          ).map((warehouse: { id: number; name: string }) => [warehouse.id, warehouse.name] as [number, string])
        )
      : new Map<number, string>();

    const formatHistoryReason = (reason: string | null | undefined) => {
      const normalized = decodeMojibake(String(reason || ''))
        .replace(/Warehouse\s+#(\d+)/gi, (_match: string, idText: string): string => {
          const warehouseName = warehousesById.get(Number(idText));
          return String(warehouseName || `Склад #${idText}`);
        });

      if (!normalized) {
        return '';
      }

      if (/^Initial Stock$/i.test(normalized)) {
        return 'Начальный остаток';
      }
      if (/^Stock Arrival$/i.test(normalized)) {
        return 'Приход товара';
      }
      if (/^Transfer to (.+)$/i.test(normalized)) {
        return normalized.replace(/^Transfer to (.+)$/i, 'Перенос на $1');
      }
      if (/^Transfer from (.+)$/i.test(normalized)) {
        return normalized.replace(/^Transfer from (.+)$/i, 'Перенос со $1');
      }
      if (/^Invoice #(\d+) Cancelled$/i.test(normalized)) {
        return normalized.replace(/^Invoice #(\d+) Cancelled$/i, 'Отмена накладной #$1');
      }

      return normalized
        .replace(/^Price change:/i, 'Изменение цены:')
        .replace(/^Selling price:/i, 'Цена продажи:')
        .replace(/^Cost price:/i, 'Себестоимость:');
    };

    const transactionHistory = transactions.map((t: any) => {
      const returnedQty = transactions
        .filter(
          (candidate: any) =>
            Number(candidate.referenceId || 0) === Number(t.id) &&
            candidate.type === 'adjustment' &&
            Number(candidate.qtyChange || 0) > 0
        )
        .reduce((sum: number, candidate: any) => sum + Number(candidate.qtyChange || 0), 0);

      const originalQty = Math.abs(Number(t.qtyChange || 0));
      const isWriteOff = t.type === 'adjustment' && Number(t.qtyChange || 0) < 0 && String(t.reason || '').includes('Списание');
      const isWriteOffReturn = t.type === 'adjustment' && Number(t.qtyChange || 0) > 0 && String(t.reason || '').includes('Возврат списания');

      let writeOffStatus: string | null = null;
      if (isWriteOff) {
        if (returnedQty <= 0) {
          writeOffStatus = 'writeoff';
        } else if (returnedQty < originalQty) {
          writeOffStatus = 'partial_return';
        } else {
          writeOffStatus = 'full_return';
        }
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
        reason: formatHistoryReason(t.reason),
        returnedQty,
        writeOffStatus,
        canReverseIncoming:
          access.isAdmin &&
          t.type === 'incoming' &&
          Number(t.qtyChange || 0) > 0,
        canReverseCorrectionWriteOff:
          access.isAdmin &&
          t.type === 'adjustment' &&
          Number(t.qtyChange || 0) < 0 &&
          String(t.reason || '').includes('Списание') &&
          isCorrectionWriteOffReason(t.reason) &&
          returnedQty <= 0,
        canReturnWriteOff:
          access.isAdmin &&
          isWriteOff &&
          originalQty > returnedQty,
        canDeleteWriteOffPermanently:
          access.isAdmin &&
          isWriteOff &&
          returnedQty <= 0,
      };
    });

    const priceEvents = priceHistory.map((p: any) => ({
      id: `price-${p.id}`,
      createdAt: p.createdAt,
      type: 'price_change',
      qtyChange: 0,
      warehouse: null,
      warehouseName: '---',
      username: 'system',
      reason: `Цена продажи: ${formatMoneyValue(p.sellingPrice)}, себестоимость: ${formatMoneyValue(p.costPrice)}`,
    }));

    const history = [...transactionHistory, ...priceEvents].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json(access.isAdmin ? history : history.filter((item) => item.type !== 'price_change'));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/batches', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const { page, limit, skip } = parsePaginationQuery(req.query, { defaultLimit: 300, maxLimit: 1000 });
    const product = await prisma.product.findUnique({
      where: { id: Number(req.params.id) },
      select: { warehouseId: true },
    });
    if (!product) {
      return res.status(404).json({ error: 'Товар не найден' });
    }
    if (!access.isAdmin && !ensureWarehouseAccess(access, product.warehouseId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const where = { 
      productId: Number(req.params.id),
      ...(product.warehouseId ? { warehouseId: product.warehouseId } : {}),
      remainingQuantity: { gt: 0 }
    };
    const [batches, total] = await Promise.all([
      prisma.productBatch.findMany({
        where,
        include: { warehouse: true, saleAllocations: { select: { id: true } } },
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' }
      }),
      prisma.productBatch.count({ where }),
    ]);
    setPaginationHeaders(res, { page, limit, total });
    res.json(
      batches.map((batch: any) => ({
        ...batch,
        canDelete:
          access.isAdmin &&
          Number(batch.remainingQuantity || 0) === Number(batch.quantity || 0) &&
          (batch.saleAllocations?.length || 0) === 0,
        canZeroRemaining:
          access.isAdmin &&
          Number(batch.remainingQuantity || 0) > 0,
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.post('/batches/:batchId/zero', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    if (!ensureAdminProductAccess(access, res)) {
      return;
    }

    const batchId = Number(req.params.batchId);
    if (!Number.isFinite(batchId) || batchId <= 0) {
      return res.status(400).json({ error: 'Некорректная партия' });
    }

    const batch = await prisma.productBatch.findUnique({
      where: { id: batchId },
      select: { warehouseId: true },
    });

    if (!batch) {
      return res.status(404).json({ error: 'Партия не найдена' });
    }

    if (!access.isAdmin && !ensureWarehouseAccess(access, batch.warehouseId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await StockSvc.zeroBatchRemaining(batchId, req.user!.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete('/batches/:batchId', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    if (!ensureAdminProductAccess(access, res)) {
      return;
    }

    const batchId = Number(req.params.batchId);
    if (!Number.isFinite(batchId) || batchId <= 0) {
      return res.status(400).json({ error: 'Некорректная партия' });
    }

    const batch = await prisma.productBatch.findUnique({
      where: { id: batchId },
      select: { warehouseId: true },
    });

    if (!batch) {
      return res.status(404).json({ error: 'Партия не найдена' });
    }

    if (!access.isAdmin && !ensureWarehouseAccess(access, batch.warehouseId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await StockSvc.deleteBatch(batchId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/packagings', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const product = await prisma.product.findUnique({
      where: { id: Number(req.params.id) },
      select: { id: true, warehouseId: true, baseUnitName: true },
    });
    if (!product) {
      return res.status(404).json({ error: 'Товар не найден' });
    }
    if (!access.isAdmin && !ensureWarehouseAccess(access, product.warehouseId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const packagings = await prisma.productPackaging.findMany({
      where: { productId: product.id, active: true },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { unitsPerPackage: 'asc' }],
    });

    res.json(packagings);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/packagings', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    if (!ensureAdminProductAccess(access, res)) {
      return;
    }

    const product = await prisma.product.findUnique({
      where: { id: Number(req.params.id) },
      select: { id: true, warehouseId: true, baseUnitName: true },
    });
    if (!product) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    const packaging = await prisma.productPackaging.create({
      data: {
        productId: product.id,
        warehouseId: product.warehouseId,
        packageName: normalizePackageName(req.body.packageName),
        baseUnitName: normalizeBaseUnitName(req.body.baseUnitName || product.baseUnitName),
        unitsPerPackage: Number(req.body.unitsPerPackage || 0),
        packageSellingPrice: req.body.packageSellingPrice !== undefined && req.body.packageSellingPrice !== null ? roundMoney(req.body.packageSellingPrice) : null,
        barcode: req.body.barcode ? String(req.body.barcode) : null,
        isDefault: Boolean(req.body.isDefault),
        sortOrder: Number(req.body.sortOrder || 0),
      },
    });

    if (packaging.isDefault) {
      await prisma.productPackaging.updateMany({
        where: { productId: product.id, id: { not: packaging.id } },
        data: { isDefault: false },
      });
    }

    res.status(201).json(packaging);
  } catch (error) {
    next(error);
  }
});

export default router;
