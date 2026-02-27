import { createServiceLogger } from '@socialcue-ai-services/shared';
import { ResponseCandidate, GenerationRequest } from '@socialcue-ai-services/shared';
import { ModelManager } from './ModelManager';
import { PromptManager } from './PromptManager';

export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  timeout?: number;
}

export interface StyleVariation {
  formal: string;
  casual: string;
  confident: string;
  gentle: string;
}

export class ResponseGenerator {
  private logger = createServiceLogger('response-generator');
  private defaultOptions: GenerationOptions = {
    maxTokens: 1000,
    temperature: 0.7,
    topP: 0.9,
    stopSequences: ['\n\n---', 'Human:', 'Assistant:', '</response>'],
    timeout: 30000 // 30 seconds
  };

  constructor(
    private modelManager: ModelManager,
    private promptManager: PromptManager
  ) {}

  async generateCandidates(
    request: GenerationRequest,
    options?: Partial<GenerationOptions>
  ): Promise<ResponseCandidate[]> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const startTime = Date.now();

    try {
      this.logger.info('Starting candidate generation', {
        service: 'llm-service',
        scenario: request.scenario || 'none',
        goal: request.goal || 'none',
        tone: request.tone || 'none',
        ragChunks: request.rag_context.chunks.length
      });

      // Generate base candidates
      const baseCandidates = await this.generateBaseCandidates(request, mergedOptions);
      
      // Apply style variations
      const styledCandidates = await this.applyStyleVariations(baseCandidates, request);
      
      // Generate explanations
      const candidatesWithExplanations = await this.generateExplanations(styledCandidates, request);
      
      // Ensure semantic distinctness
      const distinctCandidates = this.ensureSemanticDistinctness(candidatesWithExplanations);
      
      // Validate and score candidates
      const finalCandidates = this.validateAndScoreCandidates(distinctCandidates);

      const generationTime = Date.now() - startTime;
      
      this.logger.info('Candidate generation completed', {
        service: 'llm-service',
        generationTime: `${generationTime}ms`,
        candidatesGenerated: finalCandidates.length,
        scenario: request.scenario || 'none'
      });

      return finalCandidates;

    } catch (error) {
      this.logger.error('Candidate generation failed', error as Error);
      throw error;
    }
  }

  private async generateBaseCandidates(
    request: GenerationRequest,
    options: GenerationOptions
  ): Promise<ResponseCandidate[]> {
    const modelName = request.model_version || this.modelManager.getCurrentModel();
    if (!modelName) {
      throw new Error('No model available for generation');
    }

    const sessionId = await this.modelManager.createChatSession(modelName);
    
    try {
      // Build the main prompt
      const prompt = this.promptManager.buildPrompt('suggest-vietnamese', {
        conversation_context: request.context,
        rag_context: request.rag_context,
        user_style: request.user_style,
        constraints: request.constraints,
        scenario: request.scenario || 'none',
        goal: request.goal || 'none',
        tone: request.tone || 'none'
      });

      const session = this.modelManager.getChatSession(sessionId);
      if (!session) {
        throw new Error('Chat session not found');
      }

      // Generate response with timeout
      const response = await Promise.race([
        session.prompt(prompt, {
          maxTokens: options.maxTokens || 150,
          temperature: options.temperature || 0.7,
          topP: options.topP || 0.9
          // Note: stopSequences not supported in this llama.cpp version
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Generation timeout')), options.timeout)
        )
      ]);

      // Parse the response
      const candidates = this.parseGenerationResponse(response);
      
      this.logger.debug('Base candidates generated', {
        service: 'llm-service',
        candidatesCount: candidates.length,
        responseLength: response.length
      });

      return candidates;

    } finally {
      await this.modelManager.disposeChatSession(sessionId);
    }
  }

  private parseGenerationResponse(response: string): ResponseCandidate[] {
    try {
      // Clean up the response
      let cleanResponse = response.trim();
      
      // Remove markdown code blocks
      cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      // Try to extract JSON from the response
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanResponse = jsonMatch[0];
      }

      const parsed = JSON.parse(cleanResponse);
      
      if (!parsed.candidates || !Array.isArray(parsed.candidates)) {
        throw new Error('Invalid response format: missing candidates array');
      }

      // Validate and normalize candidates
      const candidates: ResponseCandidate[] = parsed.candidates.map((candidate: any, index: number) => {
        return {
          id: candidate.id || ['A', 'B', 'C'][index] || `${index + 1}`,
          text: candidate.text || 'Xin lỗi, tôi không thể tạo phản hồi phù hợp.',
          tags: Array.isArray(candidate.tags) ? candidate.tags.slice(0, 5) : [],
          score: this.normalizeScore(candidate.score),
          explanation: this.normalizeExplanation(candidate.explanation)
        };
      });

      // Ensure we have exactly 3 candidates
      while (candidates.length < 3) {
        candidates.push(this.createFallbackCandidate(candidates.length));
      }

      return candidates.slice(0, 3);

    } catch (error) {
      this.logger.error('Failed to parse generation response', error as Error, { 
        service: 'llm-service',
        response: response.substring(0, 200) + '...' 
      });
      
      // Return fallback candidates
      return this.getFallbackCandidates();
    }
  }

  private normalizeScore(score: any): number {
    if (typeof score === 'number' && !isNaN(score)) {
      return Math.max(0, Math.min(1, score));
    }
    return 0.5; // Default score
  }

  private normalizeExplanation(explanation: any): string {
    if (typeof explanation === 'string' && explanation.trim()) {
      // Limit to 80 characters or 12 words
      const trimmed = explanation.trim();
      if (trimmed.length <= 80) {
        const words = trimmed.split(/\s+/);
        if (words.length <= 12) {
          return trimmed;
        }
        return words.slice(0, 12).join(' ') + '...';
      }
      return trimmed.substring(0, 77) + '...';
    }
    return 'Gợi ý phù hợp với ngữ cảnh';
  }

  private async applyStyleVariations(
    candidates: ResponseCandidate[],
    request: GenerationRequest
  ): Promise<ResponseCandidate[]> {
    // Apply style variations based on user preferences
    const styledCandidates = candidates.map((candidate, index) => {
      const variation = this.getStyleVariation(candidate.text, request.user_style, index);
      
      return {
        ...candidate,
        text: variation,
        tags: this.updateTagsForStyle(candidate.tags, request.user_style, index)
      };
    });

    return styledCandidates;
  }

  private getStyleVariation(text: string, userStyle: any, index: number): string {
    // Apply different style variations to each candidate
    switch (index) {
      case 0: // Candidate A - Most formal/polite
        return this.applyFormalStyle(text, userStyle);
      case 1: // Candidate B - Balanced/natural
        return this.applyBalancedStyle(text, userStyle);
      case 2: // Candidate C - More casual/friendly
        return this.applyCasualStyle(text, userStyle);
      default:
        return text;
    }
  }

  private applyFormalStyle(text: string, userStyle: any): string {
    if (userStyle.vocabulary_level === 'formal' || userStyle.addressing_style === 'formal') {
      // Already formal, return as is
      return text;
    }
    
    // Make more formal
    let formalText = text;
    
    // Replace casual greetings
    formalText = formalText.replace(/hi|hello|chào/gi, 'Xin chào');
    formalText = formalText.replace(/ok|okay/gi, 'được rồi');
    
    return formalText;
  }

  private applyBalancedStyle(text: string, _userStyle: any): string {
    // Keep balanced approach
    return text;
  }

  private applyCasualStyle(text: string, userStyle: any): string {
    if (userStyle.vocabulary_level === 'casual' && userStyle.emoji_usage !== 'none') {
      // Add appropriate emoji based on context
      if (text.includes('cảm ơn')) {
        return text + ' 😊';
      } else if (text.includes('xin lỗi')) {
        return text + ' 😅';
      } else if (text.includes('chào')) {
        return text + ' 👋';
      }
    }
    
    return text;
  }

  private updateTagsForStyle(tags: string[], _userStyle: any, index: number): string[] {
    const styleTags = [...tags];
    
    switch (index) {
      case 0:
        if (!styleTags.includes('lịch sự')) styleTags.push('lịch sự');
        break;
      case 1:
        if (!styleTags.includes('cân bằng')) styleTags.push('cân bằng');
        break;
      case 2:
        if (!styleTags.includes('thân thiện')) styleTags.push('thân thiện');
        break;
    }
    
    return styleTags.slice(0, 5);
  }

  private async generateExplanations(
    candidates: ResponseCandidate[],
    request: GenerationRequest
  ): Promise<ResponseCandidate[]> {
    // Generate explanations for candidates that don't have them
    return candidates.map(candidate => {
      if (!candidate.explanation || candidate.explanation === 'Gợi ý phù hợp với ngữ cảnh') {
        candidate.explanation = this.generateExplanation(candidate, request);
      }
      return candidate;
    });
  }

  private generateExplanation(candidate: ResponseCandidate, _request: GenerationRequest): string {
    const explanations = [
      'Lịch sự và chuyên nghiệp',
      'Tự nhiên và thân thiện',
      'Ngắn gọn và rõ ràng',
      'Phù hợp với ngữ cảnh',
      'Thể hiện sự quan tâm',
      'Tôn trọng và lịch thiệp',
      'Gần gũi và ấm áp',
      'Chính thức và trang trọng'
    ];

    // Select explanation based on tags and context
    if (candidate.tags.includes('lịch sự')) {
      return 'Lịch sự và chuyên nghiệp';
    } else if (candidate.tags.includes('thân thiện')) {
      return 'Tự nhiên và thân thiện';
    } else if (candidate.tags.includes('ngắn gọn')) {
      return 'Ngắn gọn và rõ ràng';
    }

    // Default explanation
    return explanations[Math.floor(Math.random() * explanations.length)];
  }

  private ensureSemanticDistinctness(candidates: ResponseCandidate[]): ResponseCandidate[] {
    const distinctCandidates: ResponseCandidate[] = [];
    const similarityThreshold = 0.7;

    for (const candidate of candidates) {
      let isDistinct = true;
      
      for (const existing of distinctCandidates) {
        if (this.calculateSemanticSimilarity(candidate.text, existing.text) > similarityThreshold) {
          isDistinct = false;
          break;
        }
      }
      
      if (isDistinct) {
        distinctCandidates.push(candidate);
      } else {
        // Modify the candidate to make it distinct
        const modifiedCandidate = this.modifyForDistinctness(candidate, distinctCandidates);
        distinctCandidates.push(modifiedCandidate);
      }
    }

    // Ensure we have exactly 3 distinct candidates
    while (distinctCandidates.length < 3) {
      distinctCandidates.push(this.createFallbackCandidate(distinctCandidates.length));
    }

    return distinctCandidates.slice(0, 3);
  }

  private calculateSemanticSimilarity(text1: string, text2: string): number {
    // Simple word-based similarity calculation
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private modifyForDistinctness(candidate: ResponseCandidate, existing: ResponseCandidate[]): ResponseCandidate {
    // Add variation to make the candidate distinct
    const variations = [
      (text: string) => `Theo tôi, ${text.toLowerCase()}`,
      (text: string) => `${text} Bạn nghĩ sao?`,
      (text: string) => `Có lẽ ${text.toLowerCase()}`,
      (text: string) => `${text} Cảm ơn bạn.`,
    ];

    let modifiedText = candidate.text;
    let attempts = 0;
    
    while (attempts < variations.length) {
      const variation = variations[attempts];
      const testText = variation(candidate.text);
      
      let isDistinct = true;
      for (const existingCandidate of existing) {
        if (this.calculateSemanticSimilarity(testText, existingCandidate.text) > 0.7) {
          isDistinct = false;
          break;
        }
      }
      
      if (isDistinct) {
        modifiedText = testText;
        break;
      }
      
      attempts++;
    }

    return {
      ...candidate,
      text: modifiedText,
      explanation: 'Biến thể để tạo sự đa dạng'
    };
  }

  private validateAndScoreCandidates(candidates: ResponseCandidate[]): ResponseCandidate[] {
    return candidates.map((candidate, index) => {
      // Ensure proper ID assignment
      candidate.id = ['A', 'B', 'C'][index];
      
      // Validate text length (not too short or too long)
      if (candidate.text.length < 5) {
        candidate.text = 'Cảm ơn bạn đã chia sẻ.';
        candidate.score = 0.3;
      } else if (candidate.text.length > 200) {
        candidate.text = candidate.text.substring(0, 197) + '...';
      }

      // Adjust scores based on quality indicators
      candidate.score = this.calculateQualityScore(candidate);
      
      return candidate;
    });
  }

  private calculateQualityScore(candidate: ResponseCandidate): number {
    let score = candidate.score || 0.5;
    
    // Adjust based on text quality
    if (candidate.text.length > 10 && candidate.text.length < 150) {
      score += 0.1;
    }
    
    // Adjust based on tags
    if (candidate.tags.length > 0) {
      score += 0.05;
    }
    
    // Adjust based on explanation quality
    if (candidate.explanation && candidate.explanation.length > 10) {
      score += 0.05;
    }
    
    return Math.max(0, Math.min(1, score));
  }

  private createFallbackCandidate(index: number): ResponseCandidate {
    const fallbacks = [
      {
        text: 'Cảm ơn bạn đã chia sẻ.',
        tags: ['lịch sự', 'cảm ơn'],
        explanation: 'Phản hồi lịch sự và an toàn'
      },
      {
        text: 'Tôi hiểu ý bạn.',
        tags: ['thấu hiểu', 'đồng cảm'],
        explanation: 'Thể hiện sự hiểu biết'
      },
      {
        text: 'Điều đó thật thú vị.',
        tags: ['tích cực', 'quan tâm'],
        explanation: 'Phản hồi tích cực'
      }
    ];

    const fallback = fallbacks[index % fallbacks.length];
    
    return {
      id: ['A', 'B', 'C'][index],
      text: fallback.text,
      tags: fallback.tags,
      score: 0.5,
      explanation: fallback.explanation
    };
  }

  private getFallbackCandidates(): ResponseCandidate[] {
    return [
      this.createFallbackCandidate(0),
      this.createFallbackCandidate(1),
      this.createFallbackCandidate(2)
    ];
  }
}