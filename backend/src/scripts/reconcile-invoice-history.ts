import 'dotenv/config';
import prisma from '../db/prisma.js';

const MONEY_EPSILON = 0.01;

function roundMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function getInvoiceStatus(paidAmount: number, netAmount: number) {
  if (paidAmount > 0 && paidAmount >= netAmount - MONEY_EPSILON) {
    return 'paid';
  }

  if (paidAmount > 0) {
    return 'partial';
  }

  return 'unpaid';
}

function isDifferent(currentValue: number, expectedValue: number) {
  return Math.abs(roundMoney(currentValue) - roundMoney(expectedValue)) > MONEY_EPSILON;
}

async function main() {
  const shouldApply = process.argv.includes('--apply');

  const invoices = await prisma.invoice.findMany({
    where: {
      OR: [
        { returnedAmount: { gt: 0 } },
        { returns: { some: {} } },
        { items: { some: { returnedQty: { gt: 0 } } } },
      ],
    },
    include: {
      items: {
        select: {
          id: true,
          quantity: true,
          returnedQty: true,
          sellingPrice: true,
          totalPrice: true,
        },
      },
      returns: {
        select: {
          id: true,
          totalValue: true,
          createdAt: true,
        },
      },
      payments: {
        select: {
          id: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  const invoiceIds = invoices.map((invoice) => invoice.id);
  const returnTransactions = invoiceIds.length
    ? await prisma.inventoryTransaction.findMany({
        where: {
          type: 'return',
          referenceId: { in: invoiceIds },
        },
        select: {
          id: true,
          referenceId: true,
          qtyChange: true,
          sellingAtTime: true,
          createdAt: true,
        },
      })
    : [];

  const transactionsByInvoiceId = new Map<number, typeof returnTransactions>();
  for (const transaction of returnTransactions) {
    const invoiceId = Number(transaction.referenceId || 0);
    if (!transactionsByInvoiceId.has(invoiceId)) {
      transactionsByInvoiceId.set(invoiceId, []);
    }
    transactionsByInvoiceId.get(invoiceId)!.push(transaction);
  }

  let staleReturnAuditCount = 0;
  let aggregateFixCount = 0;
  let touchedInvoices = 0;

  for (const invoice of invoices) {
    const totalAmount = roundMoney(
      (Array.isArray(invoice.items) ? invoice.items : []).reduce((sum, item) => {
        const lineTotal = Number(item.totalPrice ?? 0);
        if (lineTotal > 0) {
          return sum + lineTotal;
        }

        return sum + Number(item.quantity || 0) * Number(item.sellingPrice || 0);
      }, 0),
    );

    const calculatedReturnedAmount = roundMoney(
      (Array.isArray(invoice.items) ? invoice.items : []).reduce(
        (sum, item) => sum + Number(item.returnedQty || 0) * Number(item.sellingPrice || 0),
        0,
      ),
    );

    const expectedNetAmount = roundMoney(
      totalAmount - totalAmount * (Number(invoice.discount || 0) / 100) + Number(invoice.tax || 0) - calculatedReturnedAmount,
    );
    const expectedStatus = getInvoiceStatus(Number(invoice.paidAmount || 0), expectedNetAmount);

    const staleReturnAudit =
      calculatedReturnedAmount <= MONEY_EPSILON &&
      (
        (Array.isArray(invoice.returns) && invoice.returns.length > 0) ||
        (transactionsByInvoiceId.get(invoice.id)?.length || 0) > 0 ||
        Number(invoice.returnedAmount || 0) > MONEY_EPSILON
      );

    const needsAggregateFix =
      isDifferent(Number(invoice.totalAmount || 0), totalAmount) ||
      isDifferent(Number(invoice.returnedAmount || 0), calculatedReturnedAmount) ||
      isDifferent(Number(invoice.netAmount || 0), expectedNetAmount) ||
      String(invoice.status || '') !== expectedStatus;

    if (!staleReturnAudit && !needsAggregateFix) {
      continue;
    }

    touchedInvoices += 1;
    if (staleReturnAudit) {
      staleReturnAuditCount += 1;
    }
    if (needsAggregateFix) {
      aggregateFixCount += 1;
    }

    const summary = [
      `Invoice #${invoice.id}`,
      `stored total=${Number(invoice.totalAmount || 0).toFixed(2)}`,
      `expected total=${totalAmount.toFixed(2)}`,
      `stored returned=${Number(invoice.returnedAmount || 0).toFixed(2)}`,
      `expected returned=${calculatedReturnedAmount.toFixed(2)}`,
      `stored net=${Number(invoice.netAmount || 0).toFixed(2)}`,
      `expected net=${expectedNetAmount.toFixed(2)}`,
      `returns=${invoice.returns.length}`,
      `returnTx=${transactionsByInvoiceId.get(invoice.id)?.length || 0}`,
      `status=${String(invoice.status || '')}->${expectedStatus}`,
      staleReturnAudit ? 'stale-return-audit=yes' : 'stale-return-audit=no',
    ].join(' | ');

    console.log(shouldApply ? `APPLY ${summary}` : `DRY  ${summary}`);

    if (!shouldApply) {
      continue;
    }

    await prisma.$transaction(async (tx) => {
      if (staleReturnAudit) {
        await tx.return.deleteMany({
          where: { invoiceId: invoice.id },
        });

        await tx.inventoryTransaction.deleteMany({
          where: {
            type: 'return',
            referenceId: invoice.id,
          },
        });
      }

      if (staleReturnAudit || needsAggregateFix) {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            totalAmount,
            returnedAmount: calculatedReturnedAmount,
            netAmount: expectedNetAmount,
            status: expectedStatus,
          },
        });
      }
    });
  }

  console.log(
    [
      shouldApply ? 'Applied reconciliation.' : 'Dry run completed.',
      `Invoices checked: ${invoices.length}.`,
      `Invoices needing changes: ${touchedInvoices}.`,
      `Stale return audit fixes: ${staleReturnAuditCount}.`,
      `Aggregate fixes: ${aggregateFixCount}.`,
    ].join(' '),
  );
}

main()
  .catch((error) => {
    console.error('Failed to reconcile invoice history.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
