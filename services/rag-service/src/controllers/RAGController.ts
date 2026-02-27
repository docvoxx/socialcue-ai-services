import { Request, Response } from 'express';
import { z } from 'zod';
import { createServiceLogger, UserStyleSchema } from '@socialcue-ai-services/shared';
import { KnowledgeBaseManager, MemoryUpdate } from '../services/KnowledgeBaseManager';

const logger = createServiceLogger('rag-service:controller');

// Request/Response schemas
const RetrieveRequestSchema = z.object({
  query: z.string().min(1),
  user_id: z.string().uuid(),
  kb_types: z.array(z.enum(['template', 'style', 'memory'])).min(1),
  max_chunks: z.number().int().min(1).max(50).default(10),
  max_tokens: z.number().int().min(100).max(5000).default(2000),
});

const UpdateMemoryRequestSchema = z.object({
  user_id: z.string().uuid(),
  content: z.string().min(1),
  context: z.record(z.string(), z.any()).default({}),
  idempotency_key: z.string().optional(),
});

const UpdateStyleRequestSchema = z.object({
  user_id: z.string().uuid(),
  style: UserStyleSchema,
});

export class RAGController {
  constructor(private kbManager: KnowledgeBaseManager) {}

  async retrieve(req: Request, res: Response): Promise<void> {
    try {
      const requestId = req.headers['x-request-id'] as string;
      
      // Validate request
      const validatedData = RetrieveRequestSchema.parse(req.body);
      
      logger.info('Processing retrieve request', {
        requestId,
        userId: validatedData.user_id,
        kbTypes: validatedData.kb_types,
        queryLength: validatedData.query.length,
      });

      // Perform retrieval
      const result = await this.kbManager.retrieve(
        validatedData.query,
        validatedData.user_id,
        validatedData.kb_types,
        validatedData.max_chunks,
        validatedData.max_tokens
      );

      // Add source_ids for debugging
      const response = {
        ...result,
        source_ids: result.chunks.map(chunk => chunk.source_id),
      };

      logger.info('Retrieve request completed', {
        requestId,
        userId: validatedData.user_id,
        chunksReturned: result.chunks.length,
        totalTokens: result.total_tokens,
        retrievalTime: result.retrieval_time_ms,
      });

      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Invalid retrieve request', {
          requestId: req.headers['x-request-id'],
          errors: error.errors,
        });
        
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
            retryable: false,
            trace_id: req.headers['x-request-id'],
          },
          timestamp: new Date().toISOString(),
          request_id: req.headers['x-request-id'],
        });
        return;
      }

      logger.error('Retrieve request failed', {
        requestId: req.headers['x-request-id'],
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        error: {
          code: 'RETRIEVAL_ERROR',
          message: 'Failed to retrieve context',
          retryable: true,
          trace_id: req.headers['x-request-id'],
        },
        timestamp: new Date().toISOString(),
        request_id: req.headers['x-request-id'],
      });
    }
  }

  async updateMemory(req: Request, res: Response): Promise<void> {
    try {
      const requestId = req.headers['x-request-id'] as string;
      
      // Validate request
      const validatedData = UpdateMemoryRequestSchema.parse(req.body);
      
      logger.info('Processing memory update request', {
        requestId,
        userId: validatedData.user_id,
        contentLength: validatedData.content.length,
        hasIdempotencyKey: !!validatedData.idempotency_key,
      });

      // Update memory
      const memoryUpdate: MemoryUpdate = {
        user_id: validatedData.user_id,
        content: validatedData.content,
        context: validatedData.context,
        idempotency_key: validatedData.idempotency_key,
      };

      await this.kbManager.updateMemory(memoryUpdate);

      logger.info('Memory update completed', {
        requestId,
        userId: validatedData.user_id,
      });

      res.json({
        success: true,
        message: 'Memory updated successfully',
        timestamp: new Date().toISOString(),
        request_id: requestId,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Invalid memory update request', {
          requestId: req.headers['x-request-id'],
          errors: error.errors,
        });
        
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
            retryable: false,
            trace_id: req.headers['x-request-id'],
          },
          timestamp: new Date().toISOString(),
          request_id: req.headers['x-request-id'],
        });
        return;
      }

      logger.error('Memory update failed', {
        requestId: req.headers['x-request-id'],
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        error: {
          code: 'MEMORY_UPDATE_ERROR',
          message: 'Failed to update memory',
          retryable: true,
          trace_id: req.headers['x-request-id'],
        },
        timestamp: new Date().toISOString(),
        request_id: req.headers['x-request-id'],
      });
    }
  }

  async updateStyle(req: Request, res: Response): Promise<void> {
    try {
      const requestId = req.headers['x-request-id'] as string;
      
      // Validate request
      const validatedData = UpdateStyleRequestSchema.parse(req.body);
      
      logger.info('Processing style update request', {
        requestId,
        userId: validatedData.user_id,
      });

      // Update style
      await this.kbManager.updateUserStyle(validatedData.user_id, validatedData.style);

      logger.info('Style update completed', {
        requestId,
        userId: validatedData.user_id,
      });

      res.json({
        success: true,
        message: 'Style updated successfully',
        timestamp: new Date().toISOString(),
        request_id: requestId,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Invalid style update request', {
          requestId: req.headers['x-request-id'],
          errors: error.errors,
        });
        
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
            retryable: false,
            trace_id: req.headers['x-request-id'],
          },
          timestamp: new Date().toISOString(),
          request_id: req.headers['x-request-id'],
        });
        return;
      }

      logger.error('Style update failed', {
        requestId: req.headers['x-request-id'],
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        error: {
          code: 'STYLE_UPDATE_ERROR',
          message: 'Failed to update style',
          retryable: true,
          trace_id: req.headers['x-request-id'],
        },
        timestamp: new Date().toISOString(),
        request_id: req.headers['x-request-id'],
      });
    }
  }

  async getUserStyle(req: Request, res: Response): Promise<void> {
    try {
      const requestId = req.headers['x-request-id'] as string;
      const userId = req.params.userId;

      // Validate UUID
      if (!userId || !userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid user ID format',
            retryable: false,
            trace_id: requestId,
          },
          timestamp: new Date().toISOString(),
          request_id: requestId,
        });
        return;
      }

      logger.info('Processing get user style request', {
        requestId,
        userId,
      });

      // Get user style
      const style = await this.kbManager.getUserStyle(userId);

      if (!style) {
        res.status(404).json({
          error: {
            code: 'STYLE_NOT_FOUND',
            message: 'User style not found',
            retryable: false,
            trace_id: requestId,
          },
          timestamp: new Date().toISOString(),
          request_id: requestId,
        });
        return;
      }

      logger.info('Get user style completed', {
        requestId,
        userId,
      });

      res.json({
        style,
        timestamp: new Date().toISOString(),
        request_id: requestId,
      });
    } catch (error) {
      logger.error('Get user style failed', {
        requestId: req.headers['x-request-id'],
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        error: {
          code: 'STYLE_RETRIEVAL_ERROR',
          message: 'Failed to retrieve user style',
          retryable: true,
          trace_id: req.headers['x-request-id'],
        },
        timestamp: new Date().toISOString(),
        request_id: req.headers['x-request-id'],
      });
    }
  }

  async clearUserMemory(req: Request, res: Response): Promise<void> {
    try {
      const requestId = req.headers['x-request-id'] as string;
      const userId = req.params.userId;

      // Validate UUID
      if (!userId || !userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid user ID format',
            retryable: false,
            trace_id: requestId,
          },
          timestamp: new Date().toISOString(),
          request_id: requestId,
        });
        return;
      }

      logger.info('Processing clear user memory request', {
        requestId,
        userId,
      });

      // Clear user memory
      await this.kbManager.clearUserMemory(userId);

      logger.info('Clear user memory completed', {
        requestId,
        userId,
      });

      res.json({
        success: true,
        message: 'User memory cleared successfully',
        timestamp: new Date().toISOString(),
        request_id: requestId,
      });
    } catch (error) {
      logger.error('Clear user memory failed', {
        requestId: req.headers['x-request-id'],
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        error: {
          code: 'MEMORY_CLEAR_ERROR',
          message: 'Failed to clear user memory',
          retryable: true,
          trace_id: req.headers['x-request-id'],
        },
        timestamp: new Date().toISOString(),
        request_id: req.headers['x-request-id'],
      });
    }
  }
}