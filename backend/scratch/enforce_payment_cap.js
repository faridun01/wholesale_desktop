
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function enforcePaymentCap() {
  console.log('Enforcing payment cap (paidAmount <= netAmount) for all invoices...');
  
  const overpaidInvoices = await prisma.invoice.findMany({
    where: {
      cancelled: false,
      paidAmount: { gt: prisma.invoice.fields.netAmount }
    }
  });

  console.log(`Found ${overpaidInvoices.length} overpaid invoices.`);

  for (const inv of overpaidInvoices) {
    console.log(`Fixing Invoice #${inv.id}: Net=${inv.netAmount}, Old Paid=${inv.paidAmount} -> New Paid=${inv.netAmount}`);
    
    await prisma.$transaction(async (tx) => {
      // 1. Update Invoice
      await tx.invoice.update({
        where: { id: inv.id },
        data: { 
          paidAmount: inv.netAmount,
          status: 'paid'
        }
      });

      // 2. Adjust payments for this invoice if they exceed the net amount
      const payments = await tx.payment.findMany({
        where: { invoiceId: inv.id },
        orderBy: { createdAt: 'desc' }
      });

      let currentSum = 0;
      for (const p of payments) {
        currentSum += p.amount;
      }

      if (currentSum > inv.netAmount) {
        // We need to reduce payments. We'll start from the most recent ones.
        let excess = currentSum - inv.netAmount;
        for (const p of payments) {
          if (excess <= 0) break;
          const reduceBy = Math.min(p.amount, excess);
          console.log(`  Reducing Payment #${p.id} by ${reduceBy}`);
          await tx.payment.update({
            where: { id: p.id },
            data: { amount: { decrement: reduceBy } }
          });
          excess -= reduceBy;
        }
      }
    });
  }

  console.log('Global payment cap enforcement completed.');
}

enforcePaymentCap().catch(console.error).finally(() => prisma.$disconnect());
