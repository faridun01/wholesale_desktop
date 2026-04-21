import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkAllCustomers() {
  const customers = await prisma.customer.findMany({
    include: {
      invoices: { where: { cancelled: false } },
      payments: true,
      returns: true
    }
  });

  console.log(`\n=== AUDITING ${customers.length} CUSTOMERS ===\n`);
  
  let totalErrors = 0;

  for (const c of customers) {
    const totalRevenue = c.invoices.reduce((s, inv) => s + Number(inv.netAmount || 0), 0);
    const totalPayments = c.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const globalDebt = totalRevenue - totalPayments;

    // Simulate FIFO distribution
    let remainingCredit = totalPayments;
    const sortedInvoices = [...c.invoices].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    
    let sumOfTableBalances = 0;
    sortedInvoices.forEach(inv => {
      const net = Number(inv.netAmount || 0);
      const effectivePaid = Math.min(net, remainingCredit);
      remainingCredit -= effectivePaid;
      sumOfTableBalances += (net - effectivePaid);
    });

    const diff = Math.abs(globalDebt - sumOfTableBalances);
    const hasError = diff > 0.01 && globalDebt > 0; // Negative globalDebt (prepayment) is handled differently in UI

    if (hasError) {
      totalErrors++;
      console.log(`[ERROR] Customer: ${c.name} (ID: ${c.id})`);
      console.log(`  Summary Debt: ${globalDebt.toFixed(2)}`);
      console.log(`  Table Debt:   ${sumOfTableBalances.toFixed(2)}`);
      console.log(`  Difference:   ${diff.toFixed(2)}`);
    } else {
      console.log(`[OK] ${c.name.padEnd(20)} | ID: ${c.id} | Debt: ${globalDebt.toFixed(2)}`);
    }
  }

  console.log(`\nAudit Complete. Total customers with discrepancies: ${totalErrors}`);
}

checkAllCustomers()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
