# Docker Deploy

## 1) Prepare environment

Copy root docker env template:

```bash
cp .env.docker.example .env
```

Required variables:
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `TWO_FACTOR_BACKUP_PEPPER`

Optional:
- `POSTGRES_DB`
- `POSTGRES_USER`
- `FRONTEND_PORT`
- `CORS_ORIGINS`
- `FRONTEND_ORIGIN`
- `COOKIE_SECURE`
- `ALLOW_UPLOAD_QUERY_TOKEN`
- `CSP_REPORT_ONLY`
- `CSP_REPORT_URI`

## 2) Build and run

```bash
docker compose up -d --build
```

## 3) Verify services

- Frontend: `http://localhost`
- Backend health: `http://localhost/api/health`

## 4) Useful commands

```bash
docker compose logs -f
docker compose ps
docker compose down
docker compose down -v
```

## Notes

- Backend runs Prisma migrations on container start.
- Frontend is served by nginx and proxies `/api` to backend.
