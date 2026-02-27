import { ScoredCandidate } from '@socialcue-ai-services/shared';
import { logger } from '@socialcue-ai-services/shared';

export class CandidateRanker {
  private serviceName = 'sentiment-service';
  
  /**
   * Ranks candidates by overall quality score in descending order
   * This implements Property 10: Candidate Reranking by Score
   */
  rankCandidates(candidates: ScoredCandidate[]): ScoredCandidate[] {
    const startTime = Date.now();
    
    // Sort by overall_score in descending order (highest score first)
    const rankedCandidates = [...candidates].sort((a, b) => {
      // Primary sort: overall_score (descending)
      if (b.overall_score !== a.overall_score) {
        return b.overall_score - a.overall_score;
      }
      
      // Secondary sort: safety_score (descending) - prioritize safer content
      if (b.safety_score !== a.safety_score) {
        return b.safety_score - a.safety_score;
      }
      
      // Tertiary sort: tone_score (descending) - better tone matching
      if (b.tone_score !== a.tone_score) {
        return b.tone_score - a.tone_score;
      }
      
      // Final sort: original score from LLM (descending)
      return b.score - a.score;
    });

    // Ensure candidates maintain their original IDs (A, B, C) but in new order
    const finalRanked = rankedCandidates.map((candidate, index) => ({
      ...candidate,
      // Keep original ID but note the new ranking position
      rank_position: index + 1,
    }));

    const processingTime = Date.now() - startTime;

    logger.info('Candidate ranking completed', {
      service: this.serviceName,
      candidateCount: candidates.length,
      processingTime,
      rankings: finalRanked.map(c => ({
        id: c.id,
        overall_score: c.overall_score,
        rank_position: c.rank_position,
      })),
    });

    return finalRanked;
  }

  /**
   * Applies additional ranking adjustments based on business rules
   */
  applyBusinessRules(candidates: ScoredCandidate[]): ScoredCandidate[] {
    return candidates.map(candidate => {
      let adjustedScore = candidate.overall_score;
      
      // Business rule: Heavily penalize safety violations
      if (candidate.safety_score < 0.5) {
        adjustedScore *= 0.3; // Reduce score by 70%
      }
      
      // Business rule: Boost candidates with very high tone matching
      if (candidate.tone_score > 0.9) {
        adjustedScore = Math.min(1.0, adjustedScore * 1.1); // 10% boost, capped at 1.0
      }
      
      // Business rule: Penalize candidates with very low sentiment appropriateness
      if (candidate.sentiment_score < 0.3) {
        adjustedScore *= 0.8; // 20% penalty
      }
      
      return {
        ...candidate,
        overall_score: adjustedScore,
      };
    });
  }

  /**
   * Validates that ranking maintains the required properties
   */
  validateRanking(rankedCandidates: ScoredCandidate[]): boolean {
    // Check that candidates are properly sorted by overall_score
    for (let i = 0; i < rankedCandidates.length - 1; i++) {
      if (rankedCandidates[i].overall_score < rankedCandidates[i + 1].overall_score) {
        logger.error('Ranking validation failed: candidates not properly sorted', undefined, {
          service: this.serviceName,
          position: i,
          current_score: rankedCandidates[i].overall_score,
          next_score: rankedCandidates[i + 1].overall_score,
        });
        return false;
      }
    }
    
    // Check that all candidates have valid scores
    for (const candidate of rankedCandidates) {
      if (candidate.overall_score < 0 || candidate.overall_score > 1) {
        logger.error('Ranking validation failed: invalid overall_score', undefined, {
          service: this.serviceName,
          candidate_id: candidate.id,
          overall_score: candidate.overall_score,
        });
        return false;
      }
    }
    
    logger.debug('Ranking validation passed', {
      service: this.serviceName,
      candidateCount: rankedCandidates.length,
    });
    
    return true;
  }

  /**
   * Gets ranking statistics for monitoring and debugging
   */
  getRankingStats(rankedCandidates: ScoredCandidate[]) {
    const scores = rankedCandidates.map(c => c.overall_score);
    const toneScores = rankedCandidates.map(c => c.tone_score);
    const sentimentScores = rankedCandidates.map(c => c.sentiment_score);
    const safetyScores = rankedCandidates.map(c => c.safety_score);
    
    return {
      count: rankedCandidates.length,
      overall_score: {
        min: Math.min(...scores),
        max: Math.max(...scores),
        avg: scores.reduce((sum, s) => sum + s, 0) / scores.length,
      },
      tone_score: {
        min: Math.min(...toneScores),
        max: Math.max(...toneScores),
        avg: toneScores.reduce((sum, s) => sum + s, 0) / toneScores.length,
      },
      sentiment_score: {
        min: Math.min(...sentimentScores),
        max: Math.max(...sentimentScores),
        avg: sentimentScores.reduce((sum, s) => sum + s, 0) / sentimentScores.length,
      },
      safety_score: {
        min: Math.min(...safetyScores),
        max: Math.max(...safetyScores),
        avg: safetyScores.reduce((sum, s) => sum + s, 0) / safetyScores.length,
      },
    };
  }
}