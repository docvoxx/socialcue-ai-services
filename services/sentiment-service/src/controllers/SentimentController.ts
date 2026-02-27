import { Request, Response, NextFunction } from 'express';
import { SentimentRequestSchema, SentimentResponse } from '@socialcue-ai-services/shared';
import { ToneClassifier } from '../services/ToneClassifier';
import { SafetyFilter } from '../services/SafetyFilter';
import { CandidateRanker } from '../services/CandidateRanker';
import { SafetyResponseHandler } from '../services/SafetyResponseHandler';
import { createError } from '../middleware/errorHandler';
import { logger } from '@socialcue-ai-services/shared';

export class SentimentController {
  private toneClassifier: ToneClassifier;
  private safetyFilter: SafetyFilter;
  private candidateRanker: CandidateRanker;
  private safetyResponseHandler: SafetyResponseHandler;

  constructor() {
    this.toneClassifier = new ToneClassifier();
    this.safetyFilter = new SafetyFilter();
    this.candidateRanker = new CandidateRanker();
    this.safetyResponseHandler = new SafetyResponseHandler();
  }

  async analyzeSentiment(req: Request, res: Response, next: NextFunction) {
    try {
      const startTime = Date.now();
      
      // Validate request
      const validationResult = SentimentRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        throw createError('Invalid request format', 400);
      }

      const request = validationResult.data;
      const requestId = req.headers['x-request-id'] as string;

      logger.info('Processing sentiment analysis', {
        service: 'sentiment-service',
        requestId,
        candidateCount: request.candidates.length,
        targetTone: request.target_tone,
        safetyLevel: request.safety_level,
      });

      // Step 1: Safety filtering
      // Map safety_level from request to SafetyLevel type
      const safetyLevelMap: Record<'low' | 'medium' | 'high', 'permissive' | 'moderate' | 'strict'> = {
        'low': 'permissive',
        'medium': 'moderate',
        'high': 'strict'
      };
      const safetyLevel = safetyLevelMap[request.safety_level || 'medium'];
      
      const safetyResults = await this.safetyFilter.checkSafety(
        request.candidates,
        request.context || '',
        safetyLevel
      );

      // Step 2: Tone classification and scoring
      const scoredCandidates = await Promise.all(
        request.candidates.map(async (candidate) => {
          const toneScore = await this.toneClassifier.scoreTone(
            candidate.text,
            request.target_tone || 'neutral'
          );
          
          const sentimentScore = await this.toneClassifier.scoreSentiment(
            candidate.text,
            request.context || ''
          );

          const safetyResult = safetyResults.find(s => s.candidate_id === candidate.id);
          const safetyScore = safetyResult ? 
            (safetyResult.severity === 'high' ? 0.1 : 
             safetyResult.severity === 'medium' ? 0.3 : 0.6) : 1.0;

          // Calculate overall score (weighted average)
          const overallScore = (toneScore * 0.4 + sentimentScore * 0.3 + safetyScore * 0.3);

          return {
            ...candidate,
            tone_score: toneScore,
            sentiment_score: sentimentScore,
            safety_score: safetyScore,
            overall_score: overallScore,
          };
        })
      );

      // Step 3: Handle safety violations and determine response
      const safetyResponse = this.safetyResponseHandler.handleSafetyViolations(
        scoredCandidates,
        safetyResults,
        requestId,
        request.context || '',
        req.headers['x-user-id'] as string
      );

      // Step 4: Rank candidates by overall score (only if not blocked)
      let rankedCandidates = safetyResponse.modifiedCandidates;
      if (safetyResponse.action !== 'block') {
        rankedCandidates = this.candidateRanker.rankCandidates(safetyResponse.modifiedCandidates);
      }

      // Step 5: Generate rewrite suggestions for remaining low-scoring candidates
      const rewriteSuggestions = safetyResponse.safeAlternatives.length > 0 
        ? safetyResponse.safeAlternatives 
        : await this.generateRewriteSuggestions(
            rankedCandidates.filter(c => c.overall_score < 0.6)
          );

      const processingTime = Date.now() - startTime;

      const response: SentimentResponse = {
        ranked_candidates: rankedCandidates,
        safety_violations: safetyResults,
        rewrite_suggestions: rewriteSuggestions,
      };

      // Add error information if content was blocked
      if (safetyResponse.action === 'block' && safetyResponse.errorMessage) {
        logger.warn('Content blocked due to safety violations', {
          service: 'sentiment-service',
          requestId,
          violationCount: safetyResults.length,
          errorMessage: safetyResponse.errorMessage,
        });
      }

      logger.info('Sentiment analysis completed', {
        service: 'sentiment-service',
        requestId,
        processingTime,
        safetyViolations: safetyResults.length,
        rewriteSuggestions: rewriteSuggestions.length,
        safetyAction: safetyResponse.action,
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  }

  async getHealthStatus(_req: Request, res: Response, next: NextFunction) {
    try {
      const safetyStats = this.safetyResponseHandler.getSafetyStats();
      const safetyPatterns = this.safetyResponseHandler.detectSafetyPatterns();
      
      res.json({
        status: 'healthy',
        service: 'sentiment-service',
        safety_stats: safetyStats,
        safety_patterns: safetyPatterns,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }

  private async generateRewriteSuggestions(lowScoringCandidates: any[]): Promise<string[]> {
    // Simple rewrite suggestions based on common issues
    const suggestions: string[] = [];
    
    for (const candidate of lowScoringCandidates) {
      if (candidate.tone_score < 0.5) {
        suggestions.push(`Adjust tone for candidate ${candidate.id}: Consider more ${candidate.tone_score < 0.3 ? 'polite' : 'confident'} language`);
      }
      if (candidate.safety_score < 0.8) {
        suggestions.push(`Safety concern for candidate ${candidate.id}: Remove potentially inappropriate content`);
      }
      if (candidate.sentiment_score < 0.5) {
        suggestions.push(`Sentiment mismatch for candidate ${candidate.id}: Align emotional tone with context`);
      }
    }

    return suggestions;
  }
}