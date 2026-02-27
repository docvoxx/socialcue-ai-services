import { ChromaClient, Collection } from 'chromadb';
import { DatabaseConnection, createServiceLogger, UserStyle } from '@socialcue-ai-services/shared';
// NOTE: @xenova/transformers is ESM-only and requires dynamic import or ESM setup
// Temporarily stubbed for deployment - will need proper ESM migration
// import { pipeline } from '@xenova/transformers';
import crypto from 'crypto';

const logger = createServiceLogger('rag-service:kb-manager');

// BM25 implementation for hybrid search
class BM25 {
  private k1: number = 1.2;
  private b: number = 0.75;
  private documents: string[] = [];
  private docFreqs: Map<string, number>[] = [];
  private idf: Map<string, number> = new Map();
  private avgDocLength: number = 0;

  constructor(documents: string[]) {
    this.documents = documents;
    this.buildIndex();
  }

  private tokenize(text: string): string[] {
    // Simple tokenization for Vietnamese text
    return text.toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(token => token.length > 0);
  }

  private buildIndex(): void {
    const docLengths: number[] = [];
    const termCounts = new Map<string, number>();

    // Build document frequency maps
    this.documents.forEach((doc, docIndex) => {
      const tokens = this.tokenize(doc);
      docLengths.push(tokens.length);
      
      const docTermFreq = new Map<string, number>();
      tokens.forEach(token => {
        docTermFreq.set(token, (docTermFreq.get(token) || 0) + 1);
        termCounts.set(token, (termCounts.get(token) || 0) + 1);
      });
      
      this.docFreqs[docIndex] = docTermFreq;
    });

    // Calculate average document length
    this.avgDocLength = docLengths.reduce((sum, len) => sum + len, 0) / docLengths.length;

    // Calculate IDF for each term
    const numDocs = this.documents.length;
    termCounts.forEach((count, term) => {
      this.idf.set(term, Math.log((numDocs - count + 0.5) / (count + 0.5)));
    });
  }

  score(query: string, docIndex: number): number {
    const queryTokens = this.tokenize(query);
    const docTermFreq = this.docFreqs[docIndex];
    const docLength = Array.from(docTermFreq.values()).reduce((sum, freq) => sum + freq, 0);

    let score = 0;
    queryTokens.forEach(token => {
      const termFreq = docTermFreq.get(token) || 0;
      const idf = this.idf.get(token) || 0;
      
      if (termFreq > 0) {
        const numerator = termFreq * (this.k1 + 1);
        const denominator = termFreq + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));
        score += idf * (numerator / denominator);
      }
    });

    return score;
  }
}

export interface RetrievedChunk {
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
  chunks: RetrievedChunk[];
  total_tokens: number;
  retrieval_time_ms: number;
}

export interface MemoryUpdate {
  user_id: string;
  content: string;
  context: Record<string, any>;
  idempotency_key?: string;
}

export class KnowledgeBaseManager {
  private chromaClient: ChromaClient;
  private templateCollection: Collection | null = null;
  private styleCollection: Collection | null = null;
  private memoryCollection: Collection | null = null;
  // STUB: embedder disabled for ESM compatibility
  // private embedder: any = null;

  constructor(
    private db: DatabaseConnection,
    chromaUrl: string
  ) {
    this.chromaClient = new ChromaClient({
      path: chromaUrl,
    });
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Knowledge Base Manager (STUB MODE - transformers disabled)', { service: 'rag-service:kb-manager' });

      // STUB: Skip embedding model initialization
      
      // Initialize ChromaDB collections
      await this.initializeCollections();
      
      // Skip template sync in stub mode
      
      logger.info('Knowledge Base Manager initialized successfully (stub mode)', { service: 'rag-service:kb-manager' });
    } catch (error) {
      logger.error('Failed to initialize Knowledge Base Manager', error instanceof Error ? error : new Error('Unknown error'), {
        service: 'rag-service:kb-manager'
      });
      throw error;
    }
  }

  private async initializeCollections(): Promise<void> {
    try {
      // Template KB Collection
      this.templateCollection = await this.chromaClient.getOrCreateCollection({
        name: 'template_kb',
        metadata: { description: 'Conversation templates and scenarios' },
      });

      // Style KB Collection  
      this.styleCollection = await this.chromaClient.getOrCreateCollection({
        name: 'style_kb',
        metadata: { description: 'User communication styles and preferences' },
      });

      // Memory KB Collection
      this.memoryCollection = await this.chromaClient.getOrCreateCollection({
        name: 'memory_kb',
        metadata: { description: 'User conversation history and facts' },
      });

      logger.info('ChromaDB collections initialized', { service: 'rag-service:kb-manager' });
    } catch (error) {
      logger.error('Failed to initialize ChromaDB collections', error instanceof Error ? error : new Error('Unknown error'), {
        service: 'rag-service:kb-manager'
      });
      throw error;
    }
  }

  // STUB: syncTemplateData disabled for deployment
  // private async syncTemplateData(): Promise<void> { ... }

  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      // STUB: Return dummy embeddings (384 dimensions for all-MiniLM-L6-v2)
      logger.warn('Using stub embeddings - transformers module disabled', {
        service: 'rag-service:kb-manager',
        textCount: texts.length
      });
      
      return texts.map(() => Array(384).fill(0).map(() => Math.random()));
    } catch (error) {
      logger.error('Failed to generate embeddings', undefined, {
        service: 'rag-service:kb-manager',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async retrieve(
    query: string,
    userId: string,
    kbTypes: ('template' | 'style' | 'memory')[],
    maxChunks: number = 10,
    maxTokens: number = 2000
  ): Promise<RAGContext> {
    const start = Date.now();
    
    try {
      logger.info('Starting RAG retrieval', {
        service: 'rag-service:kb-manager',
        userId,
        kbTypes,
        maxChunks,
        maxTokens,
        queryLength: query.length,
      });

      const chunks: RetrievedChunk[] = [];
      let totalTokens = 0;

      // Generate query embedding
      const queryEmbedding = await this.generateEmbeddings([query]);
      
      // Retrieve from each requested knowledge base
      for (const kbType of kbTypes) {
        const kbChunks = await this.retrieveFromKB(
          kbType,
          userId,
          queryEmbedding[0],
          Math.ceil(maxChunks / kbTypes.length),
          query
        );
        
        chunks.push(...kbChunks);
      }

      // Sort by relevance score and limit tokens
      chunks.sort((a, b) => b.score - a.score);
      
      const filteredChunks: RetrievedChunk[] = [];
      for (const chunk of chunks) {
        const chunkTokens = this.estimateTokens(chunk.content);
        if (totalTokens + chunkTokens <= maxTokens) {
          filteredChunks.push(chunk);
          totalTokens += chunkTokens;
        }
        
        if (filteredChunks.length >= maxChunks) {
          break;
        }
      }

      const retrievalTime = Date.now() - start;
      
      logger.info('RAG retrieval completed', {
        service: 'rag-service:kb-manager',
        userId,
        chunksRetrieved: filteredChunks.length,
        totalTokens,
        retrievalTime,
      });

      return {
        chunks: filteredChunks,
        total_tokens: totalTokens,
        retrieval_time_ms: retrievalTime,
      };
    } catch (error) {
      logger.error('RAG retrieval failed', error instanceof Error ? error : new Error('Unknown error'), {
        service: 'rag-service:kb-manager',
        userId,
      });
      throw error;
    }
  }

  private async retrieveFromKB(
    kbType: 'template' | 'style' | 'memory',
    userId: string,
    queryEmbedding: number[],
    limit: number,
    query: string
  ): Promise<RetrievedChunk[]> {
    try {
      let collection: Collection;
      let whereClause: any = {};

      switch (kbType) {
        case 'template':
          collection = this.templateCollection!;
          break;
        case 'style':
          collection = this.styleCollection!;
          whereClause = { user_id: userId };
          break;
        case 'memory':
          collection = this.memoryCollection!;
          whereClause = { user_id: userId };
          break;
        default:
          throw new Error(`Unknown KB type: ${kbType}`);
      }

      // Get more results for hybrid ranking (2x limit)
      const vectorResults = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: Math.min(limit * 2, 50), // Get more for hybrid ranking
        where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
      });

      const chunks: RetrievedChunk[] = [];
      
      if (vectorResults.documents && vectorResults.documents[0] && 
          vectorResults.distances && vectorResults.distances[0] && 
          vectorResults.ids && vectorResults.ids[0]) {
        
        const documents = vectorResults.documents[0].filter(doc => doc !== null) as string[];
        const distances = vectorResults.distances[0];
        const ids = vectorResults.ids[0];
        
        // Skip if no documents
        if (documents.length === 0) {
          return [];
        }

        // Initialize BM25 with retrieved documents
        const bm25 = new BM25(documents);
        
        // Calculate hybrid scores (BM25 + Vector similarity)
        const hybridScores: { index: number; score: number; content: string; id: string }[] = [];
        
        for (let i = 0; i < documents.length; i++) {
          const content = documents[i];
          const distance = distances[i];
          const id = ids[i];
          
          // Skip null content
          if (!content) continue;
          
          // Vector similarity score (1 - distance)
          const vectorScore = Math.max(0, 1 - distance);
          
          // BM25 score
          const bm25Score = bm25.score(query, i);
          
          // Hybrid score: weighted combination (60% vector, 40% BM25)
          const hybridScore = (0.6 * vectorScore) + (0.4 * Math.max(0, bm25Score / 10)); // Normalize BM25
          
          hybridScores.push({
            index: i,
            score: hybridScore,
            content,
            id,
          });
        }
        
        // Sort by hybrid score and take top results
        hybridScores.sort((a, b) => b.score - a.score);
        const topResults = hybridScores.slice(0, limit);
        
        // Create chunks with hybrid scores
        for (const result of topResults) {
          chunks.push({
            content: result.content,
            source_id: {
              kb: kbType,
              id: result.id,
              score: result.score,
            },
            score: result.score,
            kb_type: kbType,
          });
        }
      }

      return chunks;
    } catch (error) {
      logger.error(`Failed to retrieve from ${kbType} KB`, error instanceof Error ? error : new Error('Unknown error'), {
        service: 'rag-service:kb-manager',
        userId,
      });
      return [];
    }
  }

  async updateMemory(update: MemoryUpdate): Promise<void> {
    try {
      logger.info('Updating user memory', {
        service: 'rag-service:kb-manager',
        userId: update.user_id,
        contentLength: update.content.length,
        hasIdempotencyKey: !!update.idempotency_key,
      });

      // Generate idempotency key if not provided
      const idempotencyKey = update.idempotency_key || this.generateIdempotencyKey(update);

      // Check for duplicate using idempotency key
      const existing = await this.db.query(`
        SELECT id FROM kb_memories 
        WHERE user_id = $1 AND context->>'idempotency_key' = $2
      `, [update.user_id, idempotencyKey]);

      if (existing.length > 0) {
        logger.info('Memory update skipped - duplicate idempotency key', {
          service: 'rag-service:kb-manager',
          userId: update.user_id,
          idempotencyKey,
        });
        return;
      }

      // Insert into PostgreSQL
      const memoryId = crypto.randomUUID();
      const contextWithKey = {
        ...update.context,
        idempotency_key: idempotencyKey,
      };

      await this.db.query(`
        INSERT INTO kb_memories (id, user_id, content, context, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `, [memoryId, update.user_id, update.content, JSON.stringify(contextWithKey)]);

      // Generate embedding and add to ChromaDB
      const embedding = await this.generateEmbeddings([update.content]);
      
      await this.memoryCollection!.add({
        ids: [memoryId],
        documents: [update.content],
        embeddings: embedding,
        metadatas: [{
          user_id: update.user_id,
          context: JSON.stringify(contextWithKey),
          created_at: new Date().toISOString(),
        }],
      });

      logger.info('Memory updated successfully', {
        service: 'rag-service:kb-manager',
        userId: update.user_id,
        memoryId,
      });
    } catch (error) {
      logger.error('Failed to update memory', error instanceof Error ? error : new Error('Unknown error'), {
        service: 'rag-service:kb-manager',
        userId: update.user_id,
      });
      throw error;
    }
  }

  async updateUserStyle(userId: string, style: UserStyle): Promise<void> {
    try {
      logger.info('Updating user style', { 
        service: 'rag-service:kb-manager',
        userId 
      });

      // Upsert in PostgreSQL
      await this.db.query(`
        INSERT INTO user_styles (user_id, vocabulary_level, emoji_usage, message_length, addressing_style, preferred_tones, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          vocabulary_level = EXCLUDED.vocabulary_level,
          emoji_usage = EXCLUDED.emoji_usage,
          message_length = EXCLUDED.message_length,
          addressing_style = EXCLUDED.addressing_style,
          preferred_tones = EXCLUDED.preferred_tones,
          updated_at = NOW()
      `, [
        userId,
        style.vocabulary_level,
        style.emoji_usage,
        style.message_length,
        style.addressing_style,
        JSON.stringify(style.preferred_tones),
      ]);

      // Create style document for ChromaDB
      const styleDocument = this.createStyleDocument(style);
      const embedding = await this.generateEmbeddings([styleDocument]);

      // Check if style already exists in ChromaDB
      const existing = await this.styleCollection!.get({
        where: { user_id: userId },
      });

      if (existing.ids.length > 0) {
        // Update existing
        await this.styleCollection!.update({
          ids: existing.ids,
          documents: [styleDocument],
          embeddings: embedding,
          metadatas: [{
            user_id: userId,
            updated_at: new Date().toISOString(),
          }],
        });
      } else {
        // Add new
        await this.styleCollection!.add({
          ids: [crypto.randomUUID()],
          documents: [styleDocument],
          embeddings: embedding,
          metadatas: [{
            user_id: userId,
            updated_at: new Date().toISOString(),
          }],
        });
      }

      logger.info('User style updated successfully', { 
        service: 'rag-service:kb-manager',
        userId 
      });
    } catch (error) {
      logger.error('Failed to update user style', error instanceof Error ? error : new Error('Unknown error'), {
        service: 'rag-service:kb-manager',
        userId,
      });
      throw error;
    }
  }

  async getUserStyle(userId: string): Promise<UserStyle | null> {
    try {
      const result = await this.db.query(`
        SELECT vocabulary_level, emoji_usage, message_length, addressing_style, preferred_tones
        FROM user_styles 
        WHERE user_id = $1
      `, [userId]) as UserStyle[];

      if (result.length === 0) {
        return null;
      }

      return result[0];
    } catch (error) {
      logger.error('Failed to get user style', error instanceof Error ? error : new Error('Unknown error'), {
        service: 'rag-service:kb-manager',
        userId,
      });
      throw error;
    }
  }

  async clearUserMemory(userId: string): Promise<void> {
    try {
      logger.info('Clearing user memory', { 
        service: 'rag-service:kb-manager',
        userId 
      });

      // Delete from PostgreSQL
      await this.db.query(`DELETE FROM kb_memories WHERE user_id = $1`, [userId]);

      // Delete from ChromaDB
      await this.memoryCollection!.delete({
        where: { user_id: userId },
      });

      logger.info('User memory cleared successfully', { 
        service: 'rag-service:kb-manager',
        userId 
      });
    } catch (error) {
      logger.error('Failed to clear user memory', error instanceof Error ? error : new Error('Unknown error'), {
        service: 'rag-service:kb-manager',
        userId,
      });
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Check ChromaDB connection
      await this.chromaClient.heartbeat();
      
      // Check collections exist
      if (!this.templateCollection || !this.styleCollection || !this.memoryCollection) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Health check failed', error instanceof Error ? error : new Error('Unknown error'), {
        service: 'rag-service:kb-manager',
      });
      return false;
    }
  }

  private createStyleDocument(style: UserStyle): string {
    return `User prefers ${style.vocabulary_level} vocabulary, ${style.emoji_usage} emoji usage, ${style.message_length} messages, ${style.addressing_style} addressing style. Preferred tones: ${style.preferred_tones.join(', ')}.`;
  }

  private generateIdempotencyKey(update: MemoryUpdate): string {
    const data = `${update.user_id}:${update.content}:${JSON.stringify(update.context)}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters for Vietnamese text
    return Math.ceil(text.length / 4);
  }
}