import type {
  BuildComplexity,
  BusinessIdeaDraft,
  DimensionScore,
  PainPointEvaluation,
  ScoreDimension,
} from './types.js';

export const SCORE_DIMENSIONS: ScoreDimension[] = [
  'severity',
  'frequency',
  'willingnessToPay',
  'automationFit',
  'reachability',
  'evidenceQuality',
];

/**
 * Initial weights for the deterministic opportunity score.
 * Experimental — adjust after real data has been scored.
 */
export const DEFAULT_SCORE_WEIGHTS: Record<ScoreDimension, number> = {
  severity: 0.2,
  frequency: 0.15,
  willingnessToPay: 0.25,
  automationFit: 0.2,
  reachability: 0.1,
  evidenceQuality: 0.1,
};

/** A dimension score with no supporting evidence can never exceed this value. */
export const MAX_SCORE_WITHOUT_EVIDENCE = 0.5;

const BUILD_COMPLEXITIES: BuildComplexity[] = ['low', 'medium', 'high'];

/** Thrown when LLM evaluation output is unusable. Such output is never persisted. */
export class InvalidEvaluationError extends Error {}

function isValidScore(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value) && value >= 0 && value <= 1;
}

/**
 * Compute the opportunity score deterministically in TypeScript.
 * The LLM never produces this number directly.
 */
export function computeOpportunityScore(
  scores: Record<ScoreDimension, number>,
  weights: Record<ScoreDimension, number> = DEFAULT_SCORE_WEIGHTS,
): number {
  let total = 0;
  let weightSum = 0;
  for (const dimension of SCORE_DIMENSIONS) {
    const value = scores[dimension];
    if (!isValidScore(value)) {
      throw new InvalidEvaluationError(`score out of range for ${dimension}: ${String(value)}`);
    }
    total += value * weights[dimension];
    weightSum += weights[dimension];
  }
  if (weightSum <= 0) {
    throw new InvalidEvaluationError('score weights must sum to a positive number');
  }
  return Number((total / weightSum).toFixed(2));
}

function normalizeIdea(raw: unknown): BusinessIdeaDraft | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const value = raw as Record<string, unknown>;
  const str = (key: string): string =>
    typeof value[key] === 'string' && (value[key] as string).trim()
      ? (value[key] as string).trim()
      : '';
  const name = str('name');
  const valueProposition = str('valueProposition');
  if (!name || !valueProposition) return undefined;
  const complexity = value.estimatedBuildComplexity;
  return {
    name,
    valueProposition,
    productType: str('productType') || 'unknown',
    targetCustomer: str('targetCustomer') || 'unknown',
    suggestedPriceModel: str('suggestedPriceModel') || 'unknown',
    acquisitionChannel: str('acquisitionChannel') || 'unknown',
    deliveryMethod: str('deliveryMethod') || 'unknown',
    humanWorkRequired: str('humanWorkRequired') || 'unknown',
    estimatedBuildComplexity: BUILD_COMPLEXITIES.includes(complexity as BuildComplexity)
      ? (complexity as BuildComplexity)
      : 'medium',
    validationMethod: str('validationMethod') || 'unknown',
  };
}

/**
 * Validate and normalize an evaluator's raw output.
 *
 * Rules:
 * - every dimension must have a numeric score in [0,1] AND a non-empty reason,
 *   otherwise the whole evaluation is rejected (InvalidEvaluationError → not saved)
 * - evidenceIds not present in `validEvidenceIds` are dropped
 * - a score without surviving evidence is capped at MAX_SCORE_WITHOUT_EVIDENCE
 * - confidence must be in [0,1]; reasoningSummary must be non-empty
 * - business ideas without name/valueProposition are dropped (not fatal)
 */
export function normalizeEvaluation(
  raw: unknown,
  validEvidenceIds: Set<string>,
): PainPointEvaluation {
  if (typeof raw !== 'object' || raw === null) {
    throw new InvalidEvaluationError('evaluation is not an object');
  }
  const value = raw as Record<string, unknown>;
  const scoresRaw = value.scores;
  if (typeof scoresRaw !== 'object' || scoresRaw === null) {
    throw new InvalidEvaluationError('evaluation.scores is missing');
  }

  const scores = {} as Record<ScoreDimension, DimensionScore>;
  for (const dimension of SCORE_DIMENSIONS) {
    const entry = (scoresRaw as Record<string, unknown>)[dimension];
    if (typeof entry !== 'object' || entry === null) {
      throw new InvalidEvaluationError(`missing score entry for ${dimension}`);
    }
    const scoreEntry = entry as Record<string, unknown>;
    if (!isValidScore(scoreEntry.score)) {
      throw new InvalidEvaluationError(
        `score out of range for ${dimension}: ${String(scoreEntry.score)}`,
      );
    }
    if (typeof scoreEntry.reason !== 'string' || !scoreEntry.reason.trim()) {
      throw new InvalidEvaluationError(`missing reason for ${dimension}`);
    }
    const evidenceIds = Array.isArray(scoreEntry.evidenceIds)
      ? scoreEntry.evidenceIds.filter(
          (id): id is string => typeof id === 'string' && validEvidenceIds.has(id),
        )
      : [];
    const score =
      evidenceIds.length === 0
        ? Math.min(scoreEntry.score, MAX_SCORE_WITHOUT_EVIDENCE)
        : scoreEntry.score;
    scores[dimension] = {
      score: Number(score.toFixed(2)),
      reason: scoreEntry.reason.trim(),
      evidenceIds,
    };
  }

  if (!isValidScore(value.confidence)) {
    throw new InvalidEvaluationError(`confidence out of range: ${String(value.confidence)}`);
  }
  if (typeof value.reasoningSummary !== 'string' || !value.reasoningSummary.trim()) {
    throw new InvalidEvaluationError('missing reasoningSummary');
  }

  const businessIdeas = Array.isArray(value.businessIdeas)
    ? value.businessIdeas.map(normalizeIdea).filter((idea): idea is BusinessIdeaDraft => !!idea)
    : [];

  return {
    scores,
    confidence: Number(value.confidence.toFixed(2)),
    reasoningSummary: value.reasoningSummary.trim(),
    businessIdeas,
  };
}

/** Extract the plain numeric scores from a normalized evaluation. */
export function dimensionScores(
  evaluation: PainPointEvaluation,
): Record<ScoreDimension, number> {
  const result = {} as Record<ScoreDimension, number>;
  for (const dimension of SCORE_DIMENSIONS) {
    result[dimension] = evaluation.scores[dimension].score;
  }
  return result;
}

/** Human-readable reasoning text persisted to pain_points.reasoning_summary. */
export function formatReasoning(evaluation: PainPointEvaluation): string {
  const lines = SCORE_DIMENSIONS.map((dimension) => {
    const entry = evaluation.scores[dimension];
    const evidence = entry.evidenceIds.length > 0 ? ` [${entry.evidenceIds.join(', ')}]` : '';
    return `- ${dimension}: ${entry.score} — ${entry.reason}${evidence}`;
  });
  return `${evaluation.reasoningSummary}\n${lines.join('\n')}`;
}

/** Normalize a cluster key to lowercase kebab-case so equal problems group together. */
export function normalizeClusterKey(key: string): string {
  const normalized = key
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9぀-ヿ一-龯]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'uncategorized';
}
