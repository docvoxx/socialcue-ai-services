import fc from 'fast-check';
import { ModelManager } from '../../services/ModelManager';
import { PromptManager } from '../../services/PromptManager';
import { ResponseGenerator } from '../../services/ResponseGenerator';
import { CacheManager } from '../../services/CacheManager';
import { GenerationRequest, GenerationResponse } from '@socialcue-ai-services/shared';

describe('LLM Service Property Tests', () => {
  let modelManager: ModelManager;
  let promptManager: PromptManager;
  let responseGenerator: ResponseGenerator;
  let cacheManager: CacheManager;

  beforeAll(async () => {
    // Initialize services with test configuration
    modelManager = new ModelManager();
    promptManager = new PromptManager();
    cacheManager = new CacheManager();
    
    // Mock model manager methods for testing
    jest.spyOn(modelManager, 'getCurrentModel').mockReturnValue('test-model');
    jest.spyOn(modelManager, 'createChatSession').mockResolvedValue('test-session');
    jest.spyOn(modelManager, 'getChatSession').mockReturnValue({
      prompt: jest.fn().mockResolvedValue(JSON.stringify({
        candidates: [
          { id: 'A', text: 'Test response A', tags: ['test'], score: 0.9, explanation: 'Test explanation A' },
          { id: 'B', text: 'Test response B', tags: ['test'], score: 0.8, explanation: 'Test explanation B' },
          { id: 'C', text: 'Test response C', tags: ['test'], score: 0.7, explanation: 'Test explanation C' }
        ]
      }))
    } as any);
    jest.spyOn(modelManager, 'disposeChatSession').mockResolvedValue();
    jest.spyOn(modelManager, 'updateTokensPerSecond').mockImplementation();

    // Initialize prompt manager with default template
    await promptManager.initialize();
    
    responseGenerator = new ResponseGenerator(modelManager, promptManager);
  });

  // Generators for property-based testing
  const userStyleArb = fc.record({
    vocabulary_level: fc.constantFrom('formal', 'casual', 'mixed'),
    emoji_usage: fc.constantFrom('none', 'minimal', 'frequent'),
    message_length: fc.constantFrom('short', 'medium', 'long'),
    addressing_style: fc.constantFrom('formal', 'informal'),
    preferred_tones: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 })
  });

  const ragContextArb = fc.record({
    chunks: fc.array(fc.record({
      content: fc.string({ minLength: 10, maxLength: 200 }),
      source_id: fc.record({
        kb: fc.constantFrom('template', 'style', 'memory'),
        id: fc.string({ minLength: 1, maxLength: 50 }),
        score: fc.float({ min: 0, max: 1 })
      }),
      score: fc.float({ min: 0, max: 1 }),
      kb_type: fc.constantFrom('template', 'style', 'memory')
    }), { minLength: 0, maxLength: 15 }),
    total_tokens: fc.integer({ min: 0, max: 2000 }),
    retrieval_time_ms: fc.integer({ min: 1, max: 1000 })
  });

  const generationRequestArb = fc.record({
    context: fc.string({ minLength: 10, maxLength: 1000 }),
    rag_context: ragContextArb,
    user_style: userStyleArb,
    constraints: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 }),
    scenario: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    goal: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    tone: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined })
  });

  /**
   * Feature: skippy-coach-advanced, Property 2: Response Candidate Count Invariant
   * For any conversation context, exactly 3 candidates should be generated
   * **Validates: Requirements 2.1**
   */
  test('Property 2: Response Candidate Count Invariant', async () => {
    await fc.assert(
      fc.asyncProperty(generationRequestArb, async (request: GenerationRequest) => {
        const candidates = await responseGenerator.generateCandidates(request);
        
        // Must return exactly 3 candidates
        expect(candidates).toHaveLength(3);
        
        // Candidates must have IDs A, B, C
        const ids = candidates.map(c => c.id).sort();
        expect(ids).toEqual(['A', 'B', 'C']);
        
        // All candidates must have required fields
        candidates.forEach(candidate => {
          expect(candidate.text).toBeDefined();
          expect(typeof candidate.text).toBe('string');
          expect(candidate.text.length).toBeGreaterThan(0);
          expect(Array.isArray(candidate.tags)).toBe(true);
          expect(candidate.tags.length).toBeLessThanOrEqual(5);
          expect(typeof candidate.score).toBe('number');
          expect(candidate.score).toBeGreaterThanOrEqual(0);
          expect(candidate.score).toBeLessThanOrEqual(1);
          expect(typeof candidate.explanation).toBe('string');
          expect(candidate.explanation.length).toBeLessThanOrEqual(80);
        });
      }),
      { numRuns: 50, timeout: 30000 }
    );
  });

  /**
   * Feature: skippy-coach-advanced, Property 3: Semantic Distinctness of Candidates
   * For any set of response candidates, all candidates should be semantically distinct
   * **Validates: Requirements 1.9**
   */
  test('Property 3: Semantic Distinctness of Candidates', async () => {
    await fc.assert(
      fc.asyncProperty(generationRequestArb, async (request: GenerationRequest) => {
        const candidates = await responseGenerator.generateCandidates(request);
        
        // All candidates should have different text
        const texts = candidates.map(c => c.text);
        const uniqueTexts = new Set(texts);
        expect(uniqueTexts.size).toBe(candidates.length);
        
        // Calculate pairwise similarity (simple check)
        for (let i = 0; i < candidates.length; i++) {
          for (let j = i + 1; j < candidates.length; j++) {
            const similarity = calculateTextSimilarity(candidates[i].text, candidates[j].text);
            
            // Candidates should not be too similar (threshold: 0.9 for testing)
            expect(similarity).toBeLessThan(0.9);
          }
        }
      }),
      { numRuns: 50, timeout: 30000 }
    );
  });

  /**
   * Feature: skippy-coach-advanced, Property 4: Performance Latency Bounds
   * For any text input request, generation should complete within reasonable time bounds
   * **Validates: Requirements 2.3, 8.2**
   */
  test('Property 4: Performance Latency Bounds', async () => {
    await fc.assert(
      fc.asyncProperty(generationRequestArb, async (request: GenerationRequest) => {
        const startTime = Date.now();
        
        const candidates = await responseGenerator.generateCandidates(request);
        
        const endTime = Date.now();
        const latency = endTime - startTime;
        
        // Should complete within 10 seconds for testing (relaxed for property tests)
        expect(latency).toBeLessThan(10000);
        
        // Should return valid candidates
        expect(candidates).toHaveLength(3);
        
        // Log performance for monitoring
        if (latency > 2000) {
          console.warn(`High latency detected: ${latency}ms for request with context length ${request.context.length}`);
        }
      }),
      { numRuns: 25, timeout: 60000 } // Reduced runs for performance test
    );
  });

  /**
   * Feature: skippy-coach-advanced, Property 5: Cache Consistency in Degradation Mode
   * For any cached response, it should only be returned for matching request parameters
   * **Validates: Requirements 2.7**
   */
  test('Property 5: Cache Consistency in Degradation Mode', async () => {
    const scenarios = ['greeting', 'request', 'apology'];
    const goals = ['ask_question', 'make_request', 'express_thanks'];
    const tones = ['polite', 'casual', 'formal'];

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          scenario: fc.constantFrom(...scenarios),
          goal: fc.constantFrom(...goals),
          tone: fc.constantFrom(...tones),
          lastMessage: fc.string({ minLength: 5, maxLength: 100 }),
          userStyle: userStyleArb
        }),
        async (cacheParams) => {
          // Generate cache key
          const cacheKey1 = cacheManager.generateCacheKey(
            cacheParams.scenario,
            cacheParams.goal,
            cacheParams.tone,
            cacheParams.lastMessage,
            cacheParams.userStyle
          );

          // Generate cache key with same parameters
          const cacheKey2 = cacheManager.generateCacheKey(
            cacheParams.scenario,
            cacheParams.goal,
            cacheParams.tone,
            cacheParams.lastMessage,
            cacheParams.userStyle
          );

          // Same parameters should generate same cache key
          expect(cacheKey1).toBe(cacheKey2);

          // Different parameters should generate different cache keys
          const differentCacheKey = cacheManager.generateCacheKey(
            cacheParams.scenario,
            cacheParams.goal,
            'different_tone',
            cacheParams.lastMessage,
            cacheParams.userStyle
          );

          expect(cacheKey1).not.toBe(differentCacheKey);

          // Test cache TTL behavior
          const mockResponse: GenerationResponse = {
            candidates: [
              { id: 'A', text: 'Test', tags: [], score: 0.5, explanation: 'Test' },
              { id: 'B', text: 'Test', tags: [], score: 0.5, explanation: 'Test' },
              { id: 'C', text: 'Test', tags: [], score: 0.5, explanation: 'Test' }
            ],
            model_version: 'test',
            prompt_version: 'test',
            generation_time_ms: 100
          };

          // Set cache entry
          await cacheManager.set(
            cacheKey1,
            mockResponse,
            cacheParams.scenario,
            cacheParams.goal,
            cacheParams.tone
          );

          // Should retrieve the same response
          const cached = await cacheManager.get(cacheKey1);
          expect(cached).toBeTruthy();
          expect(cached?.response.candidates).toHaveLength(3);
        }
      ),
      { numRuns: 50, timeout: 30000 }
    );
  });

  // Helper function for similarity calculation
  function calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }
});