import { createServiceLogger } from '@socialcue-ai-services/shared';
import { GenerationRequest, GenerationResponse } from '@socialcue-ai-services/shared';
import { EventEmitter } from 'events';

export interface QueuedRequest {
  id: string;
  request: GenerationRequest;
  priority: number;
  timestamp: number;
  timeout: number;
  resolve: (response: GenerationResponse) => void;
  reject: (error: Error) => void;
}

export interface QueueConfig {
  maxQueueSize: number;
  maxConcurrentRequests: number;
  defaultTimeout: number;
  priorityLevels: {
    high: number;
    normal: number;
    low: number;
  };
}

export class RequestQueueManager extends EventEmitter {
  private logger = createServiceLogger('request-queue-manager');
  private queue: QueuedRequest[] = [];
  private activeRequests: Map<string, QueuedRequest> = new Map();
  private config: QueueConfig;
  private isProcessing = false;

  constructor(config?: Partial<QueueConfig>) {
    super();
    
    this.config = {
      maxQueueSize: 100,
      maxConcurrentRequests: 5,
      defaultTimeout: 30000, // 30 seconds
      priorityLevels: {
        high: 3,
        normal: 2,
        low: 1
      },
      ...config
    };

    this.startProcessing();
  }

  async enqueue(
    requestId: string,
    request: GenerationRequest,
    priority: 'high' | 'normal' | 'low' = 'normal',
    timeout?: number
  ): Promise<GenerationResponse> {
    return new Promise((resolve, reject) => {
      // Check queue size limit
      if (this.queue.length >= this.config.maxQueueSize) {
        reject(new Error('Request queue is full'));
        return;
      }

      const queuedRequest: QueuedRequest = {
        id: requestId,
        request,
        priority: this.config.priorityLevels[priority],
        timestamp: Date.now(),
        timeout: timeout || this.config.defaultTimeout,
        resolve,
        reject
      };

      // Insert request in priority order
      this.insertByPriority(queuedRequest);

      this.logger.debug('Request enqueued', {
        requestId,
        priority,
        queueSize: this.queue.length,
        activeRequests: this.activeRequests.size
      });

      this.emit('requestEnqueued', {
        requestId,
        queueSize: this.queue.length,
        priority
      });

      // Set timeout for the request
      setTimeout(() => {
        this.timeoutRequest(requestId);
      }, queuedRequest.timeout);
    });
  }

  private insertByPriority(request: QueuedRequest): void {
    let insertIndex = this.queue.length;
    
    // Find insertion point based on priority (higher priority first)
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].priority < request.priority) {
        insertIndex = i;
        break;
      }
    }
    
    this.queue.splice(insertIndex, 0, request);
  }

  private startProcessing(): void {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    const processNext = async () => {
      while (this.queue.length > 0 && this.activeRequests.size < this.config.maxConcurrentRequests) {
        const request = this.queue.shift();
        if (!request) break;

        // Check if request has timed out
        if (Date.now() - request.timestamp > request.timeout) {
          request.reject(new Error('Request timeout in queue'));
          continue;
        }

        this.activeRequests.set(request.id, request);
        
        this.logger.debug('Processing request', {
          requestId: request.id,
          queueSize: this.queue.length,
          activeRequests: this.activeRequests.size,
          waitTime: Date.now() - request.timestamp
        });

        this.emit('requestStarted', {
          requestId: request.id,
          waitTime: Date.now() - request.timestamp
        });

        // Process the request asynchronously
        this.processRequest(request).catch(error => {
          this.logger.error('Request processing failed', error, { requestId: request.id });
        });
      }

      // Continue processing
      setTimeout(processNext, 10); // Check every 10ms
    };

    processNext();
  }

  private async processRequest(queuedRequest: QueuedRequest): Promise<void> {
    try {
      // Emit event for external processing
      this.emit('processRequest', queuedRequest);
      
    } catch (error) {
      this.completeRequest(queuedRequest.id, undefined, error as Error);
    }
  }

  completeRequest(requestId: string, response?: GenerationResponse, error?: Error): void {
    const request = this.activeRequests.get(requestId);
    if (!request) {
      this.logger.warn('Attempted to complete unknown request', { requestId });
      return;
    }

    this.activeRequests.delete(requestId);

    const processingTime = Date.now() - request.timestamp;

    if (error) {
      request.reject(error);
      this.logger.debug('Request completed with error', {
        requestId,
        processingTime,
        error: error.message
      });
    } else if (response) {
      request.resolve(response);
      this.logger.debug('Request completed successfully', {
        requestId,
        processingTime,
        candidatesCount: response.candidates.length
      });
    } else {
      request.reject(new Error('No response or error provided'));
    }

    this.emit('requestCompleted', {
      requestId,
      processingTime,
      success: !error,
      queueSize: this.queue.length,
      activeRequests: this.activeRequests.size
    });
  }

  private timeoutRequest(requestId: string): void {
    // Check if request is still in queue
    const queueIndex = this.queue.findIndex(req => req.id === requestId);
    if (queueIndex !== -1) {
      const request = this.queue.splice(queueIndex, 1)[0];
      request.reject(new Error('Request timeout in queue'));
      
      this.logger.warn('Request timed out in queue', {
        requestId,
        waitTime: Date.now() - request.timestamp
      });
      
      this.emit('requestTimeout', { requestId, location: 'queue' });
      return;
    }

    // Check if request is being processed
    const activeRequest = this.activeRequests.get(requestId);
    if (activeRequest) {
      this.activeRequests.delete(requestId);
      activeRequest.reject(new Error('Request timeout during processing'));
      
      this.logger.warn('Request timed out during processing', {
        requestId,
        processingTime: Date.now() - activeRequest.timestamp
      });
      
      this.emit('requestTimeout', { requestId, location: 'processing' });
    }
  }

  getQueueStats(): {
    queueSize: number;
    activeRequests: number;
    maxQueueSize: number;
    maxConcurrentRequests: number;
    averageWaitTime: number;
    oldestRequestAge: number;
  } {
    const now = Date.now();
    const waitTimes = this.queue.map(req => now - req.timestamp);
    const averageWaitTime = waitTimes.length > 0 ? 
      waitTimes.reduce((sum, time) => sum + time, 0) / waitTimes.length : 0;
    
    const oldestRequestAge = this.queue.length > 0 ? 
      Math.max(...waitTimes) : 0;

    return {
      queueSize: this.queue.length,
      activeRequests: this.activeRequests.size,
      maxQueueSize: this.config.maxQueueSize,
      maxConcurrentRequests: this.config.maxConcurrentRequests,
      averageWaitTime,
      oldestRequestAge
    };
  }

  updateConfig(newConfig: Partial<QueueConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Queue configuration updated', { config: this.config });
  }

  getConfig(): QueueConfig {
    return { ...this.config };
  }

  // Priority management
  promoteRequest(requestId: string): boolean {
    const index = this.queue.findIndex(req => req.id === requestId);
    if (index === -1) return false;

    const request = this.queue[index];
    request.priority = Math.min(request.priority + 1, this.config.priorityLevels.high);
    
    // Re-sort the queue
    this.queue.splice(index, 1);
    this.insertByPriority(request);
    
    this.logger.debug('Request priority promoted', {
      requestId,
      newPriority: request.priority,
      newPosition: this.queue.findIndex(req => req.id === requestId)
    });

    return true;
  }

  // Queue management
  clearQueue(): number {
    const clearedCount = this.queue.length;
    
    // Reject all queued requests
    this.queue.forEach(request => {
      request.reject(new Error('Queue cleared'));
    });
    
    this.queue = [];
    
    this.logger.info('Queue cleared', { clearedCount });
    this.emit('queueCleared', { clearedCount });
    
    return clearedCount;
  }

  // Health check
  isHealthy(): boolean {
    const stats = this.getQueueStats();
    
    // Consider unhealthy if queue is full or requests are waiting too long
    const queueFull = stats.queueSize >= stats.maxQueueSize * 0.9;
    const longWaitTimes = stats.averageWaitTime > 10000; // 10 seconds
    const oldRequests = stats.oldestRequestAge > 30000; // 30 seconds
    
    return !queueFull && !longWaitTimes && !oldRequests;
  }

  shutdown(): void {
    this.logger.info('Shutting down request queue manager');
    
    // Clear all pending requests
    this.clearQueue();
    
    // Reject all active requests
    this.activeRequests.forEach(request => {
      request.reject(new Error('Service shutting down'));
    });
    this.activeRequests.clear();
    
    this.isProcessing = false;
    this.removeAllListeners();
  }
}