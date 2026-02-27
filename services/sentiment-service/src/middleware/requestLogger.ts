import { Request, Response, NextFunction } from 'express';
import { logger } from '@socialcue-ai-services/shared';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Generate request ID if not present
  if (!req.headers['x-request-id']) {
    req.headers['x-request-id'] = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  const originalSend = res.send;
  res.send = function(body) {
    const duration = Date.now() - startTime;
    
    logger.info('Request completed', {
      service: 'sentiment-service',
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      requestId: req.headers['x-request-id'],
      userAgent: req.headers['user-agent'],
    });
    
    return originalSend.call(this, body);
  };

  next();
};