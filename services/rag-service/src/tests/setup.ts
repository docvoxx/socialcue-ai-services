// Jest setup file for RAG service tests

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.POSTGRES_URL = 'postgresql://test:test@localhost:5432/test';
process.env.CHROMADB_URL = 'http://localhost:8000';
process.env.REDIS_URL = 'redis://localhost:6379';

// Global test timeout
jest.setTimeout(10000);