import { Request, Response } from 'express';
import { createServiceLogger } from '@socialcue-ai-services/shared';
import { GenerationRequest, GenerationResponse } from '@socialcue-ai-services/shared';
import { ModelManager } from '../services/ModelManager';
import { PromptManager } from '../services/PromptManager';
import { PerformanceMonitor } from '../services/PerformanceMonitor';
import { CacheManager } from '../services/CacheManager';
import { ResponseGenerator } from '../services/ResponseGenerator';
import { RequestQueueManager } from '../services/RequestQueueManager';
import { z } from 'zod';

const GenerationRequestSchema = z.object({
  context: z.string(),
  rag_context: z.object({
    chunks: z.array(z.object({
      content: z.string(),
      source_id: z.object({
        kb: z.enum(['template', 'style', 'memory']),
        id: z.string(),
        score: z.number(),
      }),
      score: z.number(),
      kb_type: z.string(),
    })),
    total_tokens: z.number(),
    retrieval_time_ms: z.number(),
  }),
  user_style: z.object({
    vocabulary_level: z.enum(['formal', 'casual', 'mixed']),
    emoji_usage: z.enum(['none', 'minimal', 'frequent']),
    message_length: z.enum(['short', 'medium', 'long']),
    addressing_style: z.enum(['formal', 'informal']),
    preferred_tones: z.array(z.string()),
  }),
  constraints: z.array(z.string()),
  model_version: z.string().optional(),
  scenario: z.string().optional(),
  goal: z.string().optional(),
  tone: z.string().optional(),
});

export class LLMController {
  private logger = createServiceLogger('llm-controller');
  private responseGenerator: ResponseGenerator;

  constructor(
    private modelManager: ModelManager,
    private promptManager: PromptManager,
    private performanceMonitor: PerformanceMonitor,
    private cacheManager: CacheManager,
    private requestQueueManager: RequestQueueManager
  ) {
    this.responseGenerator = new ResponseGenerator(modelManager, promptManager);
    this.setupQueueEventHandlers();
  }

  private setupQueueEventHandlers(): void {
    this.requestQueueManager.on('processRequest', async (queuedRequest) => {
      try {
        const response = await this.generateResponse(queuedRequest.request, queuedRequest.id);
        this.requestQueueManager.completeRequest(queuedRequest.id, response);
      } catch (error) {
        this.requestQueueManager.completeRequest(queuedRequest.id, undefined, error as Error);
      }
    });
  }

  async generateCandidates(req: Request, res: Response): Promise<void> {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const requestMetrics = this.performanceMonitor.startRequest(requestId);

    try {
      // Validate request
      const validatedRequest = GenerationRequestSchema.parse(req.body);
      
      this.logger.info('Generation request received', {
        requestId,
        scenario: validatedRequest.scenario,
        goal: validatedRequest.goal,
        tone: validatedRequest.tone,
        contextLength: validatedRequest.context.length,
        ragChunks: validatedRequest.rag_context.chunks.length
      });

      // Check for degradation mode or high load
      const shouldDegrade = this.performanceMonitor.shouldTriggerDegradation();
      const queueStats = this.requestQueueManager.getQueueStats();
      const shouldQueue = queueStats.queueSize > 0 || queueStats.activeRequests >= queueStats.maxConcurrentRequests;
      
      if (shouldDegrade) {
        this.logger.warn('Degradation mode triggered', {
          requestId,
          queueLength: this.performanceMonitor.getMetrics().queueLength,
          p95Latency: this.performanceMonitor.getMetrics().p95Latency
        });

        // Try to serve from cache
        const cachedResponse = await this.tryServeFromCache(validatedRequest);
        if (cachedResponse) {
          this.performanceMonitor.endRequest(requestMetrics, 0, 'cached');
          res.json(cachedResponse);
          return;
        }
      }

      let response: GenerationResponse;

      if (shouldQueue) {
        // Use queue for load management
        this.logger.info('Queueing request due to high load', {
          requestId,
          queueSize: queueStats.queueSize,
          activeRequests: queueStats.activeRequests
        });

        response = await this.requestQueueManager.enqueue(
          requestId,
          validatedRequest,
          'normal',
          30000 // 30 second timeout
        );
      } else {
        // Process immediately
        response = await this.generateResponse(validatedRequest, requestId);
      }
      
      // Cache the response for future degradation scenarios
      await this.cacheResponse(validatedRequest, response);

      // Record metrics
      const tokenCount = this.estimateTokenCount(response);
      this.performanceMonitor.endRequest(
        requestMetrics, 
        tokenCount, 
        response.model_version
      );

      res.json(response);

    } catch (error) {
      this.logger.error('Generation request failed', error as Error, { requestId });
      
      this.performanceMonitor.endRequest(
        requestMetrics, 
        0, 
        undefined, 
        (error as Error).message
      );

      res.status(500).json({
        error: {
          code: 'GENERATION_FAILED',
          message: 'Failed to generate response candidates',
          retryable: true,
          trace_id: requestId
        }
      });
    }
  }

  private async tryServeFromCache(request: GenerationRequest): Promise<GenerationResponse | null> {
    try {
      // Extract last message for cache key
      const lastMessage = this.extractLastMessage(request.context);
      
      const cacheKey = this.cacheManager.generateCacheKey(
        request.scenario,
        request.goal,
        request.tone,
        lastMessage,
        request.user_style
      );

      const cached = await this.cacheManager.get(cacheKey);
      
      if (cached) {
        this.logger.info('Serving from cache (degradation mode)', {
          cacheKey,
          hitCount: cached.hitCount,
          age: Date.now() - cached.timestamp
        });
        
        return cached.response;
      }

      return null;
    } catch (error) {
      this.logger.error('Cache retrieval failed', error as Error);
      return null;
    }
  }

  private async generateResponse(request: GenerationRequest, requestId: string): Promise<GenerationResponse> {
    const startTime = Date.now();
    
    // Get current model
    const modelName = request.model_version || this.modelManager.getCurrentModel();
    if (!modelName) {
      throw new Error('No model available for generation');
    }

    try {
      // Generate candidates using ResponseGenerator
      const candidates = await this.responseGenerator.generateCandidates(request);

      // Update model performance metrics
      const generationTime = Date.now() - startTime;
      const tokenCount = this.estimateTokenCount({ candidates } as GenerationResponse);
      const tokensPerSecond = tokenCount / (generationTime / 1000);
      
      this.modelManager.updateTokensPerSecond(modelName, tokensPerSecond);

      const generationResponse: GenerationResponse = {
        candidates,
        model_version: modelName,
        prompt_version: this.promptManager.getCurrentVersion(),
        generation_time_ms: generationTime
      };

      this.logger.info('Generation completed', {
        requestId,
        modelName,
        generationTime,
        tokenCount,
        tokensPerSecond: tokensPerSecond.toFixed(2),
        candidatesCount: candidates.length
      });

      return generationResponse;

    } catch (error) {
      this.logger.error('Response generation failed', error as Error, { requestId });
      throw error;
    }
  }

  private async cacheResponse(request: GenerationRequest, response: GenerationResponse): Promise<void> {
    try {
      const lastMessage = this.extractLastMessage(request.context);
      
      const cacheKey = this.cacheManager.generateCacheKey(
        request.scenario,
        request.goal,
        request.tone,
        lastMessage,
        request.user_style
      );

      await this.cacheManager.set(
        cacheKey,
        response,
        request.scenario,
        request.goal,
        request.tone,
        lastMessage ? this.cacheManager.generateCacheKey('', '', '', lastMessage) : undefined
      );

    } catch (error) {
      this.logger.error('Failed to cache response', error as Error);
    }
  }

  private extractLastMessage(context: string): string {
    // Extract the last user message from context
    const lines = context.split('\n').filter(line => line.trim());
    return lines[lines.length - 1] || '';
  }

  private estimateTokenCount(response: GenerationResponse): number {
    // Rough token estimation (1 token ≈ 4 characters for Vietnamese)
    const totalText = response.candidates.reduce((sum, candidate) => 
      sum + candidate.text.length + candidate.explanation.length, 0
    );
    return Math.ceil(totalText / 4);
  }

  async healthCheck(_req: Request, res: Response): Promise<void> {
    try {
      const currentModel = this.modelManager.getCurrentModel();
      const metrics = this.performanceMonitor.getMetrics();
      const cacheStats = await this.cacheManager.getCacheStats();

      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        model: {
          current: currentModel,
          loaded: this.modelManager.getLoadedModels(),
          available: this.modelManager.getAllModels()
        },
        performance: {
          queueLength: metrics.queueLength,
          averageLatency: metrics.averageLatency,
          errorRate: metrics.errorRate,
          tokensPerSecond: metrics.tokensPerSecond
        },
        queue: this.requestQueueManager.getQueueStats(),
        cache: {
          size: cacheStats.size,
          hitRate: cacheStats.hitRate
        },
        memory: {
          used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
          total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
        }
      });
    } catch (error) {
      this.logger.error('Health check failed', error as Error);
      res.status(500).json({
        status: 'unhealthy',
        error: (error as Error).message
      });
    }
  }

  async getModels(_req: Request, res: Response): Promise<void> {
    try {
      const models = this.modelManager.getAllModels().map(modelName => {
        const config = this.modelManager.getModelConfig(modelName);
        const metrics = this.modelManager.getModelMetrics(modelName);
        
        return {
          name: modelName,
          version: config?.version,
          loaded: this.modelManager.getLoadedModels().includes(modelName),
          current: this.modelManager.getCurrentModel() === modelName,
          config,
          metrics
        };
      });

      res.json({ models });
    } catch (error) {
      this.logger.error('Failed to get models', error as Error);
      res.status(500).json({
        error: {
          code: 'MODELS_FETCH_FAILED',
          message: 'Failed to retrieve model information'
        }
      });
    }
  }

  async reloadModel(req: Request, res: Response): Promise<void> {
    try {
      const { modelName } = req.body;
      
      if (!modelName) {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Model name is required'
          }
        });
        return;
      }

      this.logger.info('Model reload requested', { modelName });
      
      await this.modelManager.reloadModel(modelName);
      
      res.json({
        message: `Model ${modelName} reloaded successfully`,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Model reload failed', error as Error);
      res.status(500).json({
        error: {
          code: 'MODEL_RELOAD_FAILED',
          message: (error as Error).message
        }
      });
    }
  }

  async getMetrics(_req: Request, res: Response): Promise<void> {
    try {
      const detailedMetrics = this.performanceMonitor.getDetailedMetrics();
      const cacheStats = await this.cacheManager.getCacheStats();

      res.json({
        performance: detailedMetrics,
        cache: cacheStats,
        queue: this.requestQueueManager.getQueueStats(),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Failed to get metrics', error as Error);
      res.status(500).json({
        error: {
          code: 'METRICS_FETCH_FAILED',
          message: 'Failed to retrieve metrics'
        }
      });
    }
  }
}