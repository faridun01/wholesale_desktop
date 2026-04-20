\echo 'Performance explain pack for reports/dashboard'
\echo 'Set parameters before running if needed'

-- Parameters:
--   warehouse_id = 0  -> all warehouses
--   warehouse_id > 0  -> specific warehouse
\set warehouse_id 0
\set start_date '2026-01-01T00:00:00Z'
\set end_date   '2026-12-31T23:59:59Z'
\set current_month_start '2026-04-01T00:00:00Z'
\set next_month_start    '2026-05-01T00:00:00Z'
\set prev_month_start    '2026-03-01T00:00:00Z'

-- 1) reports/analytics + reports/sales + reports/profit
--    Core invoices scan with date + cancelled + optional warehouse filter
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT i.id, i.customer_id, i.user_id, i.warehouse_id, i.net_amount, i.paid_amount, i.created_at
FROM invoices i
WHERE i.cancelled = false
  AND i.created_at >= :'start_date'::timestamptz
  AND i.created_at <= :'end_date'::timestamptz
  AND (:warehouse_id = 0 OR i.warehouse_id = :warehouse_id)
ORDER BY i.created_at ASC;

-- 2) reports/sales + reports/profit
--    Invoice items with allocation joins (hot path for margin/profit math)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT
  ii.invoice_id,
  ii.product_id,
  ii.quantity,
  ii.returned_qty,
  ii.selling_price,
  ii.cost_price,
  sa.quantity AS alloc_qty,
  pb.cost_price AS batch_cost_price
FROM invoice_items ii
JOIN invoices i ON i.id = ii.invoice_id
LEFT JOIN sale_allocations sa ON sa.invoice_item_id = ii.id
LEFT JOIN product_batches pb ON pb.id = sa.batch_id
WHERE i.cancelled = false
  AND i.created_at >= :'start_date'::timestamptz
  AND i.created_at <= :'end_date'::timestamptz
  AND (:warehouse_id = 0 OR i.warehouse_id = :warehouse_id);

-- 3) reports/writeoffs
--    Main write-off transactions fetch
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT t.id, t.reference_id, t.product_id, t.warehouse_id, t.user_id, t.qty_change, t.cost_at_time, t.created_at
FROM inventory_transactions t
WHERE t.type = 'adjustment'
  AND t.qty_change < 0
  AND t.selling_at_time IS NOT NULL
  AND t.created_at >= :'start_date'::timestamptz
  AND t.created_at <= :'end_date'::timestamptz
  AND (:warehouse_id = 0 OR t.warehouse_id = :warehouse_id)
ORDER BY t.created_at DESC;

-- 4) reports/writeoffs
--    Return transactions by reference_id for write-off restoration checks
--    Use a realistic sample list from previous query output for best plan.
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT t.reference_id, t.qty_change
FROM inventory_transactions t
WHERE t.type = 'adjustment'
  AND t.qty_change > 0
  AND t.reference_id IN (
    SELECT x.id
    FROM inventory_transactions x
    WHERE x.type = 'adjustment'
      AND x.qty_change < 0
      AND x.created_at >= :'start_date'::timestamptz
      AND x.created_at <= :'end_date'::timestamptz
      AND (:warehouse_id = 0 OR x.warehouse_id = :warehouse_id)
    ORDER BY x.created_at DESC
    LIMIT 2000
  );

-- 5) dashboard/summary
--    Monthly revenue windows + invoice count (frequent dashboard call)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT
  count(*) FILTER (
    WHERE i.created_at >= :'current_month_start'::timestamptz
      AND i.created_at <  :'next_month_start'::timestamptz
  ) AS current_month_orders,
  count(*) FILTER (
    WHERE i.created_at >= :'prev_month_start'::timestamptz
      AND i.created_at <  :'current_month_start'::timestamptz
  ) AS previous_month_orders,
  COALESCE(sum(i.net_amount) FILTER (
    WHERE i.created_at >= :'current_month_start'::timestamptz
      AND i.created_at <  :'next_month_start'::timestamptz
  ), 0) AS current_month_revenue,
  COALESCE(sum(i.net_amount) FILTER (
    WHERE i.created_at >= :'prev_month_start'::timestamptz
      AND i.created_at <  :'current_month_start'::timestamptz
  ), 0) AS previous_month_revenue
FROM invoices i
WHERE i.cancelled = false
  AND (:warehouse_id = 0 OR i.warehouse_id = :warehouse_id);

-- Optional dashboard helpers:
-- low-stock / active products
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT p.id, p.name, p.stock
FROM products p
WHERE p.active = true
  AND (:warehouse_id = 0 OR p.warehouse_id = :warehouse_id)
ORDER BY p.stock ASC
LIMIT 500;

-- reminder widget pending list
-- replace 1 with actual user_id when testing
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT r.id, r.user_id, r.due_date, r.is_completed
FROM reminders r
WHERE r.user_id = 1
  AND r.is_completed = false
ORDER BY r.due_date ASC
LIMIT 5;

