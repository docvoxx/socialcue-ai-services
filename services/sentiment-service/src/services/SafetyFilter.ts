import { SafetyViolation, ResponseCandidate } from '@socialcue-ai-services/shared';
import { logger } from '@socialcue-ai-services/shared';

export type SafetyLevel = 'strict' | 'moderate' | 'permissive';

export class SafetyFilter {
  // Vietnamese safety keywords and patterns
  private readonly SAFETY_PATTERNS = {
    offensive: [
      'đồ ngu', 'ngu', 'đồ', 'thằng', 'con', 'mẹ', 'bố', 'cút', 'chết', 'đéo', 'địt', 'lồn', 'cặc',
      'fuck', 'shit', 'damn', 'bitch', 'asshole', 'stupid', 'idiot'
    ],
    
    harassment: [
      'đánh', 'giết', 'hành hạ', 'bắt nạt', 'đe dọa', 'uy hiếp', 'làm hại',
      'kill', 'hurt', 'harm', 'threaten', 'bully', 'harass'
    ],
    
    selfHarm: [
      'tự tử', 'tự sát', 'tự hại', 'chết đi', 'kết thúc cuộc đời',
      'suicide', 'kill myself', 'end my life', 'self harm', 'cut myself'
    ],
    
    violence: [
      'bạo lực', 'đánh nhau', 'chiến tranh', 'súng', 'dao', 'giết người',
      'violence', 'fight', 'war', 'gun', 'knife', 'murder', 'attack'
    ],
    
    inappropriateLegal: [
      'luật sư miễn phí', 'tư vấn pháp lý', 'kiện tụng', 'tòa án',
      'free lawyer', 'legal advice', 'lawsuit', 'court case'
    ],
    
    inappropriateMedical: [
      'chẩn đoán bệnh', 'kê đơn thuốc', 'điều trị', 'bác sĩ online',
      'medical diagnosis', 'prescribe medicine', 'treatment', 'online doctor'
    ],
    
    excessiveFlirtation: [
      'yêu em', 'hôn em', 'ôm em', 'ngủ cùng', 'sex', 'tình dục',
      'love you', 'kiss you', 'hug you', 'sleep together', 'sexual'
    ]
  };

  // Prompt injection patterns
  private readonly PROMPT_INJECTION_PATTERNS = [
    /ignore\s+previous\s+instructions/i,
    /forget\s+everything/i,
    /you\s+are\s+now/i,
    /system\s*:/i,
    /assistant\s*:/i,
    /\[INST\]/i,
    /\<\|system\|\>/i,
    /\{\{.*\}\}/,
    /bỏ qua hướng dẫn/i,
    /quên tất cả/i,
    /bây giờ bạn là/i,
  ];

  async checkSafety(
    candidates: ResponseCandidate[],
    context: string,
    safetyLevel: SafetyLevel
  ): Promise<SafetyViolation[]> {
    const violations: SafetyViolation[] = [];

    for (const candidate of candidates) {
      const candidateViolations = await this.checkCandidateSafety(
        candidate,
        context,
        safetyLevel
      );
      violations.push(...candidateViolations);
    }

    logger.info('Safety check completed', {
      service: 'sentiment-service',
      candidateCount: candidates.length,
      violationCount: violations.length,
      safetyLevel,
    });

    return violations;
  }

  private async checkCandidateSafety(
    candidate: ResponseCandidate,
    _context: string,
    safetyLevel: SafetyLevel
  ): Promise<SafetyViolation[]> {
    const violations: SafetyViolation[] = [];
    const text = candidate.text.toLowerCase();

    // Check for prompt injection
    const promptInjectionViolation = this.checkPromptInjection(candidate.id, candidate.text);
    if (promptInjectionViolation) {
      violations.push(promptInjectionViolation);
    }

    // Check for offensive content
    const offensiveViolation = this.checkOffensiveContent(candidate.id, text, safetyLevel);
    if (offensiveViolation) {
      violations.push(offensiveViolation);
    }

    // Check for harassment
    const harassmentViolation = this.checkHarassment(candidate.id, text, safetyLevel);
    if (harassmentViolation) {
      violations.push(harassmentViolation);
    }

    // Check for self-harm content
    const selfHarmViolation = this.checkSelfHarm(candidate.id, text);
    if (selfHarmViolation) {
      violations.push(selfHarmViolation);
    }

    // Check for violence
    const violenceViolation = this.checkViolence(candidate.id, text, safetyLevel);
    if (violenceViolation) {
      violations.push(violenceViolation);
    }

    // Check for inappropriate legal advice
    const legalViolation = this.checkInappropriateLegal(candidate.id, text, safetyLevel);
    if (legalViolation) {
      violations.push(legalViolation);
    }

    // Check for inappropriate medical advice
    const medicalViolation = this.checkInappropriateMedical(candidate.id, text, safetyLevel);
    if (medicalViolation) {
      violations.push(medicalViolation);
    }

    // Check for excessive flirtation
    const flirtationViolation = this.checkExcessiveFlirtation(candidate.id, text, safetyLevel);
    if (flirtationViolation) {
      violations.push(flirtationViolation);
    }

    return violations;
  }

  private checkPromptInjection(candidateId: string, text: string): SafetyViolation | null {
    for (const pattern of this.PROMPT_INJECTION_PATTERNS) {
      if (pattern.test(text)) {
        return {
          candidate_id: candidateId,
          violation_type: 'prompt_injection',
          type: 'prompt_injection',
          severity: 'high',
          message: 'Potential prompt injection detected',
        };
      }
    }
    return null;
  }

  private checkOffensiveContent(candidateId: string, text: string, safetyLevel: SafetyLevel): SafetyViolation | null {
    const offensiveWords = this.SAFETY_PATTERNS.offensive;
    const threshold = this.getSeverityThreshold(safetyLevel);
    
    let offensiveCount = 0;
    for (const word of offensiveWords) {
      if (text.includes(word.toLowerCase())) {
        offensiveCount++;
      }
    }

    if (offensiveCount > 0) {
      const severity = offensiveCount >= threshold.high ? 'high' : 
                     offensiveCount >= threshold.medium ? 'medium' : 'low';
      
      if (this.shouldFlag(severity, safetyLevel)) {
        return {
          candidate_id: candidateId,
          violation_type: 'offensive_content',
          type: 'offensive_content',
          severity,
          message: `Offensive language detected (${offensiveCount} instances)`,
        };
      }
    }

    return null;
  }

  private checkHarassment(candidateId: string, text: string, _safetyLevel: SafetyLevel): SafetyViolation | null {
    const harassmentWords = this.SAFETY_PATTERNS.harassment;
    
    for (const word of harassmentWords) {
      if (text.includes(word.toLowerCase())) {
        return {
          candidate_id: candidateId,
          violation_type: 'harassment',
          type: 'harassment',
          severity: 'high',
          message: 'Harassment or threatening language detected',
        };
      }
    }

    return null;
  }

  private checkSelfHarm(candidateId: string, text: string): SafetyViolation | null {
    const selfHarmWords = this.SAFETY_PATTERNS.selfHarm;
    
    for (const word of selfHarmWords) {
      if (text.includes(word.toLowerCase())) {
        return {
          candidate_id: candidateId,
          violation_type: 'self_harm',
          type: 'self_harm',
          severity: 'high',
          message: 'Self-harm content detected',
        };
      }
    }

    return null;
  }

  private checkViolence(candidateId: string, text: string, safetyLevel: SafetyLevel): SafetyViolation | null {
    const violenceWords = this.SAFETY_PATTERNS.violence;
    
    let violenceCount = 0;
    for (const word of violenceWords) {
      if (text.includes(word.toLowerCase())) {
        violenceCount++;
      }
    }

    if (violenceCount > 0) {
      const severity = violenceCount >= 2 ? 'high' : 'medium';
      
      if (this.shouldFlag(severity, safetyLevel)) {
        return {
          candidate_id: candidateId,
          violation_type: 'violence',
          type: 'violence',
          severity,
          message: `Violent content detected (${violenceCount} instances)`,
        };
      }
    }

    return null;
  }

  private checkInappropriateLegal(candidateId: string, text: string, safetyLevel: SafetyLevel): SafetyViolation | null {
    const legalWords = this.SAFETY_PATTERNS.inappropriateLegal;
    
    for (const word of legalWords) {
      if (text.includes(word.toLowerCase())) {
        const severity = safetyLevel === 'strict' ? 'medium' : 'low';
        
        if (this.shouldFlag(severity, safetyLevel)) {
          return {
            candidate_id: candidateId,
            violation_type: 'inappropriate_legal_advice',
            type: 'inappropriate_legal_advice',
            severity,
            message: 'Inappropriate legal advice detected',
          };
        }
      }
    }

    return null;
  }

  private checkInappropriateMedical(candidateId: string, text: string, safetyLevel: SafetyLevel): SafetyViolation | null {
    const medicalWords = this.SAFETY_PATTERNS.inappropriateMedical;
    
    for (const word of medicalWords) {
      if (text.includes(word.toLowerCase())) {
        const severity = safetyLevel === 'strict' ? 'medium' : 'low';
        
        if (this.shouldFlag(severity, safetyLevel)) {
          return {
            candidate_id: candidateId,
            violation_type: 'inappropriate_medical_advice',
            type: 'inappropriate_medical_advice',
            severity,
            message: 'Inappropriate medical advice detected',
          };
        }
      }
    }

    return null;
  }

  private checkExcessiveFlirtation(candidateId: string, text: string, safetyLevel: SafetyLevel): SafetyViolation | null {
    const flirtationWords = this.SAFETY_PATTERNS.excessiveFlirtation;
    
    let flirtationCount = 0;
    for (const word of flirtationWords) {
      if (text.includes(word.toLowerCase())) {
        flirtationCount++;
      }
    }

    if (flirtationCount > 0) {
      const severity = flirtationCount >= 2 ? 'high' : 'medium';
      
      if (this.shouldFlag(severity, safetyLevel)) {
        return {
          candidate_id: candidateId,
          violation_type: 'excessive_flirtation',
          type: 'excessive_flirtation',
          severity,
          message: `Excessive flirtation detected (${flirtationCount} instances)`,
        };
      }
    }

    return null;
  }

  private getSeverityThreshold(safetyLevel: SafetyLevel) {
    switch (safetyLevel) {
      case 'strict':
        return { high: 1, medium: 1 };
      case 'moderate':
        return { high: 2, medium: 1 };
      case 'permissive':
        return { high: 3, medium: 2 };
      default:
        return { high: 2, medium: 1 };
    }
  }

  private shouldFlag(severity: 'low' | 'medium' | 'high', safetyLevel: SafetyLevel): boolean {
    switch (safetyLevel) {
      case 'strict':
        return true; // Flag all severities
      case 'moderate':
        return severity !== 'low'; // Flag medium and high
      case 'permissive':
        return severity === 'high'; // Flag only high
      default:
        return severity !== 'low';
    }
  }

  // Method to sanitize RAG chunks to prevent prompt injection
  sanitizeRAGChunk(chunk: string): string {
    let sanitized = chunk;

    // Remove potential prompt injection patterns
    for (const pattern of this.PROMPT_INJECTION_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[FILTERED]');
    }

    // Remove excessive special characters that might be used for injection
    sanitized = sanitized.replace(/[{}[\]<>|]/g, '');
    
    // Limit length to prevent token stuffing
    if (sanitized.length > 500) {
      sanitized = sanitized.substring(0, 500) + '...';
    }

    return sanitized;
  }
}