import prisma from './prisma.js';

/**
 * Robust schema repair for SQLite.
 * Since we are running in a packaged Electron app, we can't always rely on 'prisma migrate deploy'.
 * This utility checks for missing columns and adds them if necessary.
 */
export async function repairSchema() {
  console.log('Checking database schema integrity...');
  
  const tasks = [
    { table: 'product_batches', column: 'selling_price', type: 'REAL' },
    { table: 'products', column: 'min_stock', type: 'REAL DEFAULT 0' },
    { table: 'products', column: 'units_per_box', type: 'INTEGER DEFAULT 1' },
    { table: 'inventory_transactions', column: 'cost_at_time', type: 'REAL' },
    { table: 'inventory_transactions', column: 'selling_at_time', type: 'REAL' },
    { table: 'users', column: 'two_factor_enabled', type: 'BOOLEAN DEFAULT 0' },
    { table: 'users', column: 'two_factor_secret', type: 'TEXT' },
    { table: 'users', column: 'two_factor_backup_codes', type: 'TEXT' },
    { table: 'users', column: 'can_cancel_invoices', type: 'BOOLEAN DEFAULT 0' },
    { table: 'users', column: 'can_delete_data', type: 'BOOLEAN DEFAULT 0' },
    { table: 'invoices', column: 'discount', type: 'REAL DEFAULT 0' },
    { table: 'invoices', column: 'tax', type: 'REAL DEFAULT 0' },
    { table: 'invoices', column: 'net_amount', type: 'REAL DEFAULT 0' },
  ];

  for (const task of tasks) {
    try {
      const columns = await prisma.$queryRawUnsafe<any[]>(`PRAGMA table_info(${task.table})`);
      if (columns && Array.isArray(columns)) {
        const exists = columns.some(c => c.name === task.column);
        if (!exists) {
          console.log(`[MIGRATION] Adding missing column ${task.column} to table ${task.table}`);
          await prisma.$executeRawUnsafe(`ALTER TABLE ${task.table} ADD COLUMN ${task.column} ${task.type}`);
        }
      }
    } catch (err: any) {
      console.warn(`[MIGRATION WARNING] Could not verify/update ${task.table}.${task.column}: ${err.message}`);
    }
  }
  
  console.log('Schema integrity check complete.');
}
