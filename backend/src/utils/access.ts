import prisma from '../db/prisma.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { ForbiddenError } from './errors.js';

export type AccessContext = {
  isAdmin: boolean;
  userId: number | null;
  warehouseId: number | null;
  city: string | null;
};

export function isAdminRole(role: string | null | undefined) {
  return String(role || '').toUpperCase() === 'ADMIN';
}

export async function getAccessContext(req: AuthRequest): Promise<AccessContext> {
  const isAdmin = isAdminRole(req.user?.role);

  if (!req.user?.id) {
    return {
      isAdmin,
      userId: null,
      warehouseId: req.user?.warehouseId ?? null,
      city: null,
    };
  }

  if (isAdmin) {
    return {
      isAdmin: true,
      userId: req.user.id,
      warehouseId: req.user.warehouseId ?? null,
      city: null,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { warehouse: true },
  });

  return {
    isAdmin: false,
    userId: req.user.id,
    warehouseId: user?.warehouseId ?? req.user?.warehouseId ?? null,
    city: user?.warehouse?.city ?? null,
  };
}

export function getScopedWarehouseId(context: AccessContext, requestedWarehouseId: unknown) {
  if (!context.isAdmin) {
    return context.warehouseId ?? null;
  }

  if (requestedWarehouseId === undefined || requestedWarehouseId === null || requestedWarehouseId === '') {
    return null;
  }

  const parsed = Number(requestedWarehouseId);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ensureWarehouseAccess(context: AccessContext, warehouseId: number | null | undefined) {
  if (context.isAdmin) {
    return true;
  }

  return Boolean(context.warehouseId && warehouseId && Number(context.warehouseId) === Number(warehouseId));
}

export function ensureAdminAccess(context: AccessContext) {
  if (!context.isAdmin) {
    throw new ForbiddenError('Только администратор может выполнять это действие');
  }
}
