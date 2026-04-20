import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../db/prisma.js';
import { securityConfig } from '../config/security.js';
import {
  consumeBackupCode,
  generateBackupCodes,
  generateOtpAuthUri,
  generateTwoFactorSecret,
  hashBackupCode,
  verifyTotpToken,
} from '../utils/two-factor.js';

const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  return secret;
})();

type PublicUser = {
  id: number;
  username: string;
  phone: string | null;
  role: string;
  warehouseId: number | null;
  active: boolean;
  canCancelInvoices: boolean;
  canDeleteData: boolean;
  twoFactorEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  warehouse: { id: number; name: string; city: string | null } | null;
};

type LoginResult =
  | { requiresTwoFactor: false; user: PublicUser; token: string }
  | {
      requiresTwoFactor: true;
      twoFactorToken: string;
      user: Pick<PublicUser, 'id' | 'username' | 'twoFactorEnabled'>;
    };

const toPublicUser = (user: any): PublicUser => ({
  id: user.id,
  username: user.username,
  phone: user.phone ?? null,
  role: user.role,
  warehouseId: user.warehouseId ?? null,
  active: user.active,
  canCancelInvoices: Boolean(user.canCancelInvoices),
  canDeleteData: Boolean(user.canDeleteData),
  twoFactorEnabled: Boolean(user.twoFactorEnabled),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  warehouse: user.warehouse
    ? { id: user.warehouse.id, name: user.warehouse.name, city: user.warehouse.city ?? null }
    : null,
});

const INVALID_CREDENTIALS_ERROR = 'Invalid credentials';
const BACKUP_CODE_PEPPER = process.env.TWO_FACTOR_BACKUP_PEPPER || JWT_SECRET;
const TWO_FACTOR_TOKEN_AUDIENCE = `${securityConfig.auth.tokenAudience}:2fa`;

const createHttpError = (message: string, status: number) =>
  Object.assign(new Error(message), { status });

const normalizeUsername = (username: string) => username.trim();

const validatePasswordStrength = (password: string) => {
  if (password.length < securityConfig.auth.minimumPasswordLength) {
    throw createHttpError(`Password must be at least ${securityConfig.auth.minimumPasswordLength} characters long`, 400);
  }

  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    throw createHttpError('Password must contain uppercase, lowercase letters and at least one number', 400);
  }
};

const ensureUniqueUsername = async (username: string, excludeUserId?: number) => {
  const existingUser = await prisma.user.findFirst({
    where: {
      id: excludeUserId ? { not: excludeUserId } : undefined,
      username: {
        equals: username,

      },
    },
  });

  if (existingUser) {
    throw createHttpError('A user with this username already exists', 409);
  }
};

const signAccessToken = (user: {
  id: number;
  username: string;
  role: string;
  warehouseId: number | null;
  canCancelInvoices: boolean;
  canDeleteData: boolean;
}) =>
  jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      warehouseId: user.warehouseId,
      canCancelInvoices: user.canCancelInvoices,
      canDeleteData: user.canDeleteData,
    },
    JWT_SECRET,
    {
      expiresIn: securityConfig.auth.tokenExpiresIn as SignOptions['expiresIn'],
      issuer: securityConfig.auth.tokenIssuer,
      audience: securityConfig.auth.tokenAudience,
    }
  );

const signScopedToken = (payload: Record<string, unknown>, expiresIn: string) =>
  jwt.sign(payload, JWT_SECRET, {
    expiresIn: expiresIn as SignOptions['expiresIn'],
    issuer: securityConfig.auth.tokenIssuer,
    audience: TWO_FACTOR_TOKEN_AUDIENCE,
  });

const verifyScopedToken = (token: string) =>
  jwt.verify(token, JWT_SECRET, {
    issuer: securityConfig.auth.tokenIssuer,
    audience: TWO_FACTOR_TOKEN_AUDIENCE,
  }) as jwt.JwtPayload & Record<string, unknown>;

const verifyTwoFactorInput = (options: {
  secret: string | null;
  token: string;
  backupCodeHashes: string[];
}) => {
  if (!options.secret) {
    return null;
  }

  if (verifyTotpToken(options.secret, options.token)) {
    return {
      usedBackupCode: false,
      remainingBackupCodeHashes: options.backupCodeHashes,
    };
  }

  const remainingBackupCodeHashes = consumeBackupCode(
    options.backupCodeHashes,
    options.token,
    BACKUP_CODE_PEPPER
  );

  if (!remainingBackupCodeHashes) {
    return null;
  }

  return {
    usedBackupCode: true,
    remainingBackupCodeHashes,
  };
};

export class AuthService {
  static async login(username: string, password: string): Promise<LoginResult> {
    const normalizedUsername = normalizeUsername(username);
    const user: any = await prisma.user.findFirst({
      where: {
        username: {
          equals: normalizedUsername,

        },
        active: true,
      },
      include: { warehouse: true },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw createHttpError(INVALID_CREDENTIALS_ERROR, 401);
    }

    if (user.twoFactorEnabled && user.twoFactorSecret) {
      return {
        requiresTwoFactor: true,
        twoFactorToken: signScopedToken(
          { type: 'two_factor_login', userId: user.id },
          securityConfig.auth.twoFactorChallengeExpiresIn
        ),
        user: {
          id: user.id,
          username: user.username,
          twoFactorEnabled: true,
        },
      };
    }

    return {
      requiresTwoFactor: false,
      user: toPublicUser(user),
      token: signAccessToken(user),
    };
  }

  static async register(data: {
    username: string;
    password: string;
    phone?: string;
    role?: string;
    warehouseId?: number;
    canCancelInvoices?: boolean;
    canDeleteData?: boolean;
  }) {
    const username = normalizeUsername(data.username);
    validatePasswordStrength(data.password);
    await ensureUniqueUsername(username);
    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: hashedPassword,
        phone: data.phone,
        role: data.role || 'SELLER',
        warehouseId: data.warehouseId,
        canCancelInvoices: data.canCancelInvoices || false,
        canDeleteData: data.canDeleteData || false,
      },
      include: { warehouse: true },
    });

    return toPublicUser(user);
  }

  static async changePassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) {
      throw createHttpError(INVALID_CREDENTIALS_ERROR, 401);
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isPasswordValid) {
      throw createHttpError(INVALID_CREDENTIALS_ERROR, 401);
    }

    validatePasswordStrength(newPassword);
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    return await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashedPassword },
    });
  }

  static async updateUser(id: number, data: any) {
    const updateData: any = { ...data };
    if (typeof data.username === 'string') {
      updateData.username = normalizeUsername(data.username);
      await ensureUniqueUsername(updateData.username, id);
    }
    if (data.password) {
      validatePasswordStrength(data.password);
      updateData.passwordHash = await bcrypt.hash(data.password, 10);
      delete updateData.password;
    }
    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      include: { warehouse: true },
    });

    return toPublicUser(user);
  }

  static async getAllUsers() {
    const users = await prisma.user.findMany({
      where: { active: true },
      include: { warehouse: true },
    });

    return users.map(toPublicUser);
  }

  static async deleteUser(id: number) {
    return await prisma.user.update({
      where: { id },
      data: { active: false },
    });
  }

  static async getCurrentUser(userId: number) {
    const user: any = await prisma.user.findUnique({
      where: { id: userId },
      include: { warehouse: true },
    });

    if (!user || !user.active) {
      throw createHttpError('User not found', 404);
    }

    return toPublicUser(user);
  }

  static async createTwoFactorSetup(userId: number) {
    return this.createTwoFactorSetupForUser(userId);
  }

  static async createTwoFactorSetupForUser(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, active: true },
    });

    if (!user || !user.active) {
      throw createHttpError('User not found', 404);
    }

    const { secret, formattedSecret } = generateTwoFactorSecret();
    const backupCodes = generateBackupCodes(securityConfig.auth.backupCodeCount);
    const backupCodeHashes = backupCodes.map((code) => hashBackupCode(code, BACKUP_CODE_PEPPER));
    const otpauthUrl = generateOtpAuthUri({
      secret,
      accountName: user.username,
      issuer: securityConfig.auth.twoFactorIssuer,
    });

    return {
      secret: formattedSecret,
      otpauthUrl,
      backupCodes,
      setupToken: signScopedToken(
        {
          type: 'two_factor_setup',
          userId,
          secret,
          backupCodeHashes,
        },
        securityConfig.auth.twoFactorSetupExpiresIn
      ),
    };
  }

  static async verifyTwoFactorSetup(userId: number, setupToken: string, code: string) {
    return this.verifyTwoFactorSetupForUser(userId, setupToken, code);
  }

  static async verifyTwoFactorSetupForUser(userId: number, setupToken: string, code: string) {
    const payload = verifyScopedToken(setupToken);
    if (payload.type !== 'two_factor_setup' || Number(payload.userId) !== Number(userId)) {
      throw createHttpError('Invalid 2FA setup session', 400);
    }

    const secret = String(payload.secret || '');
    const backupCodeHashes = Array.isArray(payload.backupCodeHashes)
      ? payload.backupCodeHashes.map((entry) => String(entry))
      : [];

    if (!verifyTotpToken(secret, code)) {
      throw createHttpError('Invalid two-factor code', 400);
    }

    const user: any = await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: secret,
        twoFactorBackupCodes: backupCodeHashes,
      } as any,
      include: { warehouse: true },
    });

    return { user: toPublicUser(user) };
  }

  static async completeTwoFactorLogin(twoFactorToken: string, code: string) {
    const payload = verifyScopedToken(twoFactorToken);
    if (payload.type !== 'two_factor_login') {
      throw createHttpError('Invalid 2FA session', 400);
    }

    const user: any = await prisma.user.findUnique({
      where: { id: Number(payload.userId) },
      include: { warehouse: true },
    });

    if (!user || !user.active || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw createHttpError(INVALID_CREDENTIALS_ERROR, 401);
    }

    const verification = verifyTwoFactorInput({
      secret: user.twoFactorSecret,
      token: code,
      backupCodeHashes: user.twoFactorBackupCodes,
    });

    if (!verification) {
      throw createHttpError('Invalid two-factor code', 400);
    }

    if (verification.usedBackupCode) {
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorBackupCodes: verification.remainingBackupCodeHashes } as any,
      });
    }

    return {
      user: toPublicUser(user),
      token: signAccessToken(user),
    };
  }

  static async disableTwoFactor(userId: number, currentPassword: string, code: string) {
    const user: any = await prisma.user.findUnique({
      where: { id: userId },
      include: { warehouse: true },
    });

    if (!user || !user.active) {
      throw createHttpError('User not found', 404);
    }

    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw createHttpError(INVALID_CREDENTIALS_ERROR, 401);
    }

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw createHttpError('Two-factor authentication is not enabled', 400);
    }

    const verification = verifyTwoFactorInput({
      secret: user.twoFactorSecret,
      token: code,
      backupCodeHashes: user.twoFactorBackupCodes,
    });

    if (!verification) {
      throw createHttpError('Invalid two-factor code', 400);
    }

    const updatedUser: any = await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
      } as any,
      include: { warehouse: true },
    });

    return { user: toPublicUser(updatedUser) };
  }

  static async adminDisableTwoFactor(userId: number) {
    const user: any = await prisma.user.findUnique({
      where: { id: userId },
      include: { warehouse: true },
    });

    if (!user || !user.active) {
      throw createHttpError('User not found', 404);
    }

    const updatedUser: any = await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
      } as any,
      include: { warehouse: true },
    });

    return { user: toPublicUser(updatedUser) };
  }
}
