import type { NextFunction, Request, Response } from 'express';
import { AppError, isAppError } from '../utils/errors';
import { logError } from '../utils/logger';

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  if (isAppError(err)) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
    });
  }

  logError('http.errorHandler', err, {
    method: req.method,
    path: req.originalUrl,
    userId: req.user?.id,
    tenantId: req.tenantId,
  });

  return res.status(500).json({
    success: false,
    error: 'Erro interno no servidor',
  });
}

export { AppError };
