import { z } from 'zod';

export const reminderIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const createReminderBodySchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
  dueDate: z.string().datetime(),
  type: z.string().trim().min(1).optional(),
  referenceId: z.coerce.number().int().positive().optional(),
});

export const updateReminderBodySchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().optional(),
    dueDate: z.string().datetime().optional(),
    type: z.string().trim().min(1).optional(),
    isCompleted: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field must be provided',
  });

