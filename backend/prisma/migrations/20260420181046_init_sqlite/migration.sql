-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'SELLER',
    "warehouse_id" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "can_cancel_invoices" BOOLEAN NOT NULL DEFAULT false,
    "can_delete_data" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_secret" TEXT,
    "two_factor_backup_codes" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "users_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "phone" TEXT,
    "note" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "categories" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "products" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "category_id" INTEGER NOT NULL,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "raw_name" TEXT,
    "brand" TEXT,
    "name_key" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL,
    "base_unit_name" TEXT NOT NULL DEFAULT 'шт',
    "purchase_cost_price" REAL,
    "expense_percent" REAL NOT NULL DEFAULT 0,
    "cost_price" REAL NOT NULL,
    "selling_price" REAL NOT NULL,
    "min_stock" REAL NOT NULL DEFAULT 0,
    "initial_stock" REAL NOT NULL DEFAULT 0,
    "total_incoming" REAL NOT NULL DEFAULT 0,
    "stock" REAL NOT NULL DEFAULT 0,
    "photo_url" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "warehouse_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "products_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "product_packagings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "product_id" INTEGER NOT NULL,
    "warehouse_id" INTEGER,
    "package_name" TEXT NOT NULL,
    "base_unit_name" TEXT NOT NULL,
    "units_per_package" INTEGER NOT NULL,
    "package_selling_price" REAL,
    "barcode" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "product_packagings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "product_packagings_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "product_id" INTEGER NOT NULL,
    "cost_price" REAL NOT NULL,
    "selling_price" REAL NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "product_batches" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "product_id" INTEGER NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "quantity" REAL NOT NULL,
    "remaining_quantity" REAL NOT NULL,
    "purchase_cost_price" REAL,
    "expense_percent" REAL NOT NULL DEFAULT 0,
    "cost_price" REAL NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "product_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "product_batches_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "customers" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customer_type" TEXT NOT NULL DEFAULT 'individual',
    "name" TEXT NOT NULL,
    "customer_category" TEXT,
    "company_name" TEXT,
    "contact_name" TEXT,
    "phone" TEXT,
    "country" TEXT,
    "region" TEXT,
    "address" TEXT,
    "city" TEXT,
    "notes" TEXT,
    "created_by_user_id" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "company_profiles" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "address_line" TEXT,
    "phone" TEXT,
    "note" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "purchase_documents" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "supplier_id" INTEGER,
    "warehouse_id" INTEGER NOT NULL,
    "source_type" TEXT NOT NULL DEFAULT 'pdf',
    "document_number" TEXT,
    "document_date" DATETIME,
    "file_url" TEXT,
    "raw_text" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "imported_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "purchase_documents_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "purchase_documents_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "purchase_document_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "purchase_document_id" INTEGER NOT NULL,
    "matched_product_id" INTEGER,
    "raw_name" TEXT NOT NULL,
    "clean_name" TEXT NOT NULL,
    "brand" TEXT,
    "name_key" TEXT NOT NULL,
    "package_name" TEXT,
    "base_unit_name" TEXT NOT NULL,
    "units_per_package" INTEGER,
    "package_quantity" REAL,
    "extra_unit_quantity" REAL NOT NULL DEFAULT 0,
    "total_base_units" REAL NOT NULL,
    "expense_percent" REAL NOT NULL DEFAULT 0,
    "cost_price_per_base_unit" REAL,
    "effective_cost_price_per_base_unit" REAL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "purchase_document_items_purchase_document_id_fkey" FOREIGN KEY ("purchase_document_id") REFERENCES "purchase_documents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "purchase_document_items_matched_product_id_fkey" FOREIGN KEY ("matched_product_id") REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customer_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "total_amount" REAL NOT NULL,
    "discount" REAL NOT NULL DEFAULT 0,
    "tax" REAL NOT NULL DEFAULT 0,
    "net_amount" REAL NOT NULL,
    "paid_amount" REAL NOT NULL DEFAULT 0,
    "returned_amount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'unpaid',
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "payment_due_date" DATETIME,
    "company_name_snapshot" TEXT,
    "company_country_snapshot" TEXT,
    "company_region_snapshot" TEXT,
    "company_city_snapshot" TEXT,
    "company_address_snapshot" TEXT,
    "customer_name_snapshot" TEXT,
    "customer_phone_snapshot" TEXT,
    "customer_address_snapshot" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "invoices_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoice_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "quantity" REAL NOT NULL,
    "total_base_units" REAL,
    "package_quantity" REAL,
    "extra_unit_quantity" REAL NOT NULL DEFAULT 0,
    "packaging_id" INTEGER,
    "package_name_snapshot" TEXT,
    "base_unit_name_snapshot" TEXT,
    "units_per_package_snapshot" INTEGER,
    "product_name_snapshot" TEXT,
    "raw_name_snapshot" TEXT,
    "brand_snapshot" TEXT,
    "selling_price" REAL NOT NULL,
    "cost_price" REAL NOT NULL DEFAULT 0,
    "discount" REAL NOT NULL DEFAULT 0,
    "total_price" REAL NOT NULL,
    "returned_qty" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "invoice_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sale_allocations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoice_item_id" INTEGER NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "quantity" REAL NOT NULL,
    CONSTRAINT "sale_allocations_invoice_item_id_fkey" FOREIGN KEY ("invoice_item_id") REFERENCES "invoice_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_allocations_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "product_batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customer_id" INTEGER NOT NULL,
    "invoice_id" INTEGER,
    "user_id" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'cash',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "warehouse_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "paid_amount" REAL NOT NULL DEFAULT 0,
    "expense_date" DATETIME NOT NULL,
    "note" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "expenses_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "returns" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoice_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "reason" TEXT,
    "total_value" REAL NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "returns_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "returns_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "returns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "product_id" INTEGER NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "qty_change" REAL NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "reference_id" INTEGER,
    "cost_at_time" REAL,
    "selling_at_time" REAL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inventory_transactions_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inventory_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_date" DATETIME NOT NULL,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "type" TEXT NOT NULL DEFAULT 'general',
    "reference_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_active_warehouse_id_idx" ON "users"("active", "warehouse_id");

-- CreateIndex
CREATE INDEX "users_role_active_idx" ON "users"("role", "active");

-- CreateIndex
CREATE INDEX "warehouses_active_city_idx" ON "warehouses"("active", "city");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "products_warehouse_id_active_created_at_idx" ON "products"("warehouse_id", "active", "created_at");

-- CreateIndex
CREATE INDEX "products_category_id_warehouse_id_active_idx" ON "products"("category_id", "warehouse_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "products_warehouse_id_name_key_key" ON "products"("warehouse_id", "name_key");

-- CreateIndex
CREATE UNIQUE INDEX "products_name_warehouse_id_key" ON "products"("name", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_warehouse_id_key" ON "products"("sku", "warehouse_id");

-- CreateIndex
CREATE INDEX "product_packagings_product_id_active_is_default_idx" ON "product_packagings"("product_id", "active", "is_default");

-- CreateIndex
CREATE INDEX "product_packagings_warehouse_id_active_idx" ON "product_packagings"("warehouse_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "product_packagings_product_id_package_name_units_per_package_key" ON "product_packagings"("product_id", "package_name", "units_per_package");

-- CreateIndex
CREATE UNIQUE INDEX "product_packagings_barcode_warehouse_id_key" ON "product_packagings"("barcode", "warehouse_id");

-- CreateIndex
CREATE INDEX "price_history_product_id_created_at_idx" ON "price_history"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "product_batches_warehouse_id_remaining_quantity_idx" ON "product_batches"("warehouse_id", "remaining_quantity");

-- CreateIndex
CREATE INDEX "product_batches_product_id_warehouse_id_idx" ON "product_batches"("product_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "product_batches_created_at_idx" ON "product_batches"("created_at");

-- CreateIndex
CREATE INDEX "customers_active_city_created_at_idx" ON "customers"("active", "city", "created_at");

-- CreateIndex
CREATE INDEX "customers_created_by_user_id_created_at_idx" ON "customers"("created_by_user_id", "created_at");

-- CreateIndex
CREATE INDEX "purchase_documents_warehouse_id_created_at_idx" ON "purchase_documents"("warehouse_id", "created_at");

-- CreateIndex
CREATE INDEX "purchase_documents_supplier_id_created_at_idx" ON "purchase_documents"("supplier_id", "created_at");

-- CreateIndex
CREATE INDEX "purchase_document_items_purchase_document_id_idx" ON "purchase_document_items"("purchase_document_id");

-- CreateIndex
CREATE INDEX "purchase_document_items_matched_product_id_idx" ON "purchase_document_items"("matched_product_id");

-- CreateIndex
CREATE INDEX "purchase_document_items_name_key_idx" ON "purchase_document_items"("name_key");

-- CreateIndex
CREATE INDEX "invoices_warehouse_id_cancelled_created_at_idx" ON "invoices"("warehouse_id", "cancelled", "created_at");

-- CreateIndex
CREATE INDEX "invoices_cancelled_created_at_idx" ON "invoices"("cancelled", "created_at");

-- CreateIndex
CREATE INDEX "invoices_customer_id_created_at_idx" ON "invoices"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "invoices_user_id_created_at_idx" ON "invoices"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_items_product_id_idx" ON "invoice_items"("product_id");

-- CreateIndex
CREATE INDEX "sale_allocations_invoice_item_id_idx" ON "sale_allocations"("invoice_item_id");

-- CreateIndex
CREATE INDEX "sale_allocations_batch_id_idx" ON "sale_allocations"("batch_id");

-- CreateIndex
CREATE INDEX "payments_customer_id_created_at_idx" ON "payments"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_invoice_id_created_at_idx" ON "payments"("invoice_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_user_id_created_at_idx" ON "payments"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "expenses_warehouse_id_expense_date_idx" ON "expenses"("warehouse_id", "expense_date");

-- CreateIndex
CREATE INDEX "expenses_user_id_created_at_idx" ON "expenses"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "returns_invoice_id_created_at_idx" ON "returns"("invoice_id", "created_at");

-- CreateIndex
CREATE INDEX "returns_customer_id_created_at_idx" ON "returns"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "returns_user_id_created_at_idx" ON "returns"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_transactions_type_warehouse_id_created_at_idx" ON "inventory_transactions"("type", "warehouse_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_transactions_warehouse_id_created_at_idx" ON "inventory_transactions"("warehouse_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_transactions_product_id_created_at_idx" ON "inventory_transactions"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_transactions_reference_id_idx" ON "inventory_transactions"("reference_id");

-- CreateIndex
CREATE INDEX "inventory_transactions_user_id_created_at_idx" ON "inventory_transactions"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE INDEX "reminders_user_id_is_completed_due_date_idx" ON "reminders"("user_id", "is_completed", "due_date");

-- CreateIndex
CREATE INDEX "reminders_due_date_idx" ON "reminders"("due_date");

-- CreateIndex
CREATE INDEX "reminders_reference_id_idx" ON "reminders"("reference_id");
