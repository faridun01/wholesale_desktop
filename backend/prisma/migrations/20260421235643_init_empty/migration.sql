-- CreateTable
CREATE TABLE "return_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "return_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "quantity" REAL NOT NULL,
    "price" REAL NOT NULL,
    CONSTRAINT "return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "inventory_write_offs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "warehouse_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "total_value" REAL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "rate_limit_entries" (
    "key" TEXT PRIMARY KEY,
    "count" INTEGER NOT NULL,
    "reset_at" DATETIME NOT NULL,
    "blocked_until" DATETIME
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_inventory_transactions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "product_id" INTEGER NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "qty_change" REAL NOT NULL,
    "stock_after" REAL,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "reference_id" INTEGER,
    "write_off_id" INTEGER,
    "is_reversed" BOOLEAN NOT NULL DEFAULT false,
    "reversed_id" INTEGER,
    "cost_at_time" REAL,
    "selling_at_time" REAL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inventory_transactions_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inventory_transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inventory_transactions_write_off_id_fkey" FOREIGN KEY ("write_off_id") REFERENCES "inventory_write_offs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_inventory_transactions" ("cost_at_time", "created_at", "id", "product_id", "qty_change", "reason", "reference_id", "selling_at_time", "type", "user_id", "warehouse_id") SELECT "cost_at_time", "created_at", "id", "product_id", "qty_change", "reason", "reference_id", "selling_at_time", "type", "user_id", "warehouse_id" FROM "inventory_transactions";
DROP TABLE "inventory_transactions";
ALTER TABLE "new_inventory_transactions" RENAME TO "inventory_transactions";
CREATE INDEX "inventory_transactions_type_warehouse_id_created_at_idx" ON "inventory_transactions"("type", "warehouse_id", "created_at");
CREATE INDEX "inventory_transactions_warehouse_id_created_at_idx" ON "inventory_transactions"("warehouse_id", "created_at");
CREATE INDEX "inventory_transactions_product_id_created_at_idx" ON "inventory_transactions"("product_id", "created_at");
CREATE INDEX "inventory_transactions_reference_id_idx" ON "inventory_transactions"("reference_id");
CREATE INDEX "inventory_transactions_user_id_created_at_idx" ON "inventory_transactions"("user_id", "created_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "inventory_write_offs_warehouse_id_created_at_idx" ON "inventory_write_offs"("warehouse_id", "created_at");
