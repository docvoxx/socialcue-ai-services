import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { config } from '../config';

const router = Router();

// Forward sentiment analysis requests to internal Sentiment service
router.post('/analyze', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = req.headers['x-request-id'] as string;
    
    const response = await axios.post(
      `${config.services.sentiment}/analyze`,
      req.body,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(requestId && { 'X-Request-Id': requestId }),
        },
        timeout: config.timeouts.sentiment,
      }
    );
    
    // Forward response with headers
    res.set('X-Trace-Id', response.data.trace_id || requestId);
    res.set('X-Service-Name', config.serviceName);
    res.set('X-Service-Version', config.serviceVersion);
    res.status(response.status).json(response.data);
  } catch (error) {
    next(error);
  }
});

export default router;
