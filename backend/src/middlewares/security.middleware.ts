import cors, { CorsOptions } from 'cors';
import type { NextFunction, Request, Response } from 'express';
import { securityConfig } from '../config/security.js';

const buildCorsOriginCheck = (): CorsOptions['origin'] => {
  const { origins } = securityConfig.cors;

  return (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (origins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origin not allowed by CORS'));
  };
};

export const corsMiddleware = cors({
  origin: process.env.NODE_ENV === 'development' ? true : buildCorsOriginCheck(),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400,
});

export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isHttps =
    req.secure ||
    String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  const cspReportOnly = String(process.env.CSP_REPORT_ONLY || 'true').toLowerCase() !== 'false';
  const cspReportUri = String(process.env.CSP_REPORT_URI || '').trim();
  const cspDirectives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "connect-src 'self' https: http: ws: wss:",
    "form-action 'self'",
  ];

  if (cspReportUri) {
    cspDirectives.push(`report-uri ${cspReportUri}`);
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  if (cspReportOnly) {
    res.setHeader('Content-Security-Policy-Report-Only', cspDirectives.join('; '));
  } else {
    res.setHeader('Content-Security-Policy', cspDirectives.join('; '));
  }

  if (isProduction && isHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
};
