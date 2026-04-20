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

  const { default: prisma } = await import('./db/prisma.js');
  const { default: bcrypt } = await import('bcryptjs');

  // Ищем именно админа, чтобы гарантировать вход
  const adminUser = await prisma.user.findUnique({
    where: { username: 'admin' }
  });

  if (!adminUser) {
    console.log('Admin user not found. Creating default administrator...');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
      data: {
        username: 'admin',
        passwordHash: hashedPassword,
        role: 'ADMIN',
        active: true
      },
    });
    console.log('Default admin created: admin / admin123');
  } else if (!adminUser.active) {
    // Если админ есть, но деактивирован - активируем его
    await prisma.user.update({
      where: { username: 'admin' },
      data: { active: true }
    });
    console.log('Existing admin user reactivated.');
  }
} catch (error) {
  console.error('Failed to initialize database connection or admin user.');
  console.error(error);
  process.exit(1);
}

const { default: app } = await import('./app.js');
const server = app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});

server.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});
