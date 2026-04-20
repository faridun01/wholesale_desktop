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
  path.resolve(__dirname, '../../.env'), // From backend/dist to backend root
  path.resolve(__dirname, '../../../.env'), // From backend/dist to project root
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../../app.asar/.env'),
  path.resolve(__dirname, '../../app.asar/backend/.env'),
  path.join(process.cwd(), 'resources/app.asar/.env'),
  path.join(process.cwd(), 'resources/app/.env'),
].filter((value): value is string => Boolean(value));

const loadEnv = () => {
  for (const envPath of envCandidates) {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      return envPath;
    }
  }

  return null;
};

const loadedEnvPath = loadEnv();

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '127.0.0.1';

const maskDatabaseUrl = (databaseUrl: string) => {
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return 'sqlite-db';
  }
};

const printDatabaseConnectionHelp = (error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unknown database initialization error';
  const databaseUrl = process.env.DATABASE_URL;

  console.error('Failed to initialize database connection.');
  console.error(message);

  if (databaseUrl) {
    console.error(`DATABASE_URL: ${maskDatabaseUrl(databaseUrl)}`);
  } else {
    console.error('DATABASE_URL is not set.');
  }

  if (loadedEnvPath) {
    console.error(`Loaded environment file: ${loadedEnvPath}`);
  }
};

try {
  const { initRateLimitStorage } = await import('./middlewares/rate-limit.middleware.js');
  await initRateLimitStorage();

  const { default: prisma } = await import('./db/prisma.js');
  const { default: bcrypt } = await import('bcryptjs');

  const userCount = await prisma.user.count();
  if (userCount === 0) {
    console.log('No users found in database. Creating bootstrap administrator...');
    await prisma.user.create({
      data: {
        username: 'admin',
        passwordHash: await bcrypt.hash('admin123', 10),
        role: 'ADMIN',
        active: true
      },
    });
    console.log('Bootstrap admin created: admin / admin123');
  }
} catch (error) {
  printDatabaseConnectionHelp(error);
  process.exit(1);
}

const { default: app } = await import('./app.js');

const server = app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Failed to start server: Error: Port ${PORT} is already in use`);
    process.exit(1);
  }

  console.error('Failed to start server:', error);
  process.exit(1);
});
