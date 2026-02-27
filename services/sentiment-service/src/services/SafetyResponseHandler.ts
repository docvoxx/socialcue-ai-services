import { SafetyViolation, ScoredCandidate } from '@socialcue-ai-services/shared';
import { SafetyLogger } from './SafetyLogger';
import { logger } from '@socialcue-ai-services/shared';

export interface SafetyResponse {
  action: 'allow' | 'block' | 'rewrite' | 'flag';
  modifiedCandidates: ScoredCandidate[];
  safeAlternatives: string[];
  errorMessage?: string | undefined;
}

export class SafetyResponseHandler {
  private safetyLogger: SafetyLogger;

  constructor() {
    this.safetyLogger = new SafetyLogger();
  }

  /**
   * Handles safety violations and determines appropriate response
   * Implements Requirements 4.3, 4.5, 4.6: Safety violation response handling
   */
  handleSafetyViolations(
    candidates: ScoredCandidate[],
    violations: SafetyViolation[],
    requestId: string,
    context: string,
    userId?: string
  ): SafetyResponse {
    const startTime = Date.now();

    // Group violations by candidate
    const violationsByCandidate = this.groupViolationsByCandidate(violations);
    
    // Determine action based on violation severity
    const action = this.determineAction(violations);
    
    let modifiedCandidates: ScoredCandidate[] = [];
    let safeAlternatives: string[] = [];
    let errorMessage: string | undefined;

    switch (action) {
      case 'block':
        // Block all candidates with high-severity violations
        modifiedCandidates = this.blockUnsafeCandidates(candidates, violationsByCandidate);
        safeAlternatives = this.generateSafeAlternatives(context);
        errorMessage = this.generateErrorMessage(violations);
        break;

      case 'rewrite':
        // Attempt to rewrite problematic candidates
        modifiedCandidates = this.rewriteUnsafeCandidates(candidates, violationsByCandidate);
        break;

      case 'flag':
        // Flag but allow candidates with lower severity violations
        modifiedCandidates = this.flagUnsafeCandidates(candidates, violationsByCandidate);
        break;

      case 'allow':
      default:
        // Allow all candidates (no significant violations)
        modifiedCandidates = candidates;
        break;
    }

    // Log all safety interventions
    this.logSafetyInterventions(violations, requestId, context, action, candidates, userId);

    const processingTime = Date.now() - startTime;

    logger.info('Safety response handling completed', {
      service: 'sentiment-service',
      requestId,
      action,
      violationCount: violations.length,
      originalCandidateCount: candidates.length,
      modifiedCandidateCount: modifiedCandidates.length,
      safeAlternativeCount: safeAlternatives.length,
      processingTime,
    });

    return {
      action,
      modifiedCandidates,
      safeAlternatives,
      errorMessage,
    };
  }

  private groupViolationsByCandidate(violations: SafetyViolation[]): Map<string, SafetyViolation[]> {
    const grouped = new Map<string, SafetyViolation[]>();
    
    for (const violation of violations) {
      const candidateId = violation.candidate_id;
      if (!grouped.has(candidateId)) {
        grouped.set(candidateId, []);
      }
      grouped.get(candidateId)!.push(violation);
    }
    
    return grouped;
  }

  private determineAction(violations: SafetyViolation[]): 'allow' | 'block' | 'rewrite' | 'flag' {
    if (violations.length === 0) {
      return 'allow';
    }

    // Check for high-severity violations that require blocking
    const highSeverityViolations = violations.filter(v => v.severity === 'high');
    if (highSeverityViolations.length > 0) {
      // Always block prompt injection, self-harm, and harassment
      const criticalViolations = highSeverityViolations.filter(v => 
        ['prompt_injection', 'self_harm', 'harassment'].includes(v.violation_type)
      );
      
      if (criticalViolations.length > 0) {
        return 'block';
      }
      
      // For other high-severity violations, try rewriting first
      return 'rewrite';
    }

    // Medium severity violations - attempt rewriting
    const mediumSeverityViolations = violations.filter(v => v.severity === 'medium');
    if (mediumSeverityViolations.length > 0) {
      return 'rewrite';
    }

    // Low severity violations - just flag
    return 'flag';
  }

  private blockUnsafeCandidates(
    candidates: ScoredCandidate[],
    violationsByCandidate: Map<string, SafetyViolation[]>
  ): ScoredCandidate[] {
    return candidates.filter(candidate => {
      const violations = violationsByCandidate.get(candidate.id) || [];
      const hasHighSeverity = violations.some(v => v.severity === 'high');
      const hasCriticalViolation = violations.some(v => 
        ['prompt_injection', 'self_harm', 'harassment'].includes(v.violation_type)
      );
      
      // Block candidates with critical violations
      return !(hasHighSeverity && hasCriticalViolation);
    });
  }

  private rewriteUnsafeCandidates(
    candidates: ScoredCandidate[],
    violationsByCandidate: Map<string, SafetyViolation[]>
  ): ScoredCandidate[] {
    const rewrittenCandidates: ScoredCandidate[] = [];

    for (const candidate of candidates) {
      const violations = violationsByCandidate.get(candidate.id) || [];
      
      if (violations.length === 0) {
        // No violations, keep as is
        rewrittenCandidates.push(candidate);
      } else {
        // Attempt to rewrite
        const rewritten = this.rewriteCandidate(candidate, violations);
        rewrittenCandidates.push(rewritten);
      }
    }

    return rewrittenCandidates;
  }

  private rewriteCandidate(
    candidate: ScoredCandidate,
    violations: SafetyViolation[]
  ): ScoredCandidate {
    let rewrittenText = candidate.text;
    
    // Apply simple rewriting rules based on violation types
    for (const violation of violations) {
      switch (violation.violation_type) {
        case 'offensive_content':
          rewrittenText = this.removeOffensiveContent(rewrittenText);
          break;
        case 'excessive_flirtation':
          rewrittenText = this.toneDownFlirtation(rewrittenText);
          break;
        case 'inappropriate_legal_advice':
          rewrittenText = this.disclaimLegalAdvice(rewrittenText);
          break;
        case 'inappropriate_medical_advice':
          rewrittenText = this.disclaimMedicalAdvice(rewrittenText);
          break;
        case 'violence':
          rewrittenText = this.removeViolentContent(rewrittenText);
          break;
      }
    }

    // If rewriting failed or text became too short, provide safe alternative
    if (rewrittenText.length < 10 || rewrittenText === candidate.text) {
      rewrittenText = this.generateSafeAlternativeText(candidate.text);
    }

    // Reduce scores for rewritten candidates
    return {
      ...candidate,
      text: rewrittenText,
      overall_score: candidate.overall_score * 0.7, // Penalty for rewriting
      safety_score: 0.8, // Improved but not perfect safety score
      explanation: 'Đã được điều chỉnh để đảm bảo an toàn', // "Adjusted for safety"
    };
  }

  private flagUnsafeCandidates(
    candidates: ScoredCandidate[],
    violationsByCandidate: Map<string, SafetyViolation[]>
  ): ScoredCandidate[] {
    return candidates.map(candidate => {
      const violations = violationsByCandidate.get(candidate.id) || [];
      
      if (violations.length > 0) {
        // Reduce safety score for flagged candidates
        return {
          ...candidate,
          safety_score: Math.min(candidate.safety_score, 0.6),
          overall_score: candidate.overall_score * 0.9, // Small penalty
        };
      }
      
      return candidate;
    });
  }

  private generateSafeAlternatives(context: string): string[] {
    // Generate safe alternative responses based on context
    const alternatives = [
      'Tôi hiểu bạn đang cần hỗ trợ. Hãy thử cách tiếp cận tích cực hơn.',
      'Có thể chúng ta nên tập trung vào giao tiếp hiệu quả và tôn trọng.',
      'Tôi khuyên bạn nên sử dụng ngôn ngữ lịch sự và phù hợp.',
    ];

    // Context-specific alternatives
    if (context.toLowerCase().includes('công việc')) {
      alternatives.push('Trong môi trường công việc, hãy giữ thái độ chuyên nghiệp.');
    }
    
    if (context.toLowerCase().includes('bạn bè')) {
      alternatives.push('Với bạn bè, hãy giao tiếp một cách thân thiện và tôn trọng.');
    }

    return alternatives.slice(0, 2); // Return top 2 alternatives
  }

  private generateErrorMessage(violations: SafetyViolation[]): string {
    const highSeverityCount = violations.filter(v => v.severity === 'high').length;
    
    if (highSeverityCount > 0) {
      return 'Nội dung không phù hợp đã được phát hiện. Vui lòng thử cách diễn đạt khác.';
    }
    
    return 'Một số nội dung cần được điều chỉnh để phù hợp hơn.';
  }

  private removeOffensiveContent(text: string): string {
    // Simple offensive content removal
    const offensivePatterns = [
      /\b(đồ|thằng|con)\s+\w+/gi,
      /\b(fuck|shit|damn)\b/gi,
      /\b(đéo|địt|lồn|cặc)\b/gi,
    ];
    
    let cleaned = text;
    for (const pattern of offensivePatterns) {
      cleaned = cleaned.replace(pattern, '[...]');
    }
    
    return cleaned;
  }

  private toneDownFlirtation(text: string): string {
    // Replace flirtatious content with more appropriate alternatives
    const flirtationReplacements = {
      'yêu em': 'thích làm việc với bạn',
      'hôn em': 'chào bạn',
      'love you': 'appreciate you',
    };
    
    let toned = text;
    for (const [flirty, appropriate] of Object.entries(flirtationReplacements)) {
      toned = toned.replace(new RegExp(flirty, 'gi'), appropriate);
    }
    
    return toned;
  }

  private disclaimLegalAdvice(text: string): string {
    return text + ' (Lưu ý: Đây không phải lời khuyên pháp lý chuyên nghiệp)';
  }

  private disclaimMedicalAdvice(text: string): string {
    return text + ' (Lưu ý: Hãy tham khảo ý kiến bác sĩ chuyên khoa)';
  }

  private removeViolentContent(text: string): string {
    const violentPatterns = [
      /\b(đánh|giết|hành hạ)\b/gi,
      /\b(kill|hurt|harm|attack)\b/gi,
    ];
    
    let cleaned = text;
    for (const pattern of violentPatterns) {
      cleaned = cleaned.replace(pattern, 'giải quyết');
    }
    
    return cleaned;
  }

  private generateSafeAlternativeText(_originalText: string): string {
    // Generate a safe alternative when rewriting fails
    const safeAlternatives = [
      'Tôi hiểu ý của bạn. Hãy thử diễn đạt một cách khác.',
      'Có thể chúng ta nên tìm cách giao tiếp tích cực hơn.',
      'Tôi khuyên bạn nên sử dụng ngôn ngữ phù hợp hơn.',
    ];
    
    return safeAlternatives[Math.floor(Math.random() * safeAlternatives.length)];
  }

  private logSafetyInterventions(
    violations: SafetyViolation[],
    requestId: string,
    context: string,
    action: string,
    originalCandidates: ScoredCandidate[],
    userId?: string
  ): void {
    for (const violation of violations) {
      const originalCandidate = originalCandidates.find(c => c.id === violation.candidate_id);
      const originalText = originalCandidate?.text || '';
      
      this.safetyLogger.logSafetyIntervention(
        requestId,
        violation,
        context,
        action as 'blocked' | 'flagged' | 'rewritten',
        originalText,
        userId
      );
    }
  }

  /**
   * Gets safety statistics for monitoring
   */
  getSafetyStats(timeRange?: { start: Date; end: Date }) {
    return this.safetyLogger.getSafetyStats(timeRange);
  }

  /**
   * Detects concerning safety patterns
   */
  detectSafetyPatterns() {
    return this.safetyLogger.detectSafetyPatterns();
  }
}