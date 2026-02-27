import { Request, Response, NextFunction } from 'express';
import { createServiceLogger } from '@socialcue-ai-services/shared';

const logger = createServiceLogger('rag-service:request');

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] as string || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Add request ID to headers for tracing
  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);

  // Log request start
  logger.info('Request started', {
    requestId,
    method: req.method,
    path: req.path,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any): Response {
    const duration = Date.now() - start;
    
    logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
    });

    return originalEnd.call(this, chunk, encoding) as Response;
  };

  next();
}