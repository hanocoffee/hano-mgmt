import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCORE_WEIGHTS,
  InvalidEvaluationError,
  MAX_SCORE_WITHOUT_EVIDENCE,
  computeOpportunityScore,
  normalizeClusterKey,
  normalizeEvaluation,
} from '../src/core/scoring.js';
import type { ScoreDimension } from '../src/core/types.js';

function allScores(value: number): Record<ScoreDimension, number> {
  return {
    severity: value,
    frequency: value,
    willingnessToPay: value,
    automationFit: value,
    reachability: value,
    evidenceQuality: value,
  };
}

function rawEvaluation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const dim = (score: number, evidenceIds: string[] = ['e1']) => ({
    score,
    reason: 'stated in the document',
    evidenceIds,
  });
  return {
    scores: {
      severity: dim(0.8),
      frequency: dim(0.6),
      willingnessToPay: dim(0.7),
      automationFit: dim(0.9),
      reachability: dim(0.4, []),
      evidenceQuality: dim(0.5),
    },
    confidence: 0.6,
    reasoningSummary: 'overall promising',
    businessIdeas: [],
    ...overrides,
  };
}

describe('computeOpportunityScore', () => {
  it('returns 1 when all dimensions are 1', () => {
    expect(computeOpportunityScore(allScores(1))).toBe(1);
  });

  it('returns 0 when all dimensions are 0', () => {
    expect(computeOpportunityScore(allScores(0))).toBe(0);
  });

  it('applies the documented weights', () => {
    const scores = allScores(0);
    scores.willingnessToPay = 1; // weight 0.25
    expect(computeOpportunityScore(scores)).toBe(0.25);
  });

  it('weights sum to 1', () => {
    const sum = Object.values(DEFAULT_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
  });

  it('rejects out-of-range scores', () => {
    const scores = allScores(0.5);
    scores.severity = 1.5;
    expect(() => computeOpportunityScore(scores)).toThrow(InvalidEvaluationError);
  });
});

describe('normalizeEvaluation', () => {
  const validIds = new Set(['e1', 'e2']);

  it('accepts a fully valid evaluation', () => {
    const result = normalizeEvaluation(rawEvaluation(), validIds);
    expect(result.scores.severity.score).toBe(0.8);
    expect(result.confidence).toBe(0.6);
  });

  it('caps scores without evidence at MAX_SCORE_WITHOUT_EVIDENCE', () => {
    const raw = rawEvaluation();
    (raw.scores as Record<string, { score: number; reason: string; evidenceIds: string[] }>).severity =
      { score: 0.9, reason: 'sounds bad', evidenceIds: [] };
    const result = normalizeEvaluation(raw, validIds);
    expect(result.scores.severity.score).toBe(MAX_SCORE_WITHOUT_EVIDENCE);
  });

  it('drops invented evidence ids and caps the score', () => {
    const raw = rawEvaluation();
    (raw.scores as Record<string, { score: number; reason: string; evidenceIds: string[] }>).severity =
      { score: 0.9, reason: 'sounds bad', evidenceIds: ['e99'] };
    const result = normalizeEvaluation(raw, validIds);
    expect(result.scores.severity.evidenceIds).toEqual([]);
    expect(result.scores.severity.score).toBe(MAX_SCORE_WITHOUT_EVIDENCE);
  });

  it('rejects a missing reason', () => {
    const raw = rawEvaluation();
    (raw.scores as Record<string, { score: number; reason: string; evidenceIds: string[] }>).severity =
      { score: 0.9, reason: '', evidenceIds: ['e1'] };
    expect(() => normalizeEvaluation(raw, validIds)).toThrow(InvalidEvaluationError);
  });

  it('rejects a missing dimension', () => {
    const raw = rawEvaluation();
    delete (raw.scores as Record<string, unknown>).frequency;
    expect(() => normalizeEvaluation(raw, validIds)).toThrow(InvalidEvaluationError);
  });

  it('rejects out-of-range confidence', () => {
    expect(() => normalizeEvaluation(rawEvaluation({ confidence: 2 }), validIds)).toThrow(
      InvalidEvaluationError,
    );
  });

  it('rejects non-object output', () => {
    expect(() => normalizeEvaluation('not json', validIds)).toThrow(InvalidEvaluationError);
  });

  it('drops business ideas without a name but keeps valid ones', () => {
    const raw = rawEvaluation({
      businessIdeas: [
        { name: '', valueProposition: 'x' },
        {
          name: 'Valid idea',
          valueProposition: 'saves time',
          estimatedBuildComplexity: 'weird-value',
        },
      ],
    });
    const result = normalizeEvaluation(raw, validIds);
    expect(result.businessIdeas).toHaveLength(1);
    expect(result.businessIdeas[0]?.name).toBe('Valid idea');
    expect(result.businessIdeas[0]?.estimatedBuildComplexity).toBe('medium');
  });
});

describe('normalizeClusterKey', () => {
  it('normalizes to kebab-case', () => {
    expect(normalizeClusterKey('Manual Inventory Tracking!')).toBe('manual-inventory-tracking');
  });

  it('falls back for empty input', () => {
    expect(normalizeClusterKey('  ')).toBe('uncategorized');
  });
});
