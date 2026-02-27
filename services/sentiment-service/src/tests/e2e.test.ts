import request from 'supertest';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from '../middleware/errorHandler';
import { requestLogger } from '../middleware/requestLogger';
import { SentimentController } from '../controllers/SentimentController';
import { SentimentRequest, SentimentResponse, ResponseCandidate } from '@socialcue-ai-services/shared';

// Mock the shared logger
jest.mock('@socialcue-ai-services/shared', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  SentimentRequestSchema: {
    safeParse: jest.fn().mockImplementation((data) => {
      // Simulate validation failure for incomplete requests
      if (!data.target_tone || !data.context || !data.safety_level || !data.candidates) {
        return {
          success: false,
          error: { issues: [{ message: 'Missing required fields' }] }
        };
      }
      return {
        success: true,
        data: data
      };
    })
  }
}));

describe('Sentiment Service End-to-End Integration Tests', () => {
  let app: express.Application;
  let sentimentController: SentimentController;

  beforeAll(() => {
    // Set up the Express app exactly like the main service
    app = express();
    
    // Middleware
    app.use(helmet());
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));
    app.use(requestLogger);

    // Routes
    sentimentController = new SentimentController();
    app.post('/analyze', sentimentController.analyzeSentiment.bind(sentimentController));
    app.get('/health', sentimentController.getHealthStatus.bind(sentimentController));

    // Error handling
    app.use(errorHandler);
  });

  describe('POST /analyze - Complete Sentiment Analysis Pipeline', () => {
    test('should process Vietnamese polite tone request successfully', async () => {
      const testRequest: SentimentRequest = {
        candidates: [
          {
            id: 'A',
            text: 'Xin chào anh, em muốn hỏi về dự án này ạ',
            explanation: 'Polite greeting with formal pronouns',
            tags: ['polite', 'formal'],
            score: 0.8
          },
          {
            id: 'B',
            text: 'Hi bạn! Project này thế nào?',
            explanation: 'Casual greeting with GenZ style',
            tags: ['casual', 'genz'],
            score: 0.7
          },
          {
            id: 'C',
            text: 'Kính thưa quý anh, tôi muốn tìm hiểu về dự án',
            explanation: 'Very formal business greeting',
            tags: ['formal', 'business'],
            score: 0.75
          }
        ],
        target_tone: 'polite',
        context: 'Workplace communication with senior colleague',
        safety_level: 'moderate'
      };

      const response = await request(app)
        .post('/analyze')
        .send(testRequest)
        .set('x-request-id', 'test-request-123')
        .set('x-user-id', 'user-456')
        .expect(200);

      const sentimentResponse: SentimentResponse = response.body;

      // Verify response structure
      expect(sentimentResponse).toHaveProperty('ranked_candidates');
      expect(sentimentResponse).toHaveProperty('safety_violations');
      expect(sentimentResponse).toHaveProperty('rewrite_suggestions');

      // Verify candidates are properly scored and ranked
      expect(sentimentResponse.ranked_candidates).toHaveLength(3);
      
      const rankedCandidates = sentimentResponse.ranked_candidates;
      
      // Check that all candidates have required scoring fields
      for (const candidate of rankedCandidates) {
        expect(candidate).toHaveProperty('tone_score');
        expect(candidate).toHaveProperty('sentiment_score');
        expect(candidate).toHaveProperty('safety_score');
        expect(candidate).toHaveProperty('overall_score');
        
        // Verify score ranges
        expect(candidate.tone_score).toBeGreaterThanOrEqual(0);
        expect(candidate.tone_score).toBeLessThanOrEqual(1);
        expect(candidate.sentiment_score).toBeGreaterThanOrEqual(0);
        expect(candidate.sentiment_score).toBeLessThanOrEqual(1);
        expect(candidate.safety_score).toBeGreaterThanOrEqual(0);
        expect(candidate.safety_score).toBeLessThanOrEqual(1);
        expect(candidate.overall_score).toBeGreaterThanOrEqual(0);
        expect(candidate.overall_score).toBeLessThanOrEqual(1);
      }

      // Verify ranking order (highest overall_score first)
      for (let i = 0; i < rankedCandidates.length - 1; i++) {
        expect(rankedCandidates[i].overall_score)
          .toBeGreaterThanOrEqual(rankedCandidates[i + 1].overall_score);
      }

      // The polite Vietnamese text should score highest for polite tone
      const politeCandidate = rankedCandidates.find(c => c.text.includes('Xin chào'));
      expect(politeCandidate).toBeDefined();
      expect(politeCandidate!.tone_score).toBeGreaterThan(0.7);

      // No safety violations expected for clean content
      expect(sentimentResponse.safety_violations).toHaveLength(0);

      console.log('E2E Test Results:');
      console.log('Ranked Candidates:', rankedCandidates.map(c => ({
        id: c.id,
        text: c.text.substring(0, 30) + '...',
        tone_score: c.tone_score.toFixed(3),
        overall_score: c.overall_score.toFixed(3)
      })));
    });

    test('should handle safety violations correctly', async () => {
      const testRequest: SentimentRequest = {
        candidates: [
          {
            id: 'A',
            text: 'Xin chào anh, em muốn hỏi về dự án',
            explanation: 'Safe polite content',
            tags: ['polite'],
            score: 0.8
          },
          {
            id: 'B',
            text: 'Đồ ngu, tại sao không trả lời?',
            explanation: 'Offensive content with insults',
            tags: ['offensive'],
            score: 0.3
          }
        ],
        target_tone: 'polite',
        context: 'Professional workplace communication',
        safety_level: 'strict'
      };

      const response = await request(app)
        .post('/analyze')
        .send(testRequest)
        .set('x-request-id', 'test-safety-123')
        .set('x-user-id', 'user-789')
        .expect(200);

      const sentimentResponse: SentimentResponse = response.body;

      // Should detect safety violations
      expect(sentimentResponse.safety_violations.length).toBeGreaterThan(0);
      
      const violation = sentimentResponse.safety_violations[0];
      expect(violation).toHaveProperty('candidate_id');
      expect(violation).toHaveProperty('violation_type');
      expect(violation).toHaveProperty('severity');
      expect(violation).toHaveProperty('message');
      
      // The offensive candidate should have been processed by safety handler
      const offensiveCandidate = sentimentResponse.ranked_candidates.find(c => c.id === 'B');
      expect(offensiveCandidate).toBeDefined();
      
      // The safety handler should have rewritten the content or penalized the score
      // Either the text should be different (rewritten) or the overall score should be lower
      const wasRewritten = offensiveCandidate!.text !== 'Đồ ngu, tại sao không trả lời?';
      const hasLowOverallScore = offensiveCandidate!.overall_score < 0.5;
      
      expect(wasRewritten || hasLowOverallScore).toBe(true);

      // Should provide rewrite suggestions
      expect(sentimentResponse.rewrite_suggestions.length).toBeGreaterThan(0);
    });

    test('should handle different tone targets correctly', async () => {
      const candidates: ResponseCandidate[] = [
        {
          id: 'A',
          text: 'Tôi chắc chắn sẽ hoàn thành nhiệm vụ này',
          explanation: 'Confident statement',
          tags: ['confident'],
          score: 0.8
        },
        {
          id: 'B',
          text: 'Có lẽ tôi có thể thử làm việc này',
          explanation: 'Tentative soft approach',
          tags: ['soft'],
          score: 0.7
        }
      ];

      // Test confident tone target
      const confidentRequest: SentimentRequest = {
        candidates,
        target_tone: 'confident',
        context: 'Team meeting presentation',
        safety_level: 'moderate'
      };

      const confidentResponse = await request(app)
        .post('/analyze')
        .send(confidentRequest)
        .set('x-request-id', 'test-confident-123')
        .expect(200);

      // Test soft tone target
      const softRequest: SentimentRequest = {
        candidates,
        target_tone: 'soft',
        context: 'Gentle suggestion to colleague',
        safety_level: 'moderate'
      };

      const softResponse = await request(app)
        .post('/analyze')
        .send(softRequest)
        .set('x-request-id', 'test-soft-123')
        .expect(200);

      // Verify different rankings based on tone target
      const confidentRanking = confidentResponse.body.ranked_candidates;
      const softRanking = softResponse.body.ranked_candidates;

      // For confident tone, confident candidate should rank higher
      expect(confidentRanking[0].text).toContain('chắc chắn');
      
      // For soft tone, soft candidate should rank higher
      expect(softRanking[0].text).toContain('Có lẽ');
    });

    test('should handle edge cases gracefully', async () => {
      // Test with empty candidates
      const emptyRequest: SentimentRequest = {
        candidates: [],
        target_tone: 'polite',
        context: 'Test context',
        safety_level: 'moderate'
      };

      const emptyResponse = await request(app)
        .post('/analyze')
        .send(emptyRequest)
        .set('x-request-id', 'test-empty-123')
        .expect(200);

      expect(emptyResponse.body.ranked_candidates).toHaveLength(0);
      expect(emptyResponse.body.safety_violations).toHaveLength(0);

      // Test with very short text
      const shortTextRequest: SentimentRequest = {
        candidates: [
          {
            id: 'A',
            text: 'Hi',
            explanation: 'Very short greeting',
            tags: ['short'],
            score: 0.5
          }
        ],
        target_tone: 'genz',
        context: 'Casual chat',
        safety_level: 'permissive'
      };

      const shortResponse = await request(app)
        .post('/analyze')
        .send(shortTextRequest)
        .set('x-request-id', 'test-short-123')
        .expect(200);

      expect(shortResponse.body.ranked_candidates).toHaveLength(1);
      expect(shortResponse.body.ranked_candidates[0].overall_score).toBeGreaterThanOrEqual(0);
    });

    test('should validate request format', async () => {
      // Test with invalid request (missing required fields)
      const invalidRequest = {
        candidates: [
          {
            id: 'A',
            text: 'Test text'
            // Missing required fields
          }
        ]
        // Missing target_tone, context, safety_level
      };

      await request(app)
        .post('/analyze')
        .send(invalidRequest)
        .set('x-request-id', 'test-invalid-123')
        .expect(400);
    });
  });

  describe('GET /health - Health Check Endpoint', () => {
    test('should return healthy status with service information', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('service', 'sentiment-service');
      expect(response.body).toHaveProperty('safety_stats');
      expect(response.body).toHaveProperty('safety_patterns');
      expect(response.body).toHaveProperty('timestamp');

      // Verify timestamp is recent (within last minute)
      const timestamp = new Date(response.body.timestamp);
      const now = new Date();
      const timeDiff = now.getTime() - timestamp.getTime();
      expect(timeDiff).toBeLessThan(60000); // Less than 1 minute
    });
  });

  describe('Performance and Reliability', () => {
    test('should handle concurrent requests efficiently', async () => {
      const testRequest: SentimentRequest = {
        candidates: [
          {
            id: 'A',
            text: 'Xin chào anh, em muốn hỏi về dự án',
            explanation: 'Test candidate',
            tags: ['test'],
            score: 0.8
          }
        ],
        target_tone: 'polite',
        context: 'Test context',
        safety_level: 'moderate'
      };

      const startTime = Date.now();
      
      // Send 5 concurrent requests
      const promises = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/analyze')
          .send(testRequest)
          .set('x-request-id', `concurrent-test-${i}`)
          .expect(200)
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should succeed
      expect(responses).toHaveLength(5);
      responses.forEach(response => {
        expect(response.body.ranked_candidates).toHaveLength(1);
      });

      // Should complete within reasonable time (adjust threshold as needed)
      expect(totalTime).toBeLessThan(10000); // 10 seconds for 5 concurrent requests
    });

    test('should maintain consistent results for identical requests', async () => {
      const testRequest: SentimentRequest = {
        candidates: [
          {
            id: 'A',
            text: 'Cảm ơn anh đã giúp đỡ em ạ',
            explanation: 'Grateful polite response',
            tags: ['polite', 'grateful'],
            score: 0.8
          }
        ],
        target_tone: 'polite',
        context: 'Thanking colleague for help',
        safety_level: 'moderate'
      };

      // Send the same request multiple times
      const responses = await Promise.all([
        request(app).post('/analyze').send(testRequest).set('x-request-id', 'consistency-1'),
        request(app).post('/analyze').send(testRequest).set('x-request-id', 'consistency-2'),
        request(app).post('/analyze').send(testRequest).set('x-request-id', 'consistency-3')
      ]);

      // All responses should have the same structure and similar scores
      const scores = responses.map(r => r.body.ranked_candidates[0].overall_score);
      
      // Scores should be consistent (within small tolerance for floating point)
      for (let i = 1; i < scores.length; i++) {
        expect(Math.abs(scores[i] - scores[0])).toBeLessThan(0.01);
      }
    });
  });
});