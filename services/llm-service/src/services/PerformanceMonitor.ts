import { createServiceLogger } from '@socialcue-ai-services/shared';

export interface PerformanceMetrics {
  requestCount: number;
  totalLatency: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  errorCount: number;
  errorRate: number;
  tokensPerSecond: number;
  queueLength: number;
  memoryUsage: number;
  lastUpdated: Date;
}

export interface RequestMetrics {
  requestId: string;
  startTime: number;
  endTime?: number;
  latency?: number;
  tokenCount?: number;
  success: boolean;
  error?: string;
  modelName?: string;
}

export class PerformanceMonitor {
  private logger = createServiceLogger('performance-monitor');
  private metrics: PerformanceMetrics;
  private requestHistory: RequestMetrics[] = [];
  private latencyHistory: number[] = [];
  private maxHistorySize = 1000;
  private metricsWindow = 5 * 60 * 1000; // 5 minutes
  private alertThresholds = {
    latencyP95: 2000, // 2 seconds
    errorRate: 0.01, // 1%
    queueLength: 50,
    memoryUsage: 3.5 * 1024 * 1024 * 1024 // 3.5GB
  };

  constructor() {
    this.metrics = this.initializeMetrics();
    this.startMetricsCollection();
  }

  private initializeMetrics(): PerformanceMetrics {
    return {
      requestCount: 0,
      totalLatency: 0,
      averageLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      errorCount: 0,
      errorRate: 0,
      tokensPerSecond: 0,
      queueLength: 0,
      memoryUsage: 0,
      lastUpdated: new Date()
    };
  }

  startRequest(requestId: string): RequestMetrics {
    const requestMetrics: RequestMetrics = {
      requestId,
      startTime: Date.now(),
      success: false
    };

    this.requestHistory.push(requestMetrics);
    this.updateQueueLength();

    return requestMetrics;
  }

  endRequest(requestMetrics: RequestMetrics, tokenCount?: number, modelName?: string, error?: string): void {
    requestMetrics.endTime = Date.now();
    requestMetrics.latency = requestMetrics.endTime - requestMetrics.startTime;
    requestMetrics.tokenCount = tokenCount;
    requestMetrics.modelName = modelName;
    requestMetrics.success = !error;
    requestMetrics.error = error;

    // Add to latency history
    this.latencyHistory.push(requestMetrics.latency);
    
    // Maintain history size
    if (this.latencyHistory.length > this.maxHistorySize) {
      this.latencyHistory.shift();
    }

    if (this.requestHistory.length > this.maxHistorySize) {
      this.requestHistory.shift();
    }

    this.updateMetrics();
    this.checkAlerts(requestMetrics);

    this.logger.debug('Request completed', {
      requestId: requestMetrics.requestId,
      latency: requestMetrics.latency,
      success: requestMetrics.success,
      tokenCount: requestMetrics.tokenCount,
      modelName: requestMetrics.modelName
    });
  }

  private updateMetrics(): void {
    const now = Date.now();
    const windowStart = now - this.metricsWindow;

    // Filter recent requests
    const recentRequests = this.requestHistory.filter(r => 
      r.startTime >= windowStart && r.endTime
    );

    const recentLatencies = this.latencyHistory.filter((_, index) => 
      index >= this.latencyHistory.length - recentRequests.length
    );

    // Update basic metrics
    this.metrics.requestCount = recentRequests.length;
    this.metrics.errorCount = recentRequests.filter(r => !r.success).length;
    this.metrics.errorRate = this.metrics.requestCount > 0 ? 
      this.metrics.errorCount / this.metrics.requestCount : 0;

    // Update latency metrics
    if (recentLatencies.length > 0) {
      this.metrics.totalLatency = recentLatencies.reduce((sum, lat) => sum + lat, 0);
      this.metrics.averageLatency = this.metrics.totalLatency / recentLatencies.length;
      
      const sortedLatencies = [...recentLatencies].sort((a, b) => a - b);
      this.metrics.p95Latency = this.calculatePercentile(sortedLatencies, 0.95);
      this.metrics.p99Latency = this.calculatePercentile(sortedLatencies, 0.99);
    }

    // Update tokens per second
    const recentRequestsWithTokens = recentRequests.filter(r => r.tokenCount && r.latency);
    if (recentRequestsWithTokens.length > 0) {
      const totalTokens = recentRequestsWithTokens.reduce((sum, r) => sum + (r.tokenCount || 0), 0);
      const totalTime = recentRequestsWithTokens.reduce((sum, r) => sum + (r.latency || 0), 0) / 1000; // Convert to seconds
      this.metrics.tokensPerSecond = totalTime > 0 ? totalTokens / totalTime : 0;
    }

    // Update memory usage
    this.metrics.memoryUsage = process.memoryUsage().heapUsed;
    this.metrics.lastUpdated = new Date();
  }

  private calculatePercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  private updateQueueLength(): void {
    const now = Date.now();
    const activeRequests = this.requestHistory.filter(r => !r.endTime && (now - r.startTime) < 30000); // 30 second timeout
    this.metrics.queueLength = activeRequests.length;
  }

  private checkAlerts(requestMetrics: RequestMetrics): void {
    // Check latency alert
    if (this.metrics.p95Latency > this.alertThresholds.latencyP95) {
      this.logger.warn('High latency detected', {
        p95Latency: this.metrics.p95Latency,
        threshold: this.alertThresholds.latencyP95,
        requestId: requestMetrics.requestId
      });
    }

    // Check error rate alert
    if (this.metrics.errorRate > this.alertThresholds.errorRate) {
      this.logger.warn('High error rate detected', {
        errorRate: this.metrics.errorRate,
        threshold: this.alertThresholds.errorRate,
        errorCount: this.metrics.errorCount,
        requestCount: this.metrics.requestCount
      });
    }

    // Check queue length alert
    if (this.metrics.queueLength > this.alertThresholds.queueLength) {
      this.logger.warn('High queue length detected', {
        queueLength: this.metrics.queueLength,
        threshold: this.alertThresholds.queueLength
      });
    }

    // Check memory usage alert
    if (this.metrics.memoryUsage > this.alertThresholds.memoryUsage) {
      this.logger.warn('High memory usage detected', {
        memoryUsage: `${Math.round(this.metrics.memoryUsage / 1024 / 1024)}MB`,
        threshold: `${Math.round(this.alertThresholds.memoryUsage / 1024 / 1024)}MB`
      });
    }
  }

  getMetrics(): PerformanceMetrics {
    this.updateQueueLength();
    return { ...this.metrics };
  }

  getDetailedMetrics(): {
    metrics: PerformanceMetrics;
    recentRequests: RequestMetrics[];
    modelBreakdown: Record<string, { count: number; avgLatency: number; errorRate: number }>;
  } {
    const now = Date.now();
    const windowStart = now - this.metricsWindow;
    const recentRequests = this.requestHistory.filter(r => r.startTime >= windowStart);

    // Calculate model breakdown
    const modelBreakdown: Record<string, { count: number; avgLatency: number; errorRate: number }> = {};
    
    for (const request of recentRequests) {
      if (!request.modelName || !request.endTime) continue;
      
      if (!modelBreakdown[request.modelName]) {
        modelBreakdown[request.modelName] = { count: 0, avgLatency: 0, errorRate: 0 };
      }
      
      const breakdown = modelBreakdown[request.modelName];
      breakdown.count++;
      breakdown.avgLatency = (breakdown.avgLatency * (breakdown.count - 1) + (request.latency || 0)) / breakdown.count;
      breakdown.errorRate = recentRequests.filter(r => 
        r.modelName === request.modelName && !r.success
      ).length / recentRequests.filter(r => r.modelName === request.modelName).length;
    }

    return {
      metrics: this.getMetrics(),
      recentRequests: recentRequests.slice(-20), // Last 20 requests
      modelBreakdown
    };
  }

  shouldTriggerDegradation(): boolean {
    return (
      this.metrics.queueLength > this.alertThresholds.queueLength ||
      this.metrics.p95Latency > this.alertThresholds.latencyP95
    );
  }

  private startMetricsCollection(): void {
    // Update metrics every 30 seconds
    setInterval(() => {
      this.updateMetrics();
    }, 30000);

    // Clean up old requests every 5 minutes
    setInterval(() => {
      const cutoff = Date.now() - this.metricsWindow;
      this.requestHistory = this.requestHistory.filter(r => r.startTime >= cutoff);
      
      // Keep only recent latencies
      const keepCount = Math.min(this.maxHistorySize, this.requestHistory.length);
      this.latencyHistory = this.latencyHistory.slice(-keepCount);
    }, 5 * 60 * 1000);
  }

  reset(): void {
    this.metrics = this.initializeMetrics();
    this.requestHistory = [];
    this.latencyHistory = [];
    this.logger.info('Performance metrics reset');
  }

  updateAlertThresholds(thresholds: Partial<typeof this.alertThresholds>): void {
    this.alertThresholds = { ...this.alertThresholds, ...thresholds };
    this.logger.info('Alert thresholds updated', { thresholds: this.alertThresholds });
  }
}