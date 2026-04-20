import { Router } from 'express';
import prisma from '../db/prisma.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { ensureWarehouseAccess, getAccessContext, getScopedWarehouseId } from '../utils/access.js';
import { normalizeMoney } from '../utils/money.js';

const router = Router();

const normalizeOptionalString = (value: unknown) => {
  const normalized = String(value || '').trim();
  return normalized ? normalized : null;
};

const normalizePositiveAmount = (value: unknown) => {
  const amount = normalizeMoney(value, 'Expense amount', { allowZero: false });
  if (!Number.isFinite(amount) || amount <= 0) {
    throw Object.assign(new Error('Сумма расхода должна быть больше нуля'), { status: 400 });
  }

  return amount;
};

const normalizePaidAmount = (value: unknown, totalAmount: number) => {
  const amount = normalizeMoney(value ?? 0, 'Expense paid amount');
  if (!Number.isFinite(amount) || amount < 0) {
    throw Object.assign(new Error('Сумма оплаты не может быть отрицательной'), { status: 400 });
  }

  if (amount > totalAmount) {
    throw Object.assign(new Error('Сумма оплаты не может быть больше суммы расхода'), { status: 400 });
  }

  return amount;
};

const normalizeExpenseDate = (value: unknown) => {
  if (value === undefined || value === null || value === '') {
    return new Date();
  }

  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw Object.assign(new Error('Дата расхода указана некорректно'), { status: 400 });
  }

  return parsed;
};

const ensureAdminOnly = (isAdmin: boolean) => {
  if (!isAdmin) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
};

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    ensureAdminOnly(access.isAdmin);
    const warehouseId = getScopedWarehouseId(access, req.query.warehouseId);
    const start = normalizeOptionalString(req.query.start);
    const end = normalizeOptionalString(req.query.end);

    const expenses = await prisma.expense.findMany({
      where: {
        warehouseId: warehouseId ?? undefined,
        expenseDate: start || end
          ? {
              gte: start ? new Date(`${start}T00:00:00.000Z`) : undefined,
              lte: end ? new Date(`${end}T23:59:59.999Z`) : undefined,
            }
          : undefined,
      },
      include: {
        warehouse: {
          select: { id: true, name: true },
        },
        user: {
          select: { id: true, username: true },
        },
      },
      orderBy: [{ expenseDate: 'desc' }, { id: 'desc' }],
    });

    res.json(expenses);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    ensureAdminOnly(access.isAdmin);
    const requestedWarehouseId = Number(req.body?.warehouseId);
    const warehouseId = requestedWarehouseId;

    if (!warehouseId || !Number.isFinite(Number(warehouseId))) {
      return res.status(400).json({ error: 'Склад обязателен' });
    }

    const title = String(req.body?.title || '').trim();
    if (!title) {
      return res.status(400).json({ error: 'Название расхода обязательно' });
    }

    const category = String(req.body?.category || 'Прочее').trim() || 'Прочее';
    const amount = normalizePositiveAmount(req.body?.amount);
    const paidAmount = normalizePaidAmount(req.body?.paidAmount, amount);
    const expenseDate = normalizeExpenseDate(req.body?.expenseDate);

    const created = await prisma.expense.create({
      data: {
        warehouseId: Number(warehouseId),
        userId: req.user!.id,
        category,
        title,
        amount,
        paidAmount,
        expenseDate,
        note: normalizeOptionalString(req.body?.note),
      },
      include: {
        warehouse: {
          select: { id: true, name: true },
        },
        user: {
          select: { id: true, username: true },
        },
      },
    });

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

const updateExpenseHandler = async (req: AuthRequest, res: any, next: any) => {
  try {
    const access = await getAccessContext(req);
    ensureAdminOnly(access.isAdmin);

    const expenseId = Number(req.params.id);
    const existingExpense = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: {
        id: true,
        warehouseId: true,
      },
    });

    if (!existingExpense) {
      return res.status(404).json({ error: 'Расход не найден' });
    }

    const requestedWarehouseId = Number(req.body?.warehouseId ?? existingExpense.warehouseId);
    const warehouseId = Number.isFinite(requestedWarehouseId) ? requestedWarehouseId : null;
    if (!warehouseId) {
      return res.status(400).json({ error: 'Склад обязателен' });
    }

    const title = String(req.body?.title || '').trim();
    if (!title) {
      return res.status(400).json({ error: 'Название расхода обязательно' });
    }

    const category = String(req.body?.category || 'Прочее').trim() || 'Прочее';
    const amount = normalizePositiveAmount(req.body?.amount);
    const paidAmount = normalizePaidAmount(req.body?.paidAmount, amount);
    const expenseDate = normalizeExpenseDate(req.body?.expenseDate);

    const updated = await prisma.expense.update({
      where: { id: expenseId },
      data: {
        warehouseId,
        category,
        title,
        amount,
        paidAmount,
        expenseDate,
        note: normalizeOptionalString(req.body?.note),
      },
      include: {
        warehouse: {
          select: { id: true, name: true },
        },
        user: {
          select: { id: true, username: true },
        },
      },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
};

router.put('/:id', updateExpenseHandler);
router.patch('/:id', updateExpenseHandler);

router.post('/:id/payments', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    ensureAdminOnly(access.isAdmin);
    const expenseId = Number(req.params.id);
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: {
        id: true,
        warehouseId: true,
        amount: true,
        paidAmount: true,
      },
    });

    if (!expense) {
      return res.status(404).json({ error: 'Расход не найден' });
    }

    const amount = normalizePositiveAmount(req.body?.amount);
    const nextPaidAmount = normalizePaidAmount(Number(expense.paidAmount || 0) + amount, Number(expense.amount || 0));

    const updated = await prisma.expense.update({
      where: { id: expenseId },
      data: {
        paidAmount: nextPaidAmount,
      },
      include: {
        warehouse: {
          select: { id: true, name: true },
        },
        user: {
          select: { id: true, username: true },
        },
      },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    ensureAdminOnly(access.isAdmin);
    const expenseId = Number(req.params.id);
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: {
        id: true,
        warehouseId: true,
        userId: true,
      },
    });

    if (!expense) {
      return res.status(404).json({ error: 'Расход не найден' });
    }

    await prisma.expense.delete({ where: { id: expenseId } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
