import { Request, Response, NextFunction } from 'express';
import { createServiceLogger } from '@socialcue-ai-services/shared';

const logger = createServiceLogger('rag-service:error');

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = req.headers['x-request-id'] as string || 'unknown';
  
  logger.error('Request failed', {
    requestId,
    method: req.method,
    path: req.path,
    error: error.message,
    stack: error.stack,
  });

  // Don't expose internal errors in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: isDevelopment ? error.message : 'Internal server error',
      retryable: true,
      trace_id: requestId,
    },
    timestamp: new Date().toISOString(),
    request_id: requestId,
  });
}