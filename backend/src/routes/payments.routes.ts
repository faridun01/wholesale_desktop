import { Router } from 'express';
import prisma from '../db/prisma.js';
import { AuthRequest } from '../middlewares/auth.middleware.js';
import { ensureWarehouseAccess, getAccessContext } from '../utils/access.js';
import { normalizeMoney, roundMoney } from '../utils/money.js';

const router = Router();
const PAYMENT_EPSILON = 0.01;

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const { customer_id, invoice_id, amount, method, note } = req.body;
    const normalizedAmount = normalizeMoney(amount, 'Amount', { allowZero: false });
    if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
      return res.status(400).json({ error: 'Amount must be a non-negative number' });
    }

    const userId = req.user!.id;
    const access = await getAccessContext(req);
    const invoiceId = invoice_id ? Number(invoice_id) : null;
    const invoice = invoiceId
      ? await prisma.invoice.findUnique({
          where: { id: invoiceId },
          select: { id: true, customerId: true, warehouseId: true, userId: true },
        })
      : null;

    if (!access.isAdmin) {
      if (!invoice) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (!ensureWarehouseAccess(access, invoice.warehouseId) || invoice.userId !== access.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const payment = await prisma.$transaction(async (tx: any) => {
      const p = await tx.payment.create({
        data: {
          customerId: invoice?.customerId ?? Number(customer_id),
          invoiceId,
          userId,
          amount: normalizedAmount,
          method: method || 'cash',
        },
      });

      if (invoiceId) {
        const currentInvoice = await tx.invoice.findUnique({
          where: { id: invoiceId },
        });

        if (currentInvoice) {
          const netAmount = Number(currentInvoice.netAmount);
          const currentPaid = Number(currentInvoice.paidAmount);
          const debt = Math.max(0, netAmount - currentPaid);

          if (normalizedAmount > debt + PAYMENT_EPSILON) {
            throw new Error(`Сумма оплаты (${normalizedAmount}) превышает остаток долга (${roundMoney(debt)})`);
          }

          const newPaidAmount = roundMoney(currentPaid + normalizedAmount);
          const status = newPaidAmount > 0 && newPaidAmount >= netAmount - PAYMENT_EPSILON ? 'paid' : 'partial';
          
          await tx.invoice.update({
            where: { id: invoiceId },
            data: {
              paidAmount: newPaidAmount,
              status,
            },
          });
        }
      }

      return p;
    });

    res.status(201).json(payment);
  } catch (error) {
    next(error);
  }
});

export default router;
