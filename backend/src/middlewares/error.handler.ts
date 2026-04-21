import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err.message || 'Internal Server Error';

  // Log only serious errors or operational errors with stacks if in development
  if (!(err instanceof AppError) || statusCode === 500) {
    console.error(`[ERROR] ${req.method} ${req.path} >> ${err.stack || message}`);
  } else {
    console.warn(`[WARN] ${req.method} ${req.path} >> ${message}`);
  }

  res.status(statusCode).json({
    status: 'error',
    message,
    // Include stack trace only in dev environment if needed, otherwise omit
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};
