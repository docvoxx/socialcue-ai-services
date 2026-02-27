import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { config } from '../config';

const router = Router();

// Forward RAG retrieval requests to internal RAG service
router.post('/retrieve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = req.headers['x-request-id'] as string;
    
    const response = await axios.post(
      `${config.services.rag}/retrieve`,
      req.body,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(requestId && { 'X-Request-Id': requestId }),
        },
        timeout: config.timeouts.rag,
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
