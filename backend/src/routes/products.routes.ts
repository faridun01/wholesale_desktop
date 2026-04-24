import { Router } from 'express';
import prisma from '../db/prisma.js';
import { ProductService } from '../services/product.service.js';
import { StockService } from '../services/stock.service.js';
import { AuthRequest } from '../middlewares/auth.middleware.js';
import { ensureWarehouseAccess, getAccessContext, getScopedWarehouseId, ensureAdminAccess } from '../utils/access.js';
import { parsePaginationQuery, setPaginationHeaders } from '../utils/pagination.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors.js';

const router = Router();

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const warehouseId = getScopedWarehouseId(access, req.query.warehouseId);
    const pagination = parsePaginationQuery(req.query, { defaultLimit: 500, maxLimit: 1000 });
    
    // Logic for listing products (can be moved to service later if gets more complex)
    const where: any = { active: true, warehouseId: warehouseId || undefined };
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { 
          category: true, 
          warehouse: true,
          packagings: { where: { active: true } },
          batches: {
            where: { remainingQuantity: { gt: 0 } },
            orderBy: { createdAt: 'asc' },
            take: 1
          }
        },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.product.count({ where }),
    ]);

    setPaginationHeaders(res, { ...pagination, total });
    res.json(products.map(p => {
      const nextBatch = p.batches?.[0];
      return {
        ...p,
        costPrice: access.isAdmin ? p.costPrice : null,
        nextBatchPrice: nextBatch ? nextBatch.sellingPrice : p.sellingPrice,
        batches: undefined // Don't leak full batch data if not needed
      };
    }));
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    ensureAdminAccess(access);

    const warehouseId = req.body.warehouseId ? Number(req.body.warehouseId) : access.warehouseId;
    if (!warehouseId) throw new ValidationError('Warehouse ID is required');

    const product = await ProductService.createProduct(req.user!.id, warehouseId, req.body);
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
});

router.post('/bulk', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    ensureAdminAccess(access);

    const warehouseId = req.body.warehouseId ? Number(req.body.warehouseId) : access.warehouseId;
    if (!warehouseId) throw new ValidationError('Warehouse ID is required');

    const products = await ProductService.bulkCreateProducts(req.user!.id, warehouseId, req.body.products);
    res.status(201).json(products);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const productId = Number(req.params.id);
    const product = await ProductService.updateProduct(productId, req.user!.id, req.body, access);
    res.json(product);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/merge', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    ensureAdminAccess(access);

    const sourceId = Number(req.params.id);
    const targetId = Number(req.body.targetProductId);
    
    const result = await ProductService.mergeProducts(sourceId, targetId, access);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const productId = Number(req.params.id);
    const force = req.query.force === 'true';

    const result = await ProductService.deleteProduct(productId, access, force);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/restock', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    ensureAdminAccess(access);
    const productId = Number(req.params.id);
    
    const batch = await ProductService.restockProduct(productId, req.user!.id, req.body, access);
    res.json(batch);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/transfer', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    ensureAdminAccess(access);
    const productId = Number(req.params.id);
    const { quantity, fromWarehouseId, toWarehouseId } = req.body;

    const sourceWh = access.isAdmin ? Number(fromWarehouseId) : access.warehouseId;
    if (!sourceWh || !ensureWarehouseAccess(access, sourceWh)) throw new ForbiddenError('No access to source warehouse');

    const result = await StockService.transferStock(productId, sourceWh, Number(toWarehouseId), quantity, req.user!.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/write-off', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    ensureAdminAccess(access);
    const productId = Number(req.params.id);

    const product = await prisma.product.findUnique({ where: { id: productId }, select: { warehouseId: true } });
    if (!product) throw new NotFoundError('Товар не найден');
    if (!ensureWarehouseAccess(access, product.warehouseId)) throw new ForbiddenError('No access');

    if (!product.warehouseId) throw new ValidationError('У товара не указан склад');
    const result = await StockService.writeOffStock(productId, product.warehouseId, req.body.quantity, req.user!.id, req.body.reason);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/history', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const productId = Number(req.params.id);
    const pagination = parsePaginationQuery(req.query, { defaultLimit: 500 });

    const result = await ProductService.getProductHistory(productId, access, pagination);
    setPaginationHeaders(res, { ...pagination, total: result.total });
    res.json(result.history);
  } catch (error) {
    next(error);
  }
});

router.post('/history/:transactionId/reverse-incoming', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    ensureAdminAccess(access);
    const result = await StockService.reverseIncomingTransaction(Number(req.params.transactionId), req.user!.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/history/:transactionId/reverse-writeoff', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    ensureAdminAccess(access);
    const result = await StockService.reverseCorrectionWriteOff(Number(req.params.transactionId), req.user!.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/history/:transactionId/return-writeoff', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    ensureAdminAccess(access);
    const result = await StockService.returnWriteOffTransaction(
      Number(req.params.transactionId),
      Number(req.body.quantity),
      req.user!.id,
      String(req.body.reason || '').trim(),
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete('/history/:transactionId/writeoff', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    ensureAdminAccess(access);
    const result = await StockService.deleteWriteOffTransactionPermanently(Number(req.params.transactionId));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/batches', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const productId = Number(req.params.id);
    const pagination = parsePaginationQuery(req.query, { defaultLimit: 300 });

    const [batches, total] = await Promise.all([
      prisma.productBatch.findMany({
        where: { productId, remainingQuantity: { gt: 0 } },
        include: { warehouse: true, saleAllocations: { select: { id: true } } },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'asc' }
      }),
      prisma.productBatch.count({ where: { productId, remainingQuantity: { gt: 0 } } }),
    ]);

    setPaginationHeaders(res, { ...pagination, total });
    res.json(batches.map((b: any) => ({
      ...b,
      canDelete: access.isAdmin && Number(b.remainingQuantity) === Number(b.quantity) && !b.saleAllocations.length,
      canZeroRemaining: access.isAdmin && Number(b.remainingQuantity) > 0,
    })));
  } catch (error) {
    next(error);
  }
});

router.post('/batches/:batchId/zero', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    ensureAdminAccess(access);
    const result = await StockService.zeroBatchRemaining(Number(req.params.batchId), req.user!.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete('/batches/:batchId', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    ensureAdminAccess(access);
    const result = await StockService.deleteBatch(Number(req.params.batchId));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.put('/batches/:batchId', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    ensureAdminAccess(access);
    const batchId = Number(req.params.batchId);
    const { sellingPrice } = req.body;
    
    const batch = await prisma.productBatch.update({
      where: { id: batchId },
      data: { sellingPrice: Number(sellingPrice) }
    });
    res.json(batch);
  } catch (error) {
    next(error);
  }
});

export default router;
