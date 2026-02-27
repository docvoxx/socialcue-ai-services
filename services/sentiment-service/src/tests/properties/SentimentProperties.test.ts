import fc from 'fast-check';
import { CandidateRanker } from '../../services/CandidateRanker';

// Mock the shared logger
jest.mock('@socialcue-ai-services/shared', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}));

interface ScoredCandidate {
  id: string;
  text: string;
  tags: string[];
  score: number;
  explanation: string;
  tone_score: number;
  sentiment_score: number;
  safety_score: number;
  overall_score: number;
}

describe('Sentiment Service Property Tests', () => {
  let candidateRanker: CandidateRanker;

  beforeEach(() => {
    candidateRanker = new CandidateRanker();
  });

  describe('Property 10: Candidate Reranking by Score', () => {
    test('For any set of response candidates processed by the Sentiment_Service, the final ranking should be ordered by overall quality score in descending order', () => {
      /**
       * Feature: skippy-coach-advanced, Property 10: Candidate Reranking by Score
       * Validates: Requirements 4.2
       */
      
      const candidateArbitrary = fc.record({
        id: fc.constantFrom('A', 'B', 'C'),
        text: fc.string({ minLength: 10, maxLength: 200 }),
        tags: fc.array(fc.string({ minLength: 3, maxLength: 15 }), { maxLength: 5 }),
        score: fc.float({ min: 0, max: 1, noNaN: true }),
        explanation: fc.string({ maxLength: 80 }),
        tone_score: fc.float({ min: 0, max: 1, noNaN: true }),
        sentiment_score: fc.float({ min: 0, max: 1, noNaN: true }),
        safety_score: fc.float({ min: 0, max: 1, noNaN: true }),
        overall_score: fc.float({ min: 0, max: 1, noNaN: true }),
      });

      const candidatesArbitrary = fc.array(candidateArbitrary, { minLength: 1, maxLength: 10 });

      fc.assert(
        fc.property(candidatesArbitrary, (candidates: ScoredCandidate[]) => {
          // Ensure unique IDs for the test
          const uniqueCandidates = candidates.map((candidate, index) => ({
            ...candidate,
            id: `candidate_${index}`,
          }));

          // Rank the candidates
          const rankedCandidates = candidateRanker.rankCandidates(uniqueCandidates);

          // Property: Candidates should be sorted by overall_score in descending order
          for (let i = 0; i < rankedCandidates.length - 1; i++) {
            const current = rankedCandidates[i];
            const next = rankedCandidates[i + 1];
            
            // Current candidate should have >= overall_score than next candidate
            expect(current.overall_score).toBeGreaterThanOrEqual(next.overall_score);
          }

          // Property: All original candidates should be present in the result
          expect(rankedCandidates).toHaveLength(uniqueCandidates.length);

          // Property: Each candidate should maintain its core properties
          for (const rankedCandidate of rankedCandidates) {
            const originalCandidate = uniqueCandidates.find(c => c.id === rankedCandidate.id);
            expect(originalCandidate).toBeDefined();
            expect(rankedCandidate.text).toBe(originalCandidate!.text);
            expect(rankedCandidate.overall_score).toBe(originalCandidate!.overall_score);
          }

          // Property: Ranking should be deterministic for same input
          const secondRanking = candidateRanker.rankCandidates(uniqueCandidates);
          expect(rankedCandidates).toEqual(secondRanking);
        }),
        { numRuns: 100 }
      );
    });

    test('Ranking validation should pass for properly sorted candidates', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string(),
              text: fc.string(),
              tags: fc.array(fc.string(), { maxLength: 5 }),
              score: fc.float({ min: 0, max: 1, noNaN: true }),
              explanation: fc.string({ maxLength: 80 }),
              tone_score: fc.float({ min: 0, max: 1, noNaN: true }),
              sentiment_score: fc.float({ min: 0, max: 1, noNaN: true }),
              safety_score: fc.float({ min: 0, max: 1, noNaN: true }),
              overall_score: fc.float({ min: 0, max: 1, noNaN: true }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (candidates: ScoredCandidate[]) => {
            const rankedCandidates = candidateRanker.rankCandidates(candidates);
            const isValid = candidateRanker.validateRanking(rankedCandidates);
            
            // Property: Validation should always pass for ranked candidates
            expect(isValid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Business rules should maintain ranking order property', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string(),
              text: fc.string(),
              tags: fc.array(fc.string(), { maxLength: 5 }),
              score: fc.float({ min: 0, max: 1, noNaN: true }),
              explanation: fc.string({ maxLength: 80 }),
              tone_score: fc.float({ min: 0, max: 1, noNaN: true }),
              sentiment_score: fc.float({ min: 0, max: 1, noNaN: true }),
              safety_score: fc.float({ min: 0, max: 1, noNaN: true }),
              overall_score: fc.float({ min: 0, max: 1, noNaN: true }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (candidates: ScoredCandidate[]) => {
            // Apply business rules
            const adjustedCandidates = candidateRanker.applyBusinessRules(candidates);
            
            // Rank the adjusted candidates
            const rankedCandidates = candidateRanker.rankCandidates(adjustedCandidates);

            // Property: Even after business rule adjustments, ranking should be valid
            for (let i = 0; i < rankedCandidates.length - 1; i++) {
              expect(rankedCandidates[i].overall_score).toBeGreaterThanOrEqual(
                rankedCandidates[i + 1].overall_score
              );
            }

            // Property: All scores should remain in valid range [0, 1]
            for (const candidate of rankedCandidates) {
              expect(candidate.overall_score).toBeGreaterThanOrEqual(0);
              expect(candidate.overall_score).toBeLessThanOrEqual(1);
              expect(Number.isFinite(candidate.overall_score)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Ranking statistics should be consistent with input data', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string(),
              text: fc.string(),
              tags: fc.array(fc.string(), { maxLength: 5 }),
              score: fc.float({ min: 0, max: 1, noNaN: true }),
              explanation: fc.string({ maxLength: 80 }),
              tone_score: fc.float({ min: 0, max: 1, noNaN: true }),
              sentiment_score: fc.float({ min: 0, max: 1, noNaN: true }),
              safety_score: fc.float({ min: 0, max: 1, noNaN: true }),
              overall_score: fc.float({ min: 0, max: 1, noNaN: true }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (candidates: ScoredCandidate[]) => {
            const rankedCandidates = candidateRanker.rankCandidates(candidates);
            const stats = candidateRanker.getRankingStats(rankedCandidates);

            // Property: Statistics should reflect the actual data
            expect(stats.count).toBe(candidates.length);
            
            // Property: Min/max scores should be within bounds and finite
            expect(Number.isFinite(stats.overall_score.min)).toBe(true);
            expect(Number.isFinite(stats.overall_score.max)).toBe(true);
            expect(Number.isFinite(stats.overall_score.avg)).toBe(true);
            
            expect(stats.overall_score.min).toBeGreaterThanOrEqual(0);
            expect(stats.overall_score.max).toBeLessThanOrEqual(1);
            expect(stats.overall_score.min).toBeLessThanOrEqual(stats.overall_score.max);
            
            // Property: Average should be between min and max
            expect(stats.overall_score.avg).toBeGreaterThanOrEqual(stats.overall_score.min);
            expect(stats.overall_score.avg).toBeLessThanOrEqual(stats.overall_score.max);

            // Property: If there's only one candidate, min = max = avg
            if (candidates.length === 1) {
              expect(stats.overall_score.min).toBe(stats.overall_score.max);
              expect(stats.overall_score.min).toBe(stats.overall_score.avg);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Empty input should be handled gracefully', () => {
      const rankedCandidates = candidateRanker.rankCandidates([]);
      
      // Property: Empty input should return empty output
      expect(rankedCandidates).toHaveLength(0);
      
      // Property: Validation should pass for empty array
      const isValid = candidateRanker.validateRanking(rankedCandidates);
      expect(isValid).toBe(true);
    });

    test('Single candidate should maintain its properties', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string(),
            text: fc.string(),
            tags: fc.array(fc.string(), { maxLength: 5 }),
            score: fc.float({ min: 0, max: 1, noNaN: true }),
            explanation: fc.string({ maxLength: 80 }),
            tone_score: fc.float({ min: 0, max: 1, noNaN: true }),
            sentiment_score: fc.float({ min: 0, max: 1, noNaN: true }),
            safety_score: fc.float({ min: 0, max: 1, noNaN: true }),
            overall_score: fc.float({ min: 0, max: 1, noNaN: true }),
          }),
          (candidate: ScoredCandidate) => {
            const rankedCandidates = candidateRanker.rankCandidates([candidate]);

            // Property: Single candidate should be returned unchanged
            expect(rankedCandidates).toHaveLength(1);
            expect(rankedCandidates[0]).toEqual(expect.objectContaining({
              id: candidate.id,
              text: candidate.text,
              overall_score: candidate.overall_score,
            }));
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});