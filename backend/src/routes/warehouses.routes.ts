import { Router } from 'express';
import prisma from '../db/prisma.js';
import { authorize } from '../middlewares/auth.middleware.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { getAccessContext, ensureWarehouseAccess } from '../utils/access.js';

const router = Router();

const normalizeWarehousePayload = (payload: Record<string, unknown>) => ({
  ...payload,
  name: String(payload.name || '').trim(),
  city: payload.city ? String(payload.city).trim() : null,
  address: payload.address ? String(payload.address).trim() : null,
  phone: payload.phone ? String(payload.phone).trim() : null,
  note: payload.note ? String(payload.note).trim() : null,
});

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const warehouses = await prisma.warehouse.findMany({
      where: access.isAdmin
        ? { active: true }
        : {
            active: true,
            id: access.warehouseId ?? -1,
            city: access.city ?? undefined,
          },
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' },
      ],
    } as any);
    res.json(warehouses);
  } catch (error) {
    next(error);
  }
});

router.post('/', authorize(['ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const payload = normalizeWarehousePayload(req.body || {});
    const activeCount = await prisma.warehouse.count({ where: { active: true } });
    const shouldBecomeDefault = activeCount === 0 || (access.isAdmin && Boolean(req.body?.isDefault));

    const warehouse = shouldBecomeDefault
      ? await prisma.$transaction(async (tx) => {
          await tx.warehouse.updateMany({
            where: { active: true, isDefault: true },
            data: { isDefault: false },
          } as any);

          return tx.warehouse.create({
            data: {
              ...payload,
              isDefault: true,
            },
          } as any);
        })
      : await prisma.warehouse.create({ data: payload } as any);

    res.status(201).json(warehouse);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authorize(['ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const warehouseId = Number(req.params.id);
    if (!access.isAdmin && !ensureWarehouseAccess(access, warehouseId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const payload = normalizeWarehousePayload(req.body || {});
    delete (payload as any).isDefault;

    const warehouse = await prisma.warehouse.update({
      where: { id: warehouseId },
      data: payload,
    });
    res.json(warehouse);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/set-default', authorize(['ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const warehouseId = Number(req.params.id);
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true, active: true },
    });

    if (!warehouse || !warehouse.active) {
      return res.status(404).json({ error: 'Warehouse not found' });
    }

    const updatedWarehouse = await prisma.$transaction(async (tx) => {
      await tx.warehouse.updateMany({
        where: { active: true, isDefault: true, id: { not: warehouseId } },
        data: { isDefault: false },
      } as any);

      return tx.warehouse.update({
        where: { id: warehouseId },
        data: { isDefault: true },
      } as any);
    });

    res.json(updatedWarehouse);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authorize(['ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    const warehouseId = Number(req.params.id);
    if (!access.isAdmin && !ensureWarehouseAccess(access, warehouseId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.findUnique({
        where: { id: warehouseId },
        select: { id: true, isDefault: true },
      });

      await tx.warehouse.update({
        where: { id: warehouseId },
        data: { active: false, isDefault: false },
      });

      if (warehouse?.isDefault) {
        const fallbackWarehouse = await tx.warehouse.findFirst({
          where: { active: true, id: { not: warehouseId } },
          orderBy: { createdAt: 'asc' },
        });

        if (fallbackWarehouse) {
          await tx.warehouse.update({
            where: { id: fallbackWarehouse.id },
            data: { isDefault: true },
          });
        }
      }
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
