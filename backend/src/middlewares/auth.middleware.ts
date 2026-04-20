import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma.js';
import { securityConfig } from '../config/security.js';

const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  return secret;
})();

export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: string;
    warehouseId?: number;
    canCancelInvoices?: boolean;
    canDeleteData?: boolean;
  };
}

const buildAuthUser = (user: {
  id: number;
  username: string;
  role: string;
  warehouseId: number | null;
  canCancelInvoices: boolean;
  canDeleteData: boolean;
}) => ({
  id: user.id,
  username: user.username,
  role: user.role,
  warehouseId: user.warehouseId ?? undefined,
  canCancelInvoices: user.canCancelInvoices,
  canDeleteData: user.canDeleteData,
});

const parseCookies = (cookieHeader?: string) => {
  const safeDecode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const entries = String(cookieHeader || '')
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const separatorIndex = chunk.indexOf('=');
      if (separatorIndex === -1) {
        return [chunk, ''] as const;
      }

      return [
        safeDecode(chunk.slice(0, separatorIndex).trim()),
        safeDecode(chunk.slice(separatorIndex + 1).trim()),
      ] as const;
    });

  return Object.fromEntries(entries);
};

const getBearerToken = (authHeader?: string) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.split(' ')[1];
};

const getRequestToken = (req: Request) => {
  const bearerToken = getBearerToken(req.headers.authorization);
  if (bearerToken) {
    return bearerToken;
  }

  const cookies = parseCookies(req.headers.cookie);
  return cookies.auth_token || null;
};

const resolveUserFromToken = async (token: string) => {
  const decoded = jwt.verify(token, JWT_SECRET, {
    issuer: securityConfig.auth.tokenIssuer,
    audience: securityConfig.auth.tokenAudience,
  }) as any;
  const userId = Number(decoded?.id);

  if (!Number.isFinite(userId)) {
    throw new Error('Invalid token');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      role: true,
      warehouseId: true,
      active: true,
      canCancelInvoices: true,
      canDeleteData: true,
    },
  });

  if (!user || !user.active) {
    console.error(`Auth: User ${userId} not found or inactive in DB`);
    throw new Error('Unauthorized 1');
  }

  return buildAuthUser(user);
};

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = getRequestToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized 2' });
  }

  try {
    req.user = await resolveUserFromToken(token);
    next();
  } catch (error: any) {
    console.error(`Auth: Token validation failed: ${error.message}`);
    return res.status(401).json({ error: 'Unauthorized 3' });
  }
};

export const authenticateUploadAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const allowUploadQueryToken = String(process.env.ALLOW_UPLOAD_QUERY_TOKEN || 'false').toLowerCase() === 'true';
  const queryToken =
    allowUploadQueryToken && typeof req.query.token === 'string'
      ? req.query.token
      : null;
  const token = getRequestToken(req) || queryToken;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized 4' });
  }

  try {
    req.user = await resolveUserFromToken(token);
    next();
  } catch (error: any) {
    console.error(`Auth (Upload): Token validation failed: ${error.message}`);
    return res.status(401).json({ error: 'Unauthorized 5' });
  }
};

export const authorize = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.some(role => role.toUpperCase() === req.user?.role.toUpperCase())) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
};
