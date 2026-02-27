import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServiceLogger, initializeDatabase } from '@socialcue-ai-services/shared';
import { KnowledgeBaseManager } from './services/KnowledgeBaseManager';
import { RAGController } from './controllers/RAGController';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

const logger = createServiceLogger('rag-service');

async function startServer() {
  const app = express();
  const port = process.env.PORT || 3002;

  // Middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(requestLogger);

  // Initialize database
  const dbUrl = process.env.POSTGRES_URL || 'postgresql://skippy_user:skippy_password@localhost:5432/skippy_coach';
  const db = await initializeDatabase(dbUrl);

  // Initialize ChromaDB connection
  const chromaUrl = process.env.CHROMADB_URL || 'http://localhost:8000';
  
  // Initialize Knowledge Base Manager
  const kbManager = new KnowledgeBaseManager(db, chromaUrl);
  await kbManager.initialize();

  // Initialize controller
  const ragController = new RAGController(kbManager);

  // Health check endpoint
  app.get('/health', async (_req, res) => {
    try {
      const dbHealthy = await db.healthCheck();
      const chromaHealthy = await kbManager.healthCheck();
      
      if (dbHealthy && chromaHealthy) {
        res.json({ 
          service: 'rag-service',
          status: 'healthy', 
          version: process.env.SERVICE_VERSION || '1.0.0',
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          dependencies: {
            database: { status: 'up' },
            chromadb: { status: 'up' }
          }
        });
      } else {
        res.status(503).json({ 
          service: 'rag-service',
          status: 'unhealthy', 
          database: dbHealthy,
          chromadb: chromaHealthy,
          timestamp: new Date().toISOString() 
        });
      }
    } catch (error) {
      logger.error('Health check failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      res.status(503).json({ status: 'unhealthy', timestamp: new Date().toISOString() });
    }
  });

  app.get('/health/live', (_req, res) => {
    res.json({
      service: 'rag-service',
      status: 'alive',
      timestamp: new Date().toISOString()
    });
  });

  app.get('/health/ready', async (_req, res) => {
    try {
      const dbHealthy = await db.healthCheck();
      const chromaHealthy = await kbManager.healthCheck();
      
      if (dbHealthy && chromaHealthy) {
        res.json({
          service: 'rag-service',
          status: 'ready',
          timestamp: new Date().toISOString(),
          dependencies: {
            database: 'up',
            chromadb: 'up'
          }
        });
      } else {
        res.status(503).json({
          service: 'rag-service',
          status: 'not_ready',
          timestamp: new Date().toISOString(),
          dependencies: {
            database: dbHealthy ? 'up' : 'down',
            chromadb: chromaHealthy ? 'up' : 'down'
          }
        });
      }
    } catch (error) {
      logger.error('Readiness check failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      res.status(503).json({
        service: 'rag-service',
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // API routes
  app.post('/retrieve', ragController.retrieve.bind(ragController));
  app.post('/update-memory', ragController.updateMemory.bind(ragController));
  app.post('/update-style', ragController.updateStyle.bind(ragController));
  app.get('/user/:userId/style', ragController.getUserStyle.bind(ragController));
  app.delete('/user/:userId/memory', ragController.clearUserMemory.bind(ragController));

  // Error handling
  app.use(errorHandler);

  // Start server
  app.listen(port, () => {
    logger.info(`RAG Service started on port ${port}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await db.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    await db.close();
    process.exit(0);
  });
}

startServer().catch((error) => {
  logger.error('Failed to start RAG service', { error: error.message });
  process.exit(1);
});