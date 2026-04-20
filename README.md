# My Wholesale Shop

Wholesale CRM and inventory system:
- warehouse management
- products and stock tracking
- POS terminal
- sales history
- customers and reminders
- reports

## Prerequisites

- Node.js 22+
- PostgreSQL 16+
- npm

## Quick Start (Local)

1. Install root dependencies:
   - `npm install`
2. Install backend/frontend dependencies:
   - `npm --prefix backend install`
   - `npm --prefix frontend install`
3. Create backend env:
   - copy `backend/.env.example` to `backend/.env`
   - fill at least: `DATABASE_URL`, `JWT_SECRET`, `TWO_FACTOR_BACKUP_PEPPER`, `OCR_API_KEY`
   - keep secure defaults:
     - `ALLOW_UPLOAD_QUERY_TOKEN=false`
     - `CSP_REPORT_ONLY=true`
4. Generate Prisma client and run migrations:
   - `npm --prefix backend run prisma:generate`
   - `npm --prefix backend run prisma:migrate`
5. Start backend:
   - `npm run dev:backend`
6. Start frontend:
   - `npm run dev:frontend`
7. Open app:
   - `http://localhost:3000`

Run both services together:
- `npm run dev:all`

## Health Check

- Backend health endpoint:
  - `GET http://localhost:3001/api/health`

## Build and Type Check

- Type check both apps:
  - `npm run lint`
- Production build:
  - `npm run build`

## Docker (Production-like Local)

1. Copy `.env.docker.example` to `.env` in repository root.
2. Fill required values (`POSTGRES_PASSWORD`, `JWT_SECRET`, `TWO_FACTOR_BACKUP_PEPPER`, `OCR_API_KEY`).
3. Keep secure defaults in production:
   - `ALLOW_UPLOAD_QUERY_TOKEN=false`
   - `CSP_REPORT_ONLY=true` (switch to `false` after CSP report review)
3. Start stack:
   - `docker compose up -d --build`
4. Open frontend:
   - `http://localhost`
5. Health:
   - `http://localhost/api/health`

## Common Troubleshooting

- `npm` blocked in PowerShell on Windows:
  - use `npm.cmd` instead of `npm`
- Prisma DB connection error:
  - verify `DATABASE_URL` and PostgreSQL availability
- 401 after login:
  - verify backend is running on `3001` and frontend proxy is active
