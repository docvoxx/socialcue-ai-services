import { Request, Response, NextFunction } from 'express';
import { logger } from '@socialcue-ai-services/shared';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  logger.error('Error in sentiment service:', err, {
    service: 'sentiment-service',
    statusCode,
    path: req.path,
    method: req.method,
    requestId: req.headers['x-request-id'],
  });

  res.status(statusCode).json({
    error: {
      code: err.name || 'INTERNAL_ERROR',
      message,
      retryable: statusCode >= 500,
      trace_id: req.headers['x-request-id'] as string,
    },
    timestamp: new Date().toISOString(),
    request_id: req.headers['x-request-id'] as string,
  });
};

export const createError = (message: string, statusCode: number = 500): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
};