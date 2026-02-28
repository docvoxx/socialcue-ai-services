import express, { Application } from 'express';
import cors from 'cors';
import { config, validateConfig } from './config';
import { authenticateAPIKey } from './middleware/auth';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import healthRoutes from './routes/health';
import llmRoutes from './routes/llm';
import ragRoutes from './routes/rag';
import sentimentRoutes from './routes/sentiment';

// Validate configuration on startup
validateConfig();

const app: Application = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestLogger);

// Health endpoints (no authentication required)
app.use('/health', healthRoutes);

// API routes (require authentication)
app.use('/v1/llm', authenticateAPIKey, llmRoutes);
app.use('/v1/rag', authenticateAPIKey, ragRoutes);
app.use('/v1/sentiment', authenticateAPIKey, sentimentRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(config.port, config.host, () => {
  console.log(`AI Gateway listening on ${config.host}:${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Service: ${config.serviceName} v${config.serviceVersion}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

export default app;
