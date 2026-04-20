import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';

type ValidationSchemas = {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
};

const toValidationMessage = (path: (string | number)[], message: string) => {
  const normalizedPath = path.length > 0 ? path.join('.') : 'request';
  return `${normalizedPath}: ${message}`;
};

export const validateRequest = (schemas: ValidationSchemas) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }

      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }

      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.issues.map((issue) => toValidationMessage(issue.path, issue.message)),
        });
      }

      return next(error);
    }
  };
};

