import { KnowledgeBaseManager, MemoryUpdate } from '../services/KnowledgeBaseManager';
import { DatabaseConnection, UserStyle } from '@socialcue-ai-services/shared';

// Mock dependencies
jest.mock('chromadb');
jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(),
}));

describe('KnowledgeBaseManager', () => {
  let kbManager: KnowledgeBaseManager;
  let mockDb: jest.Mocked<DatabaseConnection>;

  beforeEach(() => {
    // Mock database
    mockDb = {
      query: jest.fn(),
      healthCheck: jest.fn().mockResolvedValue(true),
      close: jest.fn(),
      getClient: jest.fn(),
      transaction: jest.fn(),
    } as any;

    kbManager = new KnowledgeBaseManager(mockDb, 'http://localhost:8000');
    
    // Mock the embedder
    const mockEmbedder = jest.fn().mockResolvedValue({
      data: new Array(384).fill(0.1), // Mock embedding vector
    });
    
    // Mock ChromaDB collections
    const mockCollection = {
      add: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue({
        documents: [[]],
        distances: [[]],
        ids: [[]],
      }),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue({ ids: [] }),
      count: jest.fn().mockResolvedValue(0),
    };
    
    // Set up the mocked properties
    (kbManager as any).embedder = mockEmbedder;
    (kbManager as any).templateCollection = mockCollection;
    (kbManager as any).styleCollection = mockCollection;
    (kbManager as any).memoryCollection = mockCollection;
    (kbManager as any).chromaClient = {
      heartbeat: jest.fn().mockResolvedValue(true),
    };
  });

  describe('Memory Management', () => {
    it('should prevent duplicate memory updates with same idempotency key', async () => {
      // Mock existing memory with same idempotency key
      mockDb.query.mockResolvedValueOnce([{ id: 'existing-id' }]);

      const memoryUpdate: MemoryUpdate = {
        user_id: 'user-123',
        content: 'Test memory content',
        context: { scenario: 'greeting' },
        idempotency_key: 'test-key-123',
      };

      // Should not throw and should not insert
      await expect(kbManager.updateMemory(memoryUpdate)).resolves.toBeUndefined();
      
      // Should only check for existing, not insert
      expect(mockDb.query).toHaveBeenCalledTimes(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM kb_memories'),
        ['user-123', 'test-key-123']
      );
    });

    it('should create new memory when idempotency key is unique', async () => {
      // Mock no existing memory
      mockDb.query.mockResolvedValueOnce([]);
      mockDb.query.mockResolvedValueOnce([]); // Insert query

      const memoryUpdate: MemoryUpdate = {
        user_id: 'user-123',
        content: 'New memory content',
        context: { scenario: 'apology' },
        idempotency_key: 'unique-key-456',
      };

      await expect(kbManager.updateMemory(memoryUpdate)).resolves.toBeUndefined();
      
      // Should check for existing and then insert
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it('should generate idempotency key when not provided', async () => {
      mockDb.query.mockResolvedValueOnce([]); // No existing
      mockDb.query.mockResolvedValueOnce([]); // Insert

      const memoryUpdate: MemoryUpdate = {
        user_id: 'user-123',
        content: 'Memory without key',
        context: { scenario: 'request' },
        // No idempotency_key provided
      };

      await expect(kbManager.updateMemory(memoryUpdate)).resolves.toBeUndefined();
      
      // Should generate key and check/insert
      expect(mockDb.query).toHaveBeenCalledTimes(2);
      
      // Verify the generated key is used in the query
      const checkCall = mockDb.query.mock.calls[0];
      expect(checkCall[1]).toHaveLength(2);
      expect(checkCall[1]?.[0]).toBe('user-123');
      expect(typeof checkCall[1]?.[1]).toBe('string');
      expect(checkCall[1]?.[1]).toHaveLength(64); // SHA256 hash length
    });
  });

  describe('User Style Management', () => {
    it('should retrieve user style from database', async () => {
      const mockStyle: UserStyle = {
        vocabulary_level: 'formal',
        emoji_usage: 'minimal',
        message_length: 'medium',
        addressing_style: 'formal',
        preferred_tones: ['polite', 'professional'],
      };

      mockDb.query.mockResolvedValueOnce([mockStyle]);

      const result = await kbManager.getUserStyle('user-123');

      expect(result).toEqual(mockStyle);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT vocabulary_level'),
        ['user-123']
      );
    });

    it('should return null when user style not found', async () => {
      mockDb.query.mockResolvedValueOnce([]);

      const result = await kbManager.getUserStyle('nonexistent-user');

      expect(result).toBeNull();
    });

    it('should update user style in database', async () => {
      const userStyle: UserStyle = {
        vocabulary_level: 'casual',
        emoji_usage: 'frequent',
        message_length: 'short',
        addressing_style: 'informal',
        preferred_tones: ['friendly', 'casual'],
      };

      mockDb.query.mockResolvedValueOnce([]); // Upsert query

      await expect(kbManager.updateUserStyle('user-123', userStyle)).resolves.toBeUndefined();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_styles'),
        [
          'user-123',
          'casual',
          'frequent',
          'short',
          'informal',
          JSON.stringify(['friendly', 'casual']),
        ]
      );
    });
  });

  describe('User Data Isolation', () => {
    it('should clear only specified user memory', async () => {
      mockDb.query.mockResolvedValueOnce([]); // Delete query

      await expect(kbManager.clearUserMemory('user-123')).resolves.toBeUndefined();

      expect(mockDb.query).toHaveBeenCalledWith(
        'DELETE FROM kb_memories WHERE user_id = $1',
        ['user-123']
      );
    });
  });

  describe('Token Estimation', () => {
    it('should estimate tokens correctly for Vietnamese text', () => {
      // Access private method for testing
      const estimateTokens = (kbManager as any).estimateTokens.bind(kbManager);
      
      // Test various text lengths
      expect(estimateTokens('Xin chào')).toBe(2); // 8 chars / 4 = 2 tokens
      expect(estimateTokens('Tôi là sinh viên')).toBe(4); // 15 chars / 4 = 3.75 -> 4 tokens
      expect(estimateTokens('')).toBe(0); // Empty string
      
      // Longer text
      const longText = 'Đây là một đoạn văn bản tiếng Việt dài để kiểm tra việc ước tính số token';
      expect(estimateTokens(longText)).toBe(Math.ceil(longText.length / 4));
    });
  });

  describe('Health Check', () => {
    it('should return false when ChromaDB is not initialized', async () => {
      // Create a new instance without mocked collections
      const uninitializedKbManager = new KnowledgeBaseManager(mockDb, 'http://localhost:8000');
      const result = await uninitializedKbManager.healthCheck();
      expect(result).toBe(false);
    });

    it('should return true when all systems are healthy', async () => {
      const result = await kbManager.healthCheck();
      expect(result).toBe(true);
    });
  });
});