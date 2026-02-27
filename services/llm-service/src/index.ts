import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServiceLogger } from '@socialcue-ai-services/shared';
import { LLMController } from './controllers/LLMController';
import { ModelManager } from './services/ModelManager';
import { PromptManager } from './services/PromptManager';
import { PerformanceMonitor } from './services/PerformanceMonitor';
import { CacheManager } from './services/CacheManager';
import { RequestQueueManager } from './services/RequestQueueManager';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

const logger = createServiceLogger('llm-service');
const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

// Initialize services
const modelManager = new ModelManager();
const promptManager = new PromptManager();
const performanceMonitor = new PerformanceMonitor();
const cacheManager = new CacheManager();
const requestQueueManager = new RequestQueueManager();

// Initialize controller
const llmController = new LLMController(
  modelManager,
  promptManager,
  performanceMonitor,
  cacheManager,
  requestQueueManager
);

// Routes
app.post('/generate', llmController.generateCandidates.bind(llmController));
app.get('/health', llmController.healthCheck.bind(llmController));
app.get('/health/live', (_req, res) => {
  res.json({
    service: 'llm-service',
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});
app.get('/health/ready', async (_req, res) => {
  try {
    const modelLoaded = modelManager.getCurrentModel() !== null;
    const cacheReady = await cacheManager.isReady();
    
    if (modelLoaded && cacheReady) {
      res.json({
        service: 'llm-service',
        status: 'ready',
        timestamp: new Date().toISOString(),
        dependencies: {
          model: 'up',
          cache: 'up'
        }
      });
    } else {
      res.status(503).json({
        service: 'llm-service',
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        dependencies: {
          model: modelLoaded ? 'up' : 'down',
          cache: cacheReady ? 'up' : 'down'
        }
      });
    }
  } catch (error) {
    logger.error('Readiness check failed', error as Error);
    res.status(503).json({
      service: 'llm-service',
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: (error as Error).message
    });
  }
});
app.get('/models', llmController.getModels.bind(llmController));
app.post('/models/reload', llmController.reloadModel.bind(llmController));
app.get('/metrics', llmController.getMetrics.bind(llmController));
app.get('/queue/status', (_req, res) => {
  res.json({
    queue: requestQueueManager.getQueueStats(),
    healthy: requestQueueManager.isHealthy(),
    timestamp: new Date().toISOString()
  });
});

// Error handling
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    await modelManager.initialize();
    await cacheManager.initialize();
    
    app.listen(port, () => {
      logger.info(`LLM Service started on port ${port}`);
    });
  } catch (error) {
    logger.error('Failed to start LLM Service', error as Error);
    process.exit(1);
  }
}

startServer();