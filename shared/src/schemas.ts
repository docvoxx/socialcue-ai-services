// Zod schemas for validation
import { z } from 'zod';

// User Style Schema
export const UserStyleSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  vocabulary_level: z.enum(['formal', 'casual', 'mixed']),
  emoji_usage: z.enum(['none', 'minimal', 'frequent']),
  message_length: z.enum(['short', 'medium', 'long']),
  addressing_style: z.enum(['formal', 'informal']),
  preferred_tones: z.array(z.string()),
  styleProfile: z.object({
    tone: z.string(),
    formality: z.string(),
    verbosity: z.string(),
    preferences: z.record(z.any())
  }).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

// Response Candidate Schema
export const ResponseCandidateSchema = z.object({
  id: z.string(),
  text: z.string(),
  tags: z.array(z.string()),
  score: z.number(),
  explanation: z.string(),
  metadata: z.record(z.any()).optional()
});

// Sentiment Request Schema - Extended for sentiment service
export const SentimentRequestSchema = z.object({
  text: z.string().min(1).max(2048).optional(),
  candidates: z.array(ResponseCandidateSchema),
  target_tone: z.string().optional(),
  safety_level: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  context: z.string().optional(),
  return_scores: z.boolean().optional().default(false)
});

// RAG Context Schema
export const RAGChunkSchema = z.object({
  content: z.string(),
  source_id: z.object({
    kb: z.enum(['template', 'style', 'memory']),
    id: z.string(),
    score: z.number()
  }),
  score: z.number(),
  kb_type: z.string()
});

export const RAGContextSchema = z.object({
  query: z.string().optional(),
  chunks: z.array(RAGChunkSchema),
  total_tokens: z.number(),
  retrieval_time_ms: z.number().optional(),
  results: z.array(z.object({
    content: z.string(),
    score: z.number(),
    metadata: z.record(z.any())
  })).optional()
});

// LLM Generation Request Schema
export const GenerationRequestSchema = z.object({
  context: z.string(),
  scenario: z.string().optional(),
  goal: z.string().optional(),
  tone: z.string().optional(),
  user_style: UserStyleSchema,
  rag_context: RAGContextSchema,
  constraints: z.array(z.string()),
  model_version: z.string().optional(),
  prompt: z.string().min(1).max(4096).optional(),
  max_tokens: z.number().int().min(1).max(2048).optional().default(512),
  temperature: z.number().min(0).max(1).optional().default(0.7),
  n: z.number().int().min(1).max(5).optional().default(1)
});

// RAG Retrieve Request Schema
export const RAGRetrieveRequestSchema = z.object({
  query: z.string().min(1).max(512),
  top_k: z.number().int().min(1).max(20).optional().default(5),
  collection: z.string().optional().default('default')
});
