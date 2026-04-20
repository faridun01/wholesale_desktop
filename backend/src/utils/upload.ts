import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { securityConfig } from '../config/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultUploadsDir = path.resolve(__dirname, '../../uploads');

export const uploadsDir = path.resolve(process.env.APP_UPLOADS_DIR || defaultUploadsDir);

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const detectFileSignature = async (filePath: string) => {
  const handle = await fs.promises.open(filePath, 'r');

  try {
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const header = buffer.subarray(0, bytesRead);

    if (
      header.length >= 3 &&
      header[0] === 0xff &&
      header[1] === 0xd8 &&
      header[2] === 0xff
    ) {
      return 'image/jpeg';
    }

    if (
      header.length >= 8 &&
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47 &&
      header[4] === 0x0d &&
      header[5] === 0x0a &&
      header[6] === 0x1a &&
      header[7] === 0x0a
    ) {
      return 'image/png';
    }

    if (
      header.length >= 12 &&
      header[0] === 0x52 &&
      header[1] === 0x49 &&
      header[2] === 0x46 &&
      header[3] === 0x46 &&
      header[8] === 0x57 &&
      header[9] === 0x45 &&
      header[10] === 0x42 &&
      header[11] === 0x50
    ) {
      return 'image/webp';
    }


    return null;
  } finally {
    await handle.close();
  }
};

export const assertFileSignature = async (filePath: string, allowedMimeTypes: Set<string>) => {
  const detectedMimeType = await detectFileSignature(filePath);
  if (!detectedMimeType || !allowedMimeTypes.has(detectedMimeType)) {
    throw new Error('Invalid file signature');
  }

  return detectedMimeType;
};

const buildStorage = () =>
  multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const extension = path.extname(file.originalname || '').toLowerCase();
      cb(null, `${crypto.randomUUID()}${extension}`);
    },
  });

const createFileFilter =
  (allowedMimeTypes: Set<string>) =>
  (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error('Unsupported file type'));
    }

    cb(null, true);
  };

export const imageUpload = multer({
  storage: buildStorage(),
  limits: { fileSize: securityConfig.upload.maxImageBytes, files: 1 },
  fileFilter: createFileFilter(imageMimeTypes),
});

export const allowedImageMimeTypes = imageMimeTypes;
