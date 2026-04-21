import { z } from 'zod';

export const userIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const loginBodySchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export const registerBodySchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
  phone: z.string().trim().min(1).optional(),
  role: z.string().trim().min(1).optional(),
  warehouseId: z.coerce.number().int().positive().nullable().optional(),
  canCancelInvoices: z.boolean().optional(),
  canDeleteData: z.boolean().optional(),
});

export const updateUserBodySchema = z
  .object({
    username: z.string().trim().min(1).optional(),
    password: z.string().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    role: z.string().trim().min(1).optional(),
    warehouseId: z.coerce.number().int().positive().nullable().optional(),
    canCancelInvoices: z.boolean().optional(),
    canDeleteData: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field must be provided',
  });

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

export const twoFactorLoginBodySchema = z.object({
  twoFactorToken: z.string().min(1),
  code: z.string().trim().min(1),
});

export const twoFactorVerifySetupBodySchema = z.object({
  setupToken: z.string().min(1),
  code: z.string().trim().min(1),
});

export const twoFactorDisableBodySchema = z.object({
  currentPassword: z.string().min(1),
  code: z.string().trim().min(1),
});

