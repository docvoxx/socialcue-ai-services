import { logger } from '@socialcue-ai-services/shared';

export interface ToneClassificationResult {
  label: string;
  score: number;
}

export class ToneClassifier {
  private sentimentAnalyzer: any = null;
  private isInitialized = false;
  private serviceName = 'sentiment-service';

  // Vietnamese tone labels as per requirements
  private readonly TONE_LABELS = ['polite', 'formal', 'genz', 'confident', 'soft'];
  
  // Enhanced tone mapping for Vietnamese communication patterns
  private readonly TONE_KEYWORDS = {
    polite: [
      // High-weight polite indicators
      'xin chào', 'cảm ơn', 'xin lỗi', 'làm ơn', 'xin phép', 'dạ vâng', 'kính chào',
      // Medium-weight polite indicators  
      'dạ', 'ạ', 'em', 'anh', 'chị', 'thưa', 'kính', 'xin', 'cảm', 'ơn',
      // Context-specific polite phrases
      'em xin', 'anh ơi', 'chị ơi', 'xin được', 'được không', 'có thể không',
      'em muốn', 'cho em', 'giúp em', 'hỏi chút', 'phiền anh', 'phiền chị'
    ],
    formal: [
      // High-weight formal indicators
      'kính thưa', 'trân trọng', 'kính gửi', 'tôn kính', 'kính mời', 'kính báo',
      // Medium-weight formal indicators
      'thưa', 'quý', 'kính', 'trân', 'trọng', 'công ty', 'tổ chức', 'ban lãnh đạo',
      // Business/formal context
      'hợp tác', 'doanh nghiệp', 'khách hàng', 'đối tác', 'báo cáo', 'thông báo',
      'đề xuất', 'kiến nghị', 'tham khảo', 'xem xét', 'phê duyệt'
    ],
    genz: [
      // High-weight GenZ indicators
      'hi', 'hello', 'ok', 'yeah', 'cool', 'nice', 'wow', 'omg', 'lol',
      // Medium-weight GenZ indicators
      'hey', 'sup', 'yo', 'bro', 'sis', 'bestie', 'crush', 'flex', 'vibe',
      // Vietnamese GenZ slang
      'oke', 'okie', 'okela', 'mình', 'tui', 'tao', 'mày', 'bạn ơi',
      'project', 'team', 'meeting', 'deadline', 'update', 'check'
    ],
    confident: [
      // High-weight confident indicators
      'chắc chắn', 'tự tin', 'quyết định', 'khẳng định', 'cam kết', 'đảm bảo',
      // Medium-weight confident indicators
      'chắc', 'tin', 'quyết', 'chắc là', 'tôi sẽ', 'mình sẽ', 'hoàn toàn',
      'tuyệt đối', 'nhất định', 'chắc chắn sẽ', 'không nghi ngờ gì',
      // Action-oriented confident phrases
      'tôi có thể', 'tôi sẽ làm', 'không vấn đề', 'dễ dàng', 'thành công'
    ],
    soft: [
      // High-weight soft indicators
      'có lẽ', 'có thể', 'nếu được', 'mong', 'hy vọng', 'nhẹ nhàng', 'từ từ',
      // Medium-weight soft indicators
      'lẽ', 'thể', 'được', 'mong rằng', 'hy vọng rằng', 'có thể là',
      'nếu có thể', 'nếu được thì', 'có lẽ là', 'chắc có lẽ',
      // Tentative expressions
      'có vẻ', 'dường như', 'có thể sẽ', 'có lẽ sẽ', 'chắc là sẽ',
      'xin phép', 'nếu anh/chị không phiền', 'nếu tiện'
    ]
  };

  async initialize() {
    if (this.isInitialized) return;

    try {
      logger.info('Initializing tone classifier models...', { service: this.serviceName });
      
      // For testing purposes, we'll use a mock sentiment analyzer
      // In production, this would initialize the actual transformers pipeline
      this.sentimentAnalyzer = {
        predict: async (_text: string) => [{ label: 'POSITIVE', score: 0.8 }]
      };

      this.isInitialized = true;
      
      logger.info('Tone classifier models initialized successfully', { service: this.serviceName });
    } catch (error) {
      logger.error('Failed to initialize tone classifier:', error as Error, { service: this.serviceName });
      throw error;
    }
  }

  async scoreTone(text: string, targetTone: string): Promise<number> {
    await this.initialize();

    try {
      // Rule-based tone scoring for Vietnamese
      const score = this.calculateToneScore(text, targetTone);
      
      logger.debug('Tone scoring completed', {
        service: this.serviceName,
        text: text.substring(0, 50),
        targetTone,
        score,
      });

      return Math.max(0, Math.min(1, score));
    } catch (error) {
      logger.error('Error in tone scoring:', error as Error, { service: this.serviceName });
      return 0.5; // Default neutral score
    }
  }

  async scoreSentiment(text: string, context: string): Promise<number> {
    await this.initialize();

    try {
      if (!this.sentimentAnalyzer) {
        throw new Error('Sentiment analyzer not initialized');
      }

      // Analyze sentiment of the text
      const result = await this.sentimentAnalyzer.predict(text);
      const sentimentScore = result[0]?.score || 0.5;
      const sentimentLabel = result[0]?.label || 'NEUTRAL';

      // Adjust score based on context appropriateness
      const contextScore = this.calculateContextAppropriatenesss(text, context);
      
      // Combine sentiment and context scores
      const finalScore = (sentimentScore * 0.7) + (contextScore * 0.3);

      logger.debug('Sentiment scoring completed', {
        service: this.serviceName,
        text: text.substring(0, 50),
        sentimentLabel,
        sentimentScore,
        contextScore,
        finalScore,
      });

      return Math.max(0, Math.min(1, finalScore));
    } catch (error) {
      logger.error('Error in sentiment scoring:', error as Error, { service: this.serviceName });
      return 0.5; // Default neutral score
    }
  }

  async classifyTone(text: string): Promise<ToneClassificationResult[]> {
    await this.initialize();

    const results: ToneClassificationResult[] = [];
    
    for (const tone of this.TONE_LABELS) {
      const score = this.calculateToneScore(text, tone);
      results.push({ label: tone, score });
    }

    // Sort by score descending
    return results.sort((a, b) => b.score - a.score);
  }

  private calculateToneScore(text: string, targetTone: string): number {
    const lowerText = text.toLowerCase();
    const keywords = this.TONE_KEYWORDS[targetTone as keyof typeof this.TONE_KEYWORDS] || [];
    
    let score = 0.2; // Very low base score
    
    // Simple but effective keyword matching
    let keywordScore = 0;
    let matchCount = 0;
    
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        matchCount++;
        // Give higher scores for longer, more specific keywords
        const keywordWeight = Math.min(0.3, keyword.length * 0.02);
        keywordScore += keywordWeight;
      }
    }
    
    score += keywordScore;
    
    // Tone-specific rules - simplified and more targeted
    switch (targetTone) {
      case 'polite':
        // Strong polite indicators
        if (lowerText.includes('xin chào')) score += 0.6;
        if (lowerText.includes('cảm ơn')) score += 0.6;
        if (lowerText.includes('xin lỗi')) score += 0.6;
        if (lowerText.includes('xin phép')) score += 0.5;
        if (lowerText.includes('làm ơn')) score += 0.5;
        
        // Polite particles
        if (lowerText.includes(' ạ') || lowerText.endsWith('ạ')) score += 0.4;
        if (lowerText.includes('dạ ') || lowerText.startsWith('dạ')) score += 0.4;
        
        // Polite pronouns
        if (lowerText.includes('em ') && (lowerText.includes('anh') || lowerText.includes('chị'))) score += 0.3;
        if (lowerText.includes('thưa')) score += 0.3;
        
        // Penalty for informal
        if (lowerText.includes('hi ') || lowerText.includes('hey')) score -= 0.3;
        break;
        
      case 'formal':
        // Very strong formal indicators
        if (lowerText.includes('kính thưa')) score += 0.8;
        if (lowerText.includes('trân trọng')) score += 0.8;
        if (lowerText.includes('kính gửi')) score += 0.7;
        if (lowerText.includes('tôn kính')) score += 0.7;
        if (lowerText.includes('kính báo')) score += 0.6;
        if (lowerText.includes('kính mời')) score += 0.6;
        
        // Business formal
        if (lowerText.includes('quý ')) score += 0.4;
        if (lowerText.includes('ban lãnh đạo')) score += 0.4;
        if (lowerText.includes('công ty')) score += 0.2;
        
        // Strong penalty for casual
        if (lowerText.includes('hi ') || lowerText.includes('hey') || lowerText.includes('ok ')) score -= 0.5;
        if (lowerText.includes('mình') || lowerText.includes('tui')) score -= 0.4;
        break;
        
      case 'genz':
        // Strong GenZ indicators
        if (lowerText.includes('hi ') || lowerText.startsWith('hi')) score += 0.6;
        if (lowerText.includes('ok ') || lowerText.includes(' ok') || lowerText.endsWith('ok')) score += 0.5;
        if (lowerText.includes('cool')) score += 0.5;
        if (lowerText.includes('nice')) score += 0.5;
        if (lowerText.includes('yeah')) score += 0.5;
        if (lowerText.includes('wow')) score += 0.5;
        if (lowerText.includes('omg')) score += 0.6;
        
        // Vietnamese GenZ
        if (lowerText.includes('mình')) score += 0.4;
        if (lowerText.includes('bạn ơi')) score += 0.4;
        
        // Tech terms
        if (lowerText.includes('project')) score += 0.3;
        if (lowerText.includes('team')) score += 0.3;
        if (lowerText.includes('meeting')) score += 0.3;
        
        // Exclamation bonus
        if (lowerText.includes('!')) score += 0.2;
        
        // Strong penalty for formal
        if (lowerText.includes('kính') || lowerText.includes('trân trọng')) score -= 0.6;
        break;
        
      case 'confident':
        // Strong confident indicators
        if (lowerText.includes('chắc chắn')) score += 0.7;
        if (lowerText.includes('tự tin')) score += 0.7;
        if (lowerText.includes('quyết định')) score += 0.6;
        if (lowerText.includes('khẳng định')) score += 0.6;
        if (lowerText.includes('cam kết')) score += 0.6;
        if (lowerText.includes('đảm bảo')) score += 0.6;
        
        // Action confidence
        if (lowerText.includes('tôi sẽ') || lowerText.includes('mình sẽ')) score += 0.4;
        if (lowerText.includes('không vấn đề')) score += 0.5;
        if (lowerText.includes('hoàn toàn')) score += 0.4;
        if (lowerText.includes('thành công')) score += 0.3;
        
        // Strong penalty for uncertainty
        if (lowerText.includes('có lẽ') || lowerText.includes('có thể')) score -= 0.5;
        if (lowerText.includes('mong') || lowerText.includes('hy vọng')) score -= 0.4;
        break;
        
      case 'soft':
        // Strong soft indicators
        if (lowerText.includes('có lẽ')) score += 0.7;
        if (lowerText.includes('có thể')) score += 0.6;
        if (lowerText.includes('mong')) score += 0.6;
        if (lowerText.includes('hy vọng')) score += 0.6;
        if (lowerText.includes('nếu được')) score += 0.5;
        
        // Tentative expressions
        if (lowerText.includes('có vẻ')) score += 0.4;
        if (lowerText.includes('dường như')) score += 0.4;
        if (lowerText.includes('xin phép')) score += 0.4;
        
        // Strong penalty for confidence
        if (lowerText.includes('chắc chắn') || lowerText.includes('tự tin')) score -= 0.6;
        if (lowerText.includes('quyết định') || lowerText.includes('khẳng định')) score -= 0.5;
        break;
    }
    
    // Bonus for multiple matches
    if (matchCount >= 2) {
      score += 0.1 * matchCount;
    }
    
    return Math.max(0, Math.min(1, score));
  }

  private calculateContextAppropriatenesss(text: string, context: string): number {
    const lowerText = text.toLowerCase();
    const lowerContext = context.toLowerCase();
    
    let score = 0.6; // Slightly higher base score
    
    // Check for context-appropriate language with improved scoring
    if (lowerContext.includes('công việc') || lowerContext.includes('sếp') || lowerContext.includes('work')) {
      // Work context - prefer formal/polite language
      if (lowerText.includes('anh') || lowerText.includes('chị')) score += 0.25;
      if (lowerText.includes('em')) score += 0.2;
      if (lowerText.includes('xin') || lowerText.includes('cảm ơn')) score += 0.15;
      if (lowerText.includes('dạ') || lowerText.includes('ạ')) score += 0.1;
      // Penalize overly casual language in work context
      if (lowerText.includes('hi') || lowerText.includes('hey')) score -= 0.15;
    }
    
    if (lowerContext.includes('bạn bè') || lowerContext.includes('casual') || lowerContext.includes('friend')) {
      // Casual context - allow more relaxed language
      if (lowerText.includes('hi') || lowerText.includes('hey')) score += 0.15;
      if (lowerText.includes('mình')) score += 0.1;
      if (!lowerText.includes('kính thưa')) score += 0.1; // Not overly formal
      // Don't penalize casual language as much
    }
    
    if (lowerContext.includes('meeting') || lowerContext.includes('họp')) {
      // Meeting context - prefer professional tone
      if (lowerText.match(/\b(báo cáo|thảo luận|đề xuất)\b/)) score += 0.15;
      if (lowerText.includes('chúng ta') || lowerText.includes('team')) score += 0.1;
    }
    
    // Check for emotional appropriateness with better context matching
    if (lowerContext.includes('xin lỗi') || lowerContext.includes('sorry') || lowerContext.includes('apologize')) {
      if (lowerText.includes('xin lỗi') || lowerText.includes('sorry')) score += 0.25;
      if (lowerText.includes('em sai') || lowerText.includes('my mistake')) score += 0.15;
    }
    
    if (lowerContext.includes('cảm ơn') || lowerContext.includes('thank')) {
      if (lowerText.includes('cảm ơn') || lowerText.includes('thank')) score += 0.25;
      if (lowerText.includes('rất biết ơn') || lowerText.includes('appreciate')) score += 0.15;
    }
    
    // Check for request context
    if (lowerContext.includes('yêu cầu') || lowerContext.includes('request') || lowerContext.includes('hỏi')) {
      if (lowerText.includes('có thể') || lowerText.includes('could you')) score += 0.15;
      if (lowerText.includes('làm ơn') || lowerText.includes('please')) score += 0.15;
    }
    
    return Math.max(0, Math.min(1, score));
  }

  // Method to get macro-F1 score for testing purposes
  async evaluateOnDataset(testData: Array<{text: string, expectedTone: string}>): Promise<number> {
    const predictions: string[] = [];
    const actuals: string[] = [];
    
    for (const sample of testData) {
      const toneResults = await this.classifyTone(sample.text);
      const predictedTone = toneResults[0]?.label || 'unknown';
      
      predictions.push(predictedTone);
      actuals.push(sample.expectedTone);
    }
    
    // Calculate macro-F1 score
    const f1Scores: number[] = [];
    
    for (const tone of this.TONE_LABELS) {
      const tp = predictions.filter((p, i) => p === tone && actuals[i] === tone).length;
      const fp = predictions.filter((p, i) => p === tone && actuals[i] !== tone).length;
      const fn = predictions.filter((p, i) => p !== tone && actuals[i] === tone).length;
      
      const precision = tp / (tp + fp) || 0;
      const recall = tp / (tp + fn) || 0;
      const f1 = (2 * precision * recall) / (precision + recall) || 0;
      
      f1Scores.push(f1);
    }
    
    const macroF1 = f1Scores.reduce((sum, f1) => sum + f1, 0) / f1Scores.length;
    
    logger.info('Tone classification evaluation completed', {
      service: this.serviceName,
      macroF1,
      f1Scores,
      sampleCount: testData.length,
    });
    
    return macroF1;
  }
}