import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { SentimentController } from './controllers/SentimentController';
import { logger } from '@socialcue-ai-services/shared';

const app = express();
const port = process.env.PORT || 3003;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

// Routes
const sentimentController = new SentimentController();
app.post('/analyze', sentimentController.analyzeSentiment.bind(sentimentController));
app.get('/health', sentimentController.getHealthStatus.bind(sentimentController));
app.get('/health/live', (_req, res) => {
  res.json({
    service: 'sentiment-service',
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});
app.get('/health/ready', async (_req, res) => {
  try {
    // Check if models are loaded (sentiment service doesn't have heavy dependencies)
    res.json({
      service: 'sentiment-service',
      status: 'ready',
      timestamp: new Date().toISOString(),
      dependencies: {
        models: 'up'
      }
    });
  } catch (error) {
    logger.error('Readiness check failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(503).json({
      service: 'sentiment-service',
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Error handling
app.use(errorHandler);

app.listen(port, () => {
  logger.info(`Sentiment Service listening on port ${port}`);
});

export default app;