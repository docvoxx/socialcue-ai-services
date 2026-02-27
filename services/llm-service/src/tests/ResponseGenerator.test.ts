import { ResponseGenerator } from '../services/ResponseGenerator';
import { ModelManager } from '../services/ModelManager';
import { PromptManager } from '../services/PromptManager';
import { GenerationRequest } from '@socialcue-ai-services/shared';

describe('ResponseGenerator', () => {
  let responseGenerator: ResponseGenerator;
  let modelManager: ModelManager;
  let promptManager: PromptManager;

  beforeEach(async () => {
    modelManager = new ModelManager();
    promptManager = new PromptManager();
    
    // Mock model manager methods
    jest.spyOn(modelManager, 'getCurrentModel').mockReturnValue('test-model');
    jest.spyOn(modelManager, 'createChatSession').mockResolvedValue('test-session');
    jest.spyOn(modelManager, 'getChatSession').mockReturnValue({
      prompt: jest.fn().mockResolvedValue(JSON.stringify({
        candidates: [
          { id: 'A', text: 'Xin chào! Cảm ơn bạn.', tags: ['lịch sự'], score: 0.9, explanation: 'Lịch sự' },
          { id: 'B', text: 'Hi! Tôi hiểu rồi.', tags: ['thân thiện'], score: 0.8, explanation: 'Thân thiện' },
          { id: 'C', text: 'Được, tôi sẽ cân nhắc.', tags: ['thận trọng'], score: 0.7, explanation: 'Thận trọng' }
        ]
      }))
    } as any);
    jest.spyOn(modelManager, 'disposeChatSession').mockResolvedValue();

    await promptManager.initialize();
    responseGenerator = new ResponseGenerator(modelManager, promptManager);
  });

  test('should generate exactly 3 candidates', async () => {
    const request: GenerationRequest = {
      context: 'User: Xin chào, tôi cần hỗ trợ.',
      rag_context: {
        chunks: [],
        total_tokens: 0,
        retrieval_time_ms: 10
      },
      user_style: {
        vocabulary_level: 'casual',
        emoji_usage: 'minimal',
        message_length: 'medium',
        addressing_style: 'informal',
        preferred_tones: ['friendly']
      },
      constraints: []
    };

    const candidates = await responseGenerator.generateCandidates(request);

    expect(candidates).toHaveLength(3);
    expect(candidates.map(c => c.id)).toEqual(['A', 'B', 'C']);
  });

  test('should handle invalid JSON response gracefully', async () => {
    // Mock invalid JSON response
    jest.spyOn(modelManager, 'getChatSession').mockReturnValue({
      prompt: jest.fn().mockResolvedValue('Invalid JSON response')
    } as any);

    const request: GenerationRequest = {
      context: 'Test context',
      rag_context: { chunks: [], total_tokens: 0, retrieval_time_ms: 10 },
      user_style: {
        vocabulary_level: 'casual',
        emoji_usage: 'none',
        message_length: 'short',
        addressing_style: 'informal',
        preferred_tones: []
      },
      constraints: []
    };

    const candidates = await responseGenerator.generateCandidates(request);

    // Should return fallback candidates
    expect(candidates).toHaveLength(3);
    candidates.forEach(candidate => {
      expect(candidate.text).toBeDefined();
      expect(candidate.text.length).toBeGreaterThan(0);
    });
  });

  test('should apply style variations correctly', async () => {
    const formalRequest: GenerationRequest = {
      context: 'Business meeting context',
      rag_context: { chunks: [], total_tokens: 0, retrieval_time_ms: 10 },
      user_style: {
        vocabulary_level: 'formal',
        emoji_usage: 'none',
        message_length: 'long',
        addressing_style: 'formal',
        preferred_tones: ['polite', 'professional']
      },
      constraints: []
    };

    const candidates = await responseGenerator.generateCandidates(formalRequest);

    expect(candidates).toHaveLength(3);
    
    // Check that candidates have appropriate tags for formal style
    const allTags = candidates.flatMap(c => c.tags);
    expect(allTags).toContain('lịch sự');
  });

  test('should ensure semantic distinctness', async () => {
    // Mock similar responses
    jest.spyOn(modelManager, 'getChatSession').mockReturnValue({
      prompt: jest.fn().mockResolvedValue(JSON.stringify({
        candidates: [
          { id: 'A', text: 'Cảm ơn bạn', tags: [], score: 0.9, explanation: 'Test' },
          { id: 'B', text: 'Cảm ơn bạn rất nhiều', tags: [], score: 0.8, explanation: 'Test' },
          { id: 'C', text: 'Cảm ơn bạn nhiều lắm', tags: [], score: 0.7, explanation: 'Test' }
        ]
      }))
    } as any);

    const request: GenerationRequest = {
      context: 'Test context',
      rag_context: { chunks: [], total_tokens: 0, retrieval_time_ms: 10 },
      user_style: {
        vocabulary_level: 'casual',
        emoji_usage: 'none',
        message_length: 'short',
        addressing_style: 'informal',
        preferred_tones: []
      },
      constraints: []
    };

    const candidates = await responseGenerator.generateCandidates(request);

    // Should still return 3 candidates, but with modifications for distinctness
    expect(candidates).toHaveLength(3);
    
    // Check that candidates are not identical
    const texts = candidates.map(c => c.text);
    const uniqueTexts = new Set(texts);
    expect(uniqueTexts.size).toBe(3);
  });

  test('should validate and score candidates properly', async () => {
    const request: GenerationRequest = {
      context: 'Test context',
      rag_context: { chunks: [], total_tokens: 0, retrieval_time_ms: 10 },
      user_style: {
        vocabulary_level: 'mixed',
        emoji_usage: 'frequent',
        message_length: 'medium',
        addressing_style: 'informal',
        preferred_tones: ['friendly']
      },
      constraints: []
    };

    const candidates = await responseGenerator.generateCandidates(request);

    candidates.forEach(candidate => {
      // Validate structure
      expect(candidate.id).toMatch(/^[ABC]$/);
      expect(typeof candidate.text).toBe('string');
      expect(candidate.text.length).toBeGreaterThan(0);
      expect(Array.isArray(candidate.tags)).toBe(true);
      expect(candidate.tags.length).toBeLessThanOrEqual(5);
      
      // Validate score
      expect(typeof candidate.score).toBe('number');
      expect(candidate.score).toBeGreaterThanOrEqual(0);
      expect(candidate.score).toBeLessThanOrEqual(1);
      
      // Validate explanation
      expect(typeof candidate.explanation).toBe('string');
      expect(candidate.explanation.length).toBeLessThanOrEqual(80);
    });
  });
});