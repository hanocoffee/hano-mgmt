import type { EvidenceRef, PainPointExtractor, PainPointEvaluator } from '../core/analyzer.js';
import type {
  DimensionScore,
  ExtractedPainPoint,
  PainPointEvaluation,
  ScoreDimension,
  StoredDocument,
} from '../core/types.js';
import { normalizeClusterKey } from '../core/scoring.js';

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.。!！?？])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Deterministic offline extractor: turns each non-empty document into one
 * pain point with verbatim sentence evidence. Used for tests and dry runs.
 */
export class MockPainExtractor implements PainPointExtractor {
  readonly id = 'mock';
  readonly version = '1';
  readonly promptVersion = 'mock-extract@1';

  async extract(document: StoredDocument): Promise<ExtractedPainPoint[]> {
    const parts = sentences(document.content);
    if (parts.length === 0) return [];
    const workaround = parts.find((s) => /manual|spreadsheet|by hand|手作業|手動/i.test(s));
    return [
      {
        problemStatement: document.title,
        targetUser: this.guessTargetUser(document),
        context: parts[0] ?? document.title,
        currentWorkaround: workaround ?? '不明',
        desiredOutcome: `Solve: ${document.title}`,
        clusterKey: normalizeClusterKey(
          document.title.split(/\s+/).slice(0, 4).join('-') || 'uncategorized',
        ),
        evidence: parts.slice(0, 2).map((text) => ({ evidenceText: text, evidenceType: 'quote' })),
      },
    ];
  }

  private guessTargetUser(document: StoredDocument): string {
    const tags = document.metadata?.tags;
    if (Array.isArray(tags) && typeof tags[0] === 'string') {
      return `${tags[0]} segment`;
    }
    return 'unknown';
  }
}

const DIMENSION_TRIGGERS: Record<ScoreDimension, RegExp> = {
  severity: /waste|hours|cost|struggle|lose|損|時間|コスト/i,
  frequency: /week|daily|every|repeat|毎週|毎日|繰り返/i,
  willingnessToPay: /pay|price|subscription|paid|tool|料金|有料|課金/i,
  automationFit: /manual|spreadsheet|repetitive|data entry|手作業|手動|転記/i,
  reachability: /community|forum|reddit|sns|コミュニティ/i,
  evidenceQuality: /survey|report|found|調査|レビュー/i,
};

/**
 * Deterministic offline evaluator: keyword-triggered dimension scores with
 * reasons and evidence references, plus one templated business idea.
 */
export class MockPainEvaluator implements PainPointEvaluator {
  readonly id = 'mock';
  readonly version = '1';
  readonly promptVersion = 'mock-evaluate@1';

  async evaluate(
    painPoint: ExtractedPainPoint,
    evidence: EvidenceRef[],
  ): Promise<PainPointEvaluation> {
    const scores = {} as Record<ScoreDimension, DimensionScore>;
    for (const [dimension, trigger] of Object.entries(DIMENSION_TRIGGERS) as [
      ScoreDimension,
      RegExp,
    ][]) {
      const supporting = evidence.filter((item) => trigger.test(item.evidenceText));
      const inPainFields = trigger.test(
        `${painPoint.problemStatement} ${painPoint.context} ${painPoint.currentWorkaround}`,
      );
      const score = supporting.length > 0 ? 0.7 : inPainFields ? 0.5 : 0.3;
      scores[dimension] = {
        score,
        reason:
          supporting.length > 0
            ? `evidence matches ${dimension} signal`
            : inPainFields
              ? `pain point fields mention a ${dimension} signal`
              : `no ${dimension} signal found`,
        evidenceIds: supporting.map((item) => item.id),
      };
    }

    return {
      scores,
      confidence: evidence.length >= 2 ? 0.6 : 0.4,
      reasoningSummary: `Heuristic evaluation of "${painPoint.problemStatement}" based on keyword signals.`,
      businessIdeas: [
        {
          name: `${painPoint.clusterKey} assistant`,
          valueProposition: `${painPoint.desiredOutcome} を自動化するツール`,
          productType: 'saas-tool',
          targetCustomer: painPoint.targetUser,
          suggestedPriceModel: 'monthly-subscription',
          acquisitionChannel: 'online communities',
          deliveryMethod: 'web-app',
          humanWorkRequired: 'setup and review',
          estimatedBuildComplexity: 'medium',
          validationMethod: 'landing page with pre-order',
        },
      ],
    };
  }
}
