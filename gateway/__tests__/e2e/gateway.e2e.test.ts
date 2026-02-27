import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';

/**
 * End-to-End Tests for AI Services Gateway
 * 
 * These tests require the full AI services stack to be running:
 * - AI Gateway
 * - LLM Service
 * - RAG Service
 * - Sentiment Service
 * - Redis
 * - ChromaDB
 * 
 * Run with: npm run test:e2e
 * Or: docker-compose up && npm test -- gateway.e2e.test.ts
 * 
 * Tests Requirements:
 * - 1.7: End-to-end request flow through gateway to services
 * - 4.1: Authentication with valid and invalid keys
 * - 3.6: Health check aggregation
 * - 14.34: Trace ID propagation
 */

describe('AI Services Gateway E2E Tests', () => {
  const baseURL = process.env.GATEWAY_URL || 'http://localhost:3000';
  const validApiKey = process.env.TEST_API_KEY || 'test-api-key';
  const invalidApiKey = 'definitely-invalid-key-12345';

  // Skip these tests if SKIP_E2E is set (for CI/CD without running services)
  const describeE2E = process.env.SKIP_E2E === 'true' ? describe.skip : describe;

  describeE2E('End-to-End Request Flow', () => {
    it('should successfully process LLM request through gateway to service', async () => {
      const requestId = uuidv4();
      const response = await request(baseURL)
        .post('/v1/llm/generate')
        .set('Authorization', `Bearer ${validApiKey}`)
        .set('X-Request-Id', requestId)
        .send({
          prompt: 'Hello, how are you?',
          max_tokens: 50,
          temperature: 0.7,
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        text: expect.any(String),
        texts: expect.any(Array),
        tokens_used: expect.any(Number),
        model: expect.any(String),
        trace_id: expect.any(String),
      });

      // Verify trace ID propagation
      expect(response.headers['x-trace-id']).toBeDefined();
      expect(response.headers['x-service-name']).toBe('ai-gateway');
      expect(response.headers['x-service-version']).toBeDefined();
    });

    it('should successfully process RAG request through gateway to service', async () => {
      const requestId = uuidv4();
      const response = await request(baseURL)
        .post('/v1/rag/retrieve')
        .set('Authorization', `Bearer ${validApiKey}`)
        .set('X-Request-Id', requestId)
        .send({
          query: 'What is machine learning?',
          top_k: 5,
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        results: expect.any(Array),
        trace_id: expect.any(String),
      });

      // Verify trace ID propagation
      expect(response.headers['x-trace-id']).toBeDefined();
    });

    it('should successfully process Sentiment request through gateway to service', async () => {
      const requestId = uuidv4();
      const response = await request(baseURL)
        .post('/v1/sentiment/analyze')
        .set('Authorization', `Bearer ${validApiKey}`)
        .set('X-Request-Id', requestId)
        .send({
          text: 'This is a great product! I love it!',
          return_scores: true,
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        sentiment: expect.stringMatching(/positive|negative|neutral/),
        confidence: expect.any(Number),
        tone: expect.any(String),
        trace_id: expect.any(String),
      });

      // Verify trace ID propagation
      expect(response.headers['x-trace-id']).toBeDefined();
    });
  });

  describeE2E('Authentication E2E Tests', () => {
    it('should reject requests with invalid API key', async () => {
      const response = await request(baseURL)
        .post('/v1/llm/generate')
        .set('Authorization', `Bearer ${invalidApiKey}`)
        .send({ prompt: 'test' });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        code: 'FORBIDDEN',
        message: 'Invalid API key',
        trace_id: expect.any(String),
      });
    });

    it('should reject requests without Authorization header', async () => {
      const response = await request(baseURL)
        .post('/v1/llm/generate')
        .send({ prompt: 'test' });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        code: 'UNAUTHORIZED',
        message: expect.stringContaining('Authorization'),
        trace_id: expect.any(String),
      });
    });
  });

  describeE2E('Health Check E2E Tests', () => {
    it('should return healthy status when all services are running', async () => {
      const response = await request(baseURL).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        service: 'ai-gateway',
        status: 'healthy',
        version: expect.any(String),
        uptime: expect.any(Number),
        timestamp: expect.any(String),
        dependencies: {
          llm: { status: 'up', latency: expect.any(Number) },
          rag: { status: 'up', latency: expect.any(Number) },
          sentiment: { status: 'up', latency: expect.any(Number) },
        },
      });
    });

    it('should return ready status when all services are operational', async () => {
      const response = await request(baseURL).get('/health/ready');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        service: 'ai-gateway',
        status: 'ready',
        timestamp: expect.any(String),
        dependencies: expect.any(Object),
      });
    });

    it('should return alive status immediately', async () => {
      const response = await request(baseURL).get('/health/live');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        service: 'ai-gateway',
        status: 'alive',
        timestamp: expect.any(String),
      });
    });
  });

  describeE2E('Trace ID Propagation E2E Tests', () => {
    it('should propagate X-Request-Id through entire request chain', async () => {
      const clientRequestId = uuidv4();
      const response = await request(baseURL)
        .post('/v1/llm/generate')
        .set('Authorization', `Bearer ${validApiKey}`)
        .set('X-Request-Id', clientRequestId)
        .send({
          prompt: 'Test trace propagation',
          max_tokens: 10,
        });

      expect(response.status).toBe(200);
      
      // Verify request ID is preserved in response headers
      expect(response.headers['x-request-id']).toBe(clientRequestId);
      
      // Verify trace ID in response body matches or is related to request ID
      expect(response.body.trace_id).toBeDefined();
    });

    it('should generate trace ID if not provided by client', async () => {
      const response = await request(baseURL)
        .post('/v1/llm/generate')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          prompt: 'Test auto-generated trace',
          max_tokens: 10,
        });

      expect(response.status).toBe(200);
      
      // Should have generated a trace ID
      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.body.trace_id).toBeDefined();
    });
  });

  describeE2E('Error Response Format E2E Tests', () => {
    it('should return standardized error format for invalid input', async () => {
      const response = await request(baseURL)
        .post('/v1/llm/generate')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          // Missing required 'prompt' field
          max_tokens: 50,
        });

      expect([400, 422]).toContain(response.status);
      expect(response.body).toMatchObject({
        code: expect.any(String),
        message: expect.any(String),
        trace_id: expect.any(String),
      });
    });

    it('should return standardized error format for rate limiting', async () => {
      // Send many requests to trigger rate limiting
      const requests = Array(30).fill(null).map(() =>
        request(baseURL)
          .post('/v1/llm/generate')
          .set('Authorization', `Bearer ${validApiKey}`)
          .send({ prompt: 'test', max_tokens: 10 })
      );

      const responses = await Promise.all(requests);
      
      // At least one should be rate limited
      const rateLimited = responses.find(r => r.status === 429);
      
      if (rateLimited) {
        expect(rateLimited.body).toMatchObject({
          code: 'RATE_LIMIT_EXCEEDED',
          message: expect.any(String),
          trace_id: expect.any(String),
        });
        expect(rateLimited.headers['retry-after']).toBeDefined();
      }
    });
  });

  describeE2E('Request Validation E2E Tests', () => {
    it('should validate LLM request parameters', async () => {
      const response = await request(baseURL)
        .post('/v1/llm/generate')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          prompt: 'test',
          max_tokens: 10000, // Exceeds max limit
        });

      // Should return validation error
      expect([400, 422]).toContain(response.status);
    });

    it('should validate RAG request parameters', async () => {
      const response = await request(baseURL)
        .post('/v1/rag/retrieve')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          query: 'test',
          top_k: 100, // Exceeds max limit
        });

      // Should return validation error
      expect([400, 422]).toContain(response.status);
    });

    it('should validate Sentiment request parameters', async () => {
      const response = await request(baseURL)
        .post('/v1/sentiment/analyze')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          text: 'a'.repeat(3000), // Exceeds max length
        });

      // Should return validation error
      expect([400, 422]).toContain(response.status);
    });
  });

  describeE2E('Response Headers E2E Tests', () => {
    it('should include all required response headers', async () => {
      const response = await request(baseURL)
        .post('/v1/llm/generate')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          prompt: 'test',
          max_tokens: 10,
        });

      expect(response.status).toBe(200);
      
      // Verify required headers
      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-trace-id']).toBeDefined();
      expect(response.headers['x-service-name']).toBe('ai-gateway');
      expect(response.headers['x-service-version']).toBeDefined();
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describeE2E('Concurrent Request Handling', () => {
    it('should handle multiple concurrent requests correctly', async () => {
      const requests = Array(10).fill(null).map((_, i) =>
        request(baseURL)
          .post('/v1/llm/generate')
          .set('Authorization', `Bearer ${validApiKey}`)
          .set('X-Request-Id', uuidv4())
          .send({
            prompt: `Test request ${i}`,
            max_tokens: 10,
          })
      );

      const responses = await Promise.all(requests);
      
      // All requests should succeed or be rate limited
      responses.forEach(response => {
        expect([200, 429, 503]).toContain(response.status);
        expect(response.body.trace_id).toBeDefined();
      });

      // Verify each request has unique trace ID
      const traceIds = responses.map(r => r.body.trace_id);
      const uniqueTraceIds = new Set(traceIds);
      expect(uniqueTraceIds.size).toBe(traceIds.length);
    });
  });
});
