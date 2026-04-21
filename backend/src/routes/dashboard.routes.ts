import { Router } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { getAccessContext, getScopedWarehouseId } from '../utils/access.js';
import { DashboardService } from '../services/dashboard.service.js';

const router = Router();

router.get('/summary', async (req: AuthRequest, res, next) => {
  try {
    const access = await getAccessContext(req);
    if (!access.isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const warehouseId = getScopedWarehouseId(access, req.query.warehouseId);
    const userId = req.user!.id;

    const summary = await DashboardService.getSummary(access, { warehouseId: warehouseId ?? undefined, userId });
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

export default router;
