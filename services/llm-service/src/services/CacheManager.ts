import { createServiceLogger } from '@socialcue-ai-services/shared';
import { GenerationResponse } from '@socialcue-ai-services/shared';
import Redis from 'redis';
import crypto from 'crypto';

export interface CacheConfig {
  ttl: number; // Time to live in seconds
  maxSize: number; // Maximum cache size
  keyPrefix: string;
}

export interface CachedResponse {
  response: GenerationResponse;
  timestamp: number;
  hitCount: number;
  scenario?: string;
  goal?: string;
  tone?: string;
  lastMessageHash?: string;
}

export class CacheManager {
  private logger = createServiceLogger('cache-manager');
  private redis: Redis.RedisClientType | null = null;
  private localCache: Map<string, CachedResponse> = new Map();
  private config: CacheConfig;
  private useRedis: boolean;

  constructor() {
    this.config = {
      ttl: 5 * 60, // 5 minutes for degradation mode
      maxSize: 1000,
      keyPrefix: 'llm:cache:'
    };
    
    this.useRedis = process.env.REDIS_URL !== undefined;
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Cache Manager', { service: 'llm-service' });
    
    if (this.useRedis) {
      try {
        this.redis = Redis.createClient({
          url: process.env.REDIS_URL || 'redis://localhost:6379'
        });
        
        await this.redis.connect();
        this.logger.info('Connected to Redis for caching', { service: 'llm-service' });
      } catch (error) {
        this.logger.warn('Failed to connect to Redis, using local cache', { 
          service: 'llm-service',
          error 
        });
        this.useRedis = false;
      }
    } else {
      this.logger.info('Using local cache (Redis not configured)', { service: 'llm-service' });
    }

    // Start cache cleanup interval
    this.startCacheCleanup();
  }

  generateCacheKey(
    scenario?: string,
    goal?: string,
    tone?: string,
    lastMessage?: string,
    userStyle?: any
  ): string {
    const keyData = {
      scenario: scenario || '',
      goal: goal || '',
      tone: tone || '',
      lastMessageHash: lastMessage ? this.hashMessage(lastMessage) : '',
      userStyleHash: userStyle ? this.hashObject(userStyle) : ''
    };

    const keyString = JSON.stringify(keyData);
    return this.config.keyPrefix + crypto.createHash('md5').update(keyString).digest('hex');
  }

  private hashMessage(message: string): string {
    return crypto.createHash('md5').update(message).digest('hex').substring(0, 8);
  }

  private hashObject(obj: any): string {
    const objString = JSON.stringify(obj, Object.keys(obj).sort());
    return crypto.createHash('md5').update(objString).digest('hex').substring(0, 8);
  }

  async get(cacheKey: string): Promise<CachedResponse | null> {
    try {
      if (this.useRedis && this.redis) {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const parsedCache: CachedResponse = JSON.parse(cached);
          
          // Check if cache is still valid
          if (this.isCacheValid(parsedCache)) {
            // Increment hit count
            parsedCache.hitCount++;
            await this.redis.setEx(cacheKey, this.config.ttl, JSON.stringify(parsedCache));
            
            this.logger.debug('Cache hit (Redis)', { 
              service: 'llm-service',
              cacheKey, 
              hitCount: parsedCache.hitCount,
              age: Date.now() - parsedCache.timestamp 
            });
            return parsedCache;
          } else {
            // Remove expired cache
            await this.redis.del(cacheKey);
          }
        }
      } else {
        // Local cache
        const cached = this.localCache.get(cacheKey);
        if (cached && this.isCacheValid(cached)) {
          cached.hitCount++;
          this.logger.debug('Cache hit (local)', { 
            service: 'llm-service',
            cacheKey, 
            hitCount: cached.hitCount,
            age: Date.now() - cached.timestamp 
          });
          return cached;
        } else if (cached) {
          // Remove expired cache
          this.localCache.delete(cacheKey);
        }
      }

      return null;
    } catch (error) {
      this.logger.error('Cache get error', error as Error, { 
        service: 'llm-service',
        cacheKey 
      });
      return null;
    }
  }

  async set(
    cacheKey: string,
    response: GenerationResponse,
    scenario?: string,
    goal?: string,
    tone?: string,
    lastMessageHash?: string
  ): Promise<void> {
    try {
      const cachedResponse: CachedResponse = {
        response,
        timestamp: Date.now(),
        hitCount: 0,
        ...(scenario && { scenario }),
        ...(goal && { goal }),
        ...(tone && { tone }),
        ...(lastMessageHash && { lastMessageHash })
      };

      if (this.useRedis && this.redis) {
        await this.redis.setEx(cacheKey, this.config.ttl, JSON.stringify(cachedResponse));
        this.logger.debug('Cache set (Redis)', { 
          service: 'llm-service',
          cacheKey, 
          ttl: this.config.ttl 
        });
      } else {
        // Local cache with size limit
        if (this.localCache.size >= this.config.maxSize) {
          this.evictOldestEntries();
        }
        
        this.localCache.set(cacheKey, cachedResponse);
        this.logger.debug('Cache set (local)', { 
          service: 'llm-service',
          cacheKey, 
          cacheSize: this.localCache.size 
        });
      }
    } catch (error) {
      this.logger.error('Cache set error', error as Error, { 
        service: 'llm-service',
        cacheKey 
      });
    }
  }

  private isCacheValid(cached: CachedResponse): boolean {
    const age = Date.now() - cached.timestamp;
    return age < (this.config.ttl * 1000);
  }

  private evictOldestEntries(): void {
    // Remove 20% of oldest entries when cache is full
    const entriesToRemove = Math.floor(this.config.maxSize * 0.2);
    const sortedEntries = Array.from(this.localCache.entries())
      .sort(([, a], [, b]) => a.timestamp - b.timestamp);

    for (let i = 0; i < entriesToRemove && i < sortedEntries.length; i++) {
      this.localCache.delete(sortedEntries[i][0]);
    }

    this.logger.debug('Evicted old cache entries', { 
      service: 'llm-service',
      removed: entriesToRemove, 
      newSize: this.localCache.size 
    });
  }

  async invalidate(pattern?: string): Promise<number> {
    let invalidatedCount = 0;

    try {
      if (this.useRedis && this.redis) {
        if (pattern) {
          const keys = await this.redis.keys(this.config.keyPrefix + pattern);
          if (keys.length > 0) {
            invalidatedCount = await this.redis.del(keys);
          }
        } else {
          const keys = await this.redis.keys(this.config.keyPrefix + '*');
          if (keys.length > 0) {
            invalidatedCount = await this.redis.del(keys);
          }
        }
      } else {
        // Local cache
        if (pattern) {
          const regex = new RegExp(pattern);
          for (const [key] of this.localCache.entries()) {
            if (regex.test(key)) {
              this.localCache.delete(key);
              invalidatedCount++;
            }
          }
        } else {
          invalidatedCount = this.localCache.size;
          this.localCache.clear();
        }
      }

      this.logger.info('Cache invalidated', { 
        service: 'llm-service',
        pattern, 
        invalidatedCount 
      });
      return invalidatedCount;
    } catch (error) {
      this.logger.error('Cache invalidation error', error as Error, { 
        service: 'llm-service',
        pattern 
      });
      return 0;
    }
  }

  async getCacheStats(): Promise<{
    size: number;
    hitRate: number;
    totalHits: number;
    averageAge: number;
    oldestEntry: number;
    newestEntry: number;
  }> {
    try {
      let entries: [string, CachedResponse][] = [];

      if (this.useRedis && this.redis) {
        const keys = await this.redis.keys(this.config.keyPrefix + '*');
        const values = keys.length > 0 ? await this.redis.mGet(keys) : [];
        
        entries = keys.map((key, index) => {
          const value = values[index];
          return [key, value ? JSON.parse(value) : null];
        }).filter(([, value]) => value !== null) as [string, CachedResponse][];
      } else {
        entries = Array.from(this.localCache.entries());
      }

      if (entries.length === 0) {
        return {
          size: 0,
          hitRate: 0,
          totalHits: 0,
          averageAge: 0,
          oldestEntry: 0,
          newestEntry: 0
        };
      }

      const now = Date.now();
      const totalHits = entries.reduce((sum, [, cached]) => sum + cached.hitCount, 0);
      const totalRequests = entries.reduce((sum, [, cached]) => sum + cached.hitCount + 1, 0); // +1 for initial set
      const ages = entries.map(([, cached]) => now - cached.timestamp);
      const timestamps = entries.map(([, cached]) => cached.timestamp);

      return {
        size: entries.length,
        hitRate: totalRequests > 0 ? totalHits / totalRequests : 0,
        totalHits,
        averageAge: ages.reduce((sum, age) => sum + age, 0) / ages.length,
        oldestEntry: Math.min(...timestamps),
        newestEntry: Math.max(...timestamps)
      };
    } catch (error) {
      this.logger.error('Error getting cache stats', error as Error, { 
        service: 'llm-service' 
      });
      return {
        size: 0,
        hitRate: 0,
        totalHits: 0,
        averageAge: 0,
        oldestEntry: 0,
        newestEntry: 0
      };
    }
  }

  private startCacheCleanup(): void {
    // Clean up expired entries every 2 minutes
    setInterval(async () => {
      try {
        if (!this.useRedis) {
          // Local cache cleanup
          const expiredKeys: string[] = [];
          
          for (const [key, cached] of this.localCache.entries()) {
            if (!this.isCacheValid(cached)) {
              expiredKeys.push(key);
            }
          }
          
          expiredKeys.forEach(key => this.localCache.delete(key));
          
          if (expiredKeys.length > 0) {
            this.logger.debug('Cleaned up expired cache entries', { 
              service: 'llm-service',
              expired: expiredKeys.length,
              remaining: this.localCache.size 
            });
          }
        }
        // Redis handles TTL automatically
      } catch (error) {
        this.logger.error('Cache cleanup error', error as Error, { 
          service: 'llm-service' 
        });
      }
    }, 2 * 60 * 1000); // 2 minutes
  }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.logger.info('Redis connection closed', { service: 'llm-service' });
    }
    
    this.localCache.clear();
    this.logger.info('Cache manager closed', { service: 'llm-service' });
  }

  // Configuration methods
  updateConfig(newConfig: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Cache configuration updated', { 
      service: 'llm-service',
      config: this.config 
    });
  }

  getConfig(): CacheConfig {
    return { ...this.config };
  }

  async isReady(): Promise<boolean> {
    try {
      if (this.useRedis && this.redis) {
        // Check if Redis is connected and responsive
        await this.redis.ping();
        return true;
      }
      // Local cache is always ready
      return true;
    } catch (error) {
      this.logger.error('Cache readiness check failed', error as Error, { 
        service: 'llm-service' 
      });
      return false;
    }
  }
}