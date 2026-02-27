import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // API Keys
  apiKeys: (process.env.API_KEYS || '').split(',').filter(k => k.length > 0),
  
  // Internal service URLs
  services: {
    llm: process.env.LLM_SERVICE_URL || 'http://llm-service:3001',
    rag: process.env.RAG_SERVICE_URL || 'http://rag-service:3002',
    sentiment: process.env.SENTIMENT_SERVICE_URL || 'http://sentiment-service:3003',
  },
  
  // Service metadata
  serviceName: process.env.SERVICE_NAME || 'ai-gateway',
  serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
  
  // Timeouts
  timeouts: {
    llm: parseInt(process.env.LLM_TIMEOUT || '60000', 10),
    rag: parseInt(process.env.RAG_TIMEOUT || '5000', 10),
    sentiment: parseInt(process.env.SENTIMENT_TIMEOUT || '3000', 10),
  },
};

// Validate required configuration
export function validateConfig(): void {
  if (config.apiKeys.length === 0) {
    throw new Error('API_KEYS environment variable is required');
  }
  
  console.log('Configuration loaded:', {
    port: config.port,
    nodeEnv: config.nodeEnv,
    serviceName: config.serviceName,
    serviceVersion: config.serviceVersion,
    apiKeysCount: config.apiKeys.length,
    services: config.services,
  });
}
