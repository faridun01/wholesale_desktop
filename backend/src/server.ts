import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { URL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envCandidates = [
  process.env.APP_ENV_PATH,
  path.resolve(process.cwd(), 'backend/.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(process.cwd(), '.env'),
].filter((value): value is string => Boolean(value));

const loadEnv = () => {
  for (const envPath of envCandidates) {
    const result = dotenv.config({ path: envPath });
    if (!result.error) return envPath;
  }
  return null;
};

loadEnv();

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '127.0.0.1';

try {
  const { initRateLimitStorage } = await import('./middlewares/rate-limit.middleware.js');
  await initRateLimitStorage();

  const { repairSchema } = await import('./db/repair.js');
  await repairSchema();

  console.log('Database connected and verified.');
} catch (error) {
  console.error('Failed to initialize backend services.');
  console.error(error);
  process.exit(1);
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

const { default: app } = await import('./app.js');
const server = app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});

server.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});
