// Shared types for AI Services

// User Style types
export interface UserStyle {
  id?: string;
  userId?: string;
  vocabulary_level: 'formal' | 'casual' | 'mixed';
  emoji_usage: 'none' | 'minimal' | 'frequent';
  message_length: 'short' | 'medium' | 'long';
  addressing_style: 'formal' | 'informal';
  preferred_tones: string[];
  styleProfile?: {
    tone: string;
    formality: string;
    verbosity: string;
    preferences: Record<string, any>;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

// Knowledge Base Template
export interface KBTemplate {
  id: string;
  name?: string;
  scenario: string;
  content: string;
  tags: string[];
  category?: string;
  created_at: Date;
  metadata?: Record<string, any>;
}

// RAG Context
export interface RAGChunk {
  content: string;
  source_id: {
    kb: 'template' | 'style' | 'memory';
    id: string;
    score: number;
  };
  score: number;
  kb_type: string;
}

export interface RAGContext {
  query?: string;
  chunks: RAGChunk[];
  total_tokens: number;
  retrieval_time_ms?: number;
  results?: Array<{
    content: string;
    score: number;
    metadata: Record<string, any>;
  }>;
}

// LLM Generation types
export interface GenerationRequest {
  context: string;
  scenario?: string;
  goal?: string;
  tone?: string;
  user_style: UserStyle;
  rag_context: RAGContext;
  constraints: string[];
  model_version?: string;
  prompt?: string;
  max_tokens?: number;
  temperature?: number;
  n?: number;
}

export interface GenerationResponse {
  candidates: ResponseCandidate[];
  model_version: string;
  prompt_version?: string;
  generation_time_ms?: number;
  text?: string;
  texts?: string[];
  tokens_used?: number;
  model?: string;
  trace_id?: string;
}

export interface ResponseCandidate {
  id: string;
  text: string;
  tags: string[];
  score: number;
  explanation: string;
  metadata?: Record<string, any>;
}

// Sentiment types - Extended for sentiment service
export interface SentimentRequest {
  text?: string;
  candidates: ResponseCandidate[];
  target_tone?: string;
  safety_level?: 'low' | 'medium' | 'high';
  context?: string;
  return_scores?: boolean;
}

export interface SentimentResponse {
  sentiment?: 'positive' | 'negative' | 'neutral';
  confidence?: number;
  tone?: string;
  scores?: Record<string, number>;
  trace_id?: string;
  ranked_candidates?: ScoredCandidate[];
  safety_violations?: SafetyViolation[];
  rewrite_suggestions?: string[];
}

export interface ScoredCandidate {
  id: string;
  text: string;
  score: number;
  overall_score: number;
  safety_score: number;
  tone_score: number;
  sentiment_score: number;
  sentiment?: string;
  confidence?: number;
  explanation?: string;
  metadata?: Record<string, any>;
}

// Safety types
export interface SafetyViolation {
  candidate_id: string;
  violation_type: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  details?: Record<string, any>;
}
