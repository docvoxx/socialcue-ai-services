import { ToneClassifier } from '../services/ToneClassifier';
import { SafetyFilter } from '../services/SafetyFilter';
import { CandidateRanker } from '../services/CandidateRanker';
import { ScoredCandidate, ResponseCandidate } from '@socialcue-ai-services/shared';

// Mock the shared logger
jest.mock('@socialcue-ai-services/shared', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}));

describe('Sentiment Service Integration Tests', () => {
  let toneClassifier: ToneClassifier;
  let safetyFilter: SafetyFilter;
  let candidateRanker: CandidateRanker;

  beforeEach(() => {
    toneClassifier = new ToneClassifier();
    safetyFilter = new SafetyFilter();
    candidateRanker = new CandidateRanker();
  });

  test('should integrate tone classification with candidate ranking', async () => {
    const scoredCandidates: ScoredCandidate[] = [
      {
        id: 'A',
        text: 'Xin chào anh, em muốn hỏi về dự án',
        explanation: 'Polite greeting',
        tags: ['polite', 'work'],
        score: 0.8,
        tone_score: 0.9,
        sentiment_score: 0.8,
        safety_score: 0.95,
        overall_score: 0.88
      },
      {
        id: 'B',
        text: 'Hi bạn! Project này thế nào?',
        explanation: 'Casual greeting',
        tags: ['casual', 'genz'],
        score: 0.7,
        tone_score: 0.6,
        sentiment_score: 0.7,
        safety_score: 0.9,
        overall_score: 0.7
      },
      {
        id: 'C',
        text: 'Kính thưa quý khách hàng',
        explanation: 'Formal greeting',
        tags: ['formal', 'business'],
        score: 0.75,
        tone_score: 0.5,
        sentiment_score: 0.8,
        safety_score: 0.95,
        overall_score: 0.75
      },
    ];

    const rankedCandidates = candidateRanker.rankCandidates(scoredCandidates);

    expect(rankedCandidates).toHaveLength(3);
    expect(rankedCandidates[0].overall_score).toBeGreaterThanOrEqual(rankedCandidates[1].overall_score);
    expect(rankedCandidates[0].text).toContain('Xin chào'); // Should rank polite text highest
  });

  test('should integrate safety filtering with tone classification', async () => {
    const safeCandidates: ResponseCandidate[] = [
      { id: 'A', text: 'Xin chào anh, em muốn hỏi về dự án', explanation: 'Safe content', tags: ['safe'], score: 0.8 }
    ];
    
    const unsafeCandidates: ResponseCandidate[] = [
      { id: 'B', text: 'đồ ngu', explanation: 'Unsafe content', tags: ['unsafe'], score: 0.3 }
    ];

    const safeResult = await safetyFilter.checkSafety(safeCandidates, 'work context', 'moderate');
    const unsafeResult = await safetyFilter.checkSafety(unsafeCandidates, 'work context', 'moderate');

    expect(safeResult).toHaveLength(0); // No violations expected
    expect(unsafeResult.length).toBeGreaterThan(0); // Should detect violations
  });

  test('should handle complete sentiment analysis pipeline', async () => {
    const text = 'Cảm ơn anh đã giúp đỡ em ạ';
    const context = 'Nhận được sự giúp đỡ từ đồng nghiệp';

    // Test tone classification
    const toneResults = await toneClassifier.classifyTone(text);
    expect(toneResults).toHaveLength(5);
    expect(toneResults[0].label).toBe('polite'); // Should classify as polite

    // Test sentiment scoring
    const sentimentScore = await toneClassifier.scoreSentiment(text, context);
    expect(sentimentScore).toBeGreaterThan(0.5); // Should be positive sentiment

    // Test safety check
    const candidates: ResponseCandidate[] = [
      { id: 'A', text: text, explanation: 'Test candidate', tags: ['test'], score: 0.8 }
    ];
    const safetyResult = await safetyFilter.checkSafety(candidates, context, 'moderate');
    expect(safetyResult).toHaveLength(0); // Should be safe, no violations
  });

  test('should validate candidate ranking properties', () => {
    const candidates: ScoredCandidate[] = [
      {
        id: 'A',
        text: 'Test A',
        explanation: 'First candidate',
        tags: ['test'],
        score: 0.8,
        tone_score: 0.9,
        sentiment_score: 0.8,
        safety_score: 0.95,
        overall_score: 0.88
      },
      {
        id: 'B',
        text: 'Test B',
        explanation: 'Second candidate',
        tags: ['test'],
        score: 0.7,
        tone_score: 0.6,
        sentiment_score: 0.7,
        safety_score: 0.9,
        overall_score: 0.7
      },
    ];

    const rankedCandidates = candidateRanker.rankCandidates(candidates);
    const isValid = candidateRanker.validateRanking(rankedCandidates);

    expect(isValid).toBe(true);
    expect(rankedCandidates[0].overall_score).toBeGreaterThanOrEqual(rankedCandidates[1].overall_score);
  });

  test('should apply business rules correctly', () => {
    const candidates: ScoredCandidate[] = [
      {
        id: 'A',
        text: 'Safe candidate',
        explanation: 'High safety score',
        tags: ['safe'],
        score: 0.8,
        tone_score: 0.95, // Very high tone score
        sentiment_score: 0.8,
        safety_score: 0.95,
        overall_score: 0.88
      },
      {
        id: 'B',
        text: 'Unsafe candidate',
        explanation: 'Low safety score',
        tags: ['unsafe'],
        score: 0.9,
        tone_score: 0.8,
        sentiment_score: 0.2, // Very low sentiment score
        safety_score: 0.3, // Low safety score
        overall_score: 0.85
      },
    ];

    const adjustedCandidates = candidateRanker.applyBusinessRules(candidates);

    // Candidate A should get a boost for high tone score
    expect(adjustedCandidates[0].overall_score).toBeGreaterThan(0.88);
    
    // Candidate B should be heavily penalized for low safety and sentiment scores
    expect(adjustedCandidates[1].overall_score).toBeLessThan(0.85);
  });
});