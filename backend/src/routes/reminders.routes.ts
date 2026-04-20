import { Router } from 'express';
import { ReminderService } from '../services/reminder.service.js';
import { AuthRequest, authorize } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import {
  createReminderBodySchema,
  reminderIdParamSchema,
  updateReminderBodySchema,
} from '../schemas/reminder.schemas.js';

const router = Router();

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const reminders = await ReminderService.getReminders({
      userId: req.user!.id,
      isAdmin: String(req.user!.role || '').toUpperCase() === 'ADMIN',
    });
    res.json(reminders);
  } catch (error) {
    next(error);
  }
});

router.post('/', validateRequest({ body: createReminderBodySchema }), async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const reminder = await ReminderService.createReminder({
      ...req.body,
      userId,
    });
    res.status(201).json(reminder);
  } catch (error) {
    next(error);
  }
});

router.put(
  '/:id',
  validateRequest({ params: reminderIdParamSchema, body: updateReminderBodySchema }),
  async (req: AuthRequest, res, next) => {
  try {
    const reminder = await ReminderService.updateReminderForActor(
      Number(req.params.id),
      {
        userId: req.user!.id,
        isAdmin: String(req.user!.role || '').toUpperCase() === 'ADMIN',
      },
      req.body
    );
    res.json(reminder);
  } catch (error) {
    next(error);
  }
});

router.put('/:id/complete', validateRequest({ params: reminderIdParamSchema }), async (req: AuthRequest, res, next) => {
  try {
    const reminder = await ReminderService.completeReminderForActor(
      Number(req.params.id),
      {
        userId: req.user!.id,
        isAdmin: String(req.user!.role || '').toUpperCase() === 'ADMIN',
      }
    );
    res.json(reminder);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', validateRequest({ params: reminderIdParamSchema }), authorize(['ADMIN']), async (req, res, next) => {
  try {
    await ReminderService.deleteReminder(Number(req.params.id));
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
