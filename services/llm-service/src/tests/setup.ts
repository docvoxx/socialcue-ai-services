// Increase timeout for property-based tests
jest.setTimeout(60000);

// Mock external dependencies for testing
jest.mock('node-llama-cpp', () => ({
  LlamaModel: jest.fn().mockImplementation(() => ({
    dispose: jest.fn(),
  })),
  LlamaContext: jest.fn().mockImplementation(() => ({
    dispose: jest.fn(),
  })),
  LlamaChatSession: jest.fn().mockImplementation(() => ({
    prompt: jest.fn().mockResolvedValue(JSON.stringify({
      candidates: [
        {
          id: 'A',
          text: 'Xin chào! Cảm ơn bạn đã chia sẻ.',
          tags: ['lịch sự', 'cảm ơn'],
          score: 0.9,
          explanation: 'Phản hồi lịch sự và thân thiện'
        },
        {
          id: 'B',
          text: 'Hi! Tôi hiểu ý bạn rồi.',
          tags: ['thân thiện', 'hiểu biết'],
          score: 0.8,
          explanation: 'Phản hồi tự nhiên và gần gũi'
        },
        {
          id: 'C',
          text: 'Được rồi, tôi sẽ cân nhắc.',
          tags: ['đồng ý', 'thận trọng'],
          score: 0.7,
          explanation: 'Phản hồi thận trọng và suy nghĩ'
        }
      ]
    })),
  })),
}));

// Mock Redis for testing
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    setEx: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    mGet: jest.fn().mockResolvedValue([]),
    quit: jest.fn().mockResolvedValue('OK'),
  })),
}));

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.MODELS_PATH = '/tmp/test-models';
process.env.PROMPTS_PATH = '/tmp/test-prompts';