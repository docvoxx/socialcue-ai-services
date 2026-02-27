import { Request, Response, NextFunction } from 'express';
import { createServiceLogger } from '@socialcue-ai-services/shared';
import { v4 as uuidv4 } from 'uuid';

const logger = createServiceLogger('request-logger');

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  
  // Generate request ID if not present
  if (!req.headers['x-request-id']) {
    req.headers['x-request-id'] = uuidv4();
  }
  
  const requestId = req.headers['x-request-id'] as string;

  // Log incoming request
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(body: any) {
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Log response
    logger.info('Request completed', {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      responseSize: JSON.stringify(body).length,
      success: res.statusCode < 400,
      timestamp: new Date().toISOString()
    });

    return originalJson.call(this, body);
  };

  // Handle response finish for non-JSON responses
  res.on('finish', () => {
    if (!res.headersSent) return;
    
    const endTime = Date.now();
    const duration = endTime - startTime;

    logger.info('Request finished', {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      success: res.statusCode < 400,
      timestamp: new Date().toISOString()
    });
  });

  next();
}