import { Request, Response, NextFunction } from 'express';
import { createServiceLogger } from '@socialcue-ai-services/shared';

const logger = createServiceLogger('error-handler');

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  retryable?: boolean;
}

export function errorHandler(
  error: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.headers['x-request-id'] as string || 'unknown';
  
  // Log the error
  logger.error('Request error', error, {
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });

  // Determine status code
  const statusCode = error.statusCode || 500;
  
  // Determine error code
  let errorCode = error.code || 'INTERNAL_ERROR';
  
  // Map common errors
  if (error.name === 'ValidationError') {
    errorCode = 'VALIDATION_ERROR';
  } else if (error.name === 'ZodError') {
    errorCode = 'INVALID_REQUEST_FORMAT';
  } else if (error.message.includes('timeout')) {
    errorCode = 'REQUEST_TIMEOUT';
  } else if (error.message.includes('model')) {
    errorCode = 'MODEL_ERROR';
  }

  // Determine if retryable
  const retryable = error.retryable !== undefined ? error.retryable : 
    statusCode >= 500 || errorCode === 'REQUEST_TIMEOUT';

  // Send error response
  res.status(statusCode).json({
    error: {
      code: errorCode,
      message: statusCode === 500 ? 'Internal server error' : error.message,
      retryable,
      trace_id: requestId
    },
    timestamp: new Date().toISOString()
  });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFoundHandler(req: Request, res: Response): void {
  const requestId = req.headers['x-request-id'] as string || 'unknown';
  
  logger.warn('Route not found', {
    requestId,
    method: req.method,
    url: req.url,
    ip: req.ip
  });

  res.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${req.method} ${req.url} not found`,
      retryable: false,
      trace_id: requestId
    },
    timestamp: new Date().toISOString()
  });
}