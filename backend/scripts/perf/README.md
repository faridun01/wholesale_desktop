# Performance Baseline Pack (Stage 4.2)

This folder contains:
- `explain_reports.sql` - `EXPLAIN (ANALYZE, BUFFERS)` queries for heavy report/dashboard paths
- `measure_p95.ps1` - endpoint-level p95 measurement script

## 1) SQL plans before/after index deployment

Run against your Postgres DB:

```powershell
docker compose exec postgres psql -U postgres -d my_wholesale_shop -f /path/to/backend/scripts/perf/explain_reports.sql
```

If you are not using docker:

```powershell
psql "$env:DATABASE_URL" -f backend/scripts/perf/explain_reports.sql
```

Tips:
- Adjust parameters at the top of `explain_reports.sql` (`warehouse_id`, date ranges)
- Save outputs as `plans_before.txt` and `plans_after.txt`
- Compare:
  - `Execution Time`
  - `Buffers: shared hit/read`
  - whether plan switched from seq scans to index scans where expected

## 2) Endpoint p95 before/after

Use a valid admin JWT token:

```powershell
.\backend\scripts\perf\measure_p95.ps1 -BaseUrl "http://localhost:3001" -BearerToken "<JWT>" -RequestsPerEndpoint 30
```

Recommended process:
1. Run once before applying indexes and save output.
2. Apply migration/indexes.
3. Run again with same date range and request count.
4. Compare p95 per endpoint.

## 3) Acceptance criteria

- p95 decreased on at least:
  - `/api/reports/analytics`
  - `/api/reports/sales` or `/api/reports/profit`
  - `/api/reports/writeoffs`
  - `/api/dashboard/summary`
- No correctness regressions in report totals.

