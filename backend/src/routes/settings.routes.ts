import { Router } from 'express';
import { SettingsService } from '../services/settings.service.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import prisma from '../db/prisma.js';

const router = Router();

router.get('/public', async (req, res, next) => {
  try {
    const settings = await SettingsService.getSettings();
    res.json({
      priceVisibility: settings.priceVisibility || 'everyone',
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', authenticate, authorize(['ADMIN']), async (req, res, next) => {
  try {
    const settings = await SettingsService.getSettings();
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize(['ADMIN']), async (req, res, next) => {
  try {
    const { key, value } = req.body;
    const setting = await SettingsService.updateSetting(key, value);
    res.json(setting);
  } catch (error) {
    next(error);
  }
});

router.get('/categories', authenticate, async (req, res, next) => {
  try {
    const categories = await SettingsService.getCategories();
    res.json(categories);
  } catch (error) {
    next(error);
  }
});

router.post('/categories', authenticate, authorize(['ADMIN']), async (req, res, next) => {
  try {
    const category = await SettingsService.ensureCategory(req.body?.name);
    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
});

router.get('/company-profile', authenticate, async (req, res, next) => {
  try {
    const profile = await prisma.companyProfile.findFirst({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

router.post('/company-profile', authenticate, authorize(['ADMIN']), async (req, res, next) => {
  try {
    const payload = {
      name: String(req.body?.name || '').trim(),
      country: req.body?.country ? String(req.body.country).trim() : null,
      region: req.body?.region ? String(req.body.region).trim() : null,
      city: req.body?.city ? String(req.body.city).trim() : null,
      addressLine: req.body?.addressLine ? String(req.body.addressLine).trim() : null,
      phone: req.body?.phone ? String(req.body.phone).trim() : null,
      note: req.body?.note ? String(req.body.note).trim() : null,
      isActive: true,
    };

    if (!payload.name) {
      return res.status(400).json({ error: 'Название компании обязательно' });
    }

    const existing = await prisma.companyProfile.findFirst({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });

    const profile = existing
      ? await prisma.companyProfile.update({
          where: { id: existing.id },
          data: payload,
        })
      : await prisma.companyProfile.create({
          data: payload,
        });

    res.json(profile);
  } catch (error) {
    next(error);
  }
});

export default router;
