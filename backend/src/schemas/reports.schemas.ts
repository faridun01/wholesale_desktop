import { z } from 'zod';

const emptyToUndefined = <T>(schema: z.ZodType<T>) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const dateString = z.string();

const numericId = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : Number(value)),
  z.number().int().positive().optional()
);

export const commonReportsQuerySchema = z.object({
  start: emptyToUndefined(dateString),
  end: emptyToUndefined(dateString),
  warehouse_id: numericId,
  warehouseId: numericId,
});

export const transactionsQuerySchema = z.object({
  productId: numericId,
  type: emptyToUndefined(z.string().trim().min(1)),
  warehouseId: numericId,
  limit: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? 50 : Number(value)),
    z.number().int().min(1).max(500)
  ),
});

