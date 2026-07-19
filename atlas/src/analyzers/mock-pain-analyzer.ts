import type { EvidenceRef, PainPointExtractor, PainPointEvaluator } from '../core/analyzer.js';
import type {
  DimensionScore,
  ExtractedPainPoint,
  PainPointEvaluation,
  ScoreDimension,
  StoredDocument,
} from '../core/types.js';
import { documentAnalysisText } from '../core/types.js';
import { normalizeClusterKey } from '../core/scoring.js';

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.。!！?？])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** A sentence expressing a distinct problem becomes its own pain point. */
const PAIN_SIGNAL =
  /struggle|hate|waste|spend|hours|lose|lost|miss|missed|cannot|can't|difficult|hard|overwhelm|behind|late|unpaid|ghost|awkward|tired|stress|complex|break|unreliable|risky|fear|creep|no-show|困|つらい|大変|時間|失/i;

/**
 * Shared cluster taxonomy so pain points describing the same underlying
 * problem land in the same cluster across documents. First match wins.
 */
const CLUSTER_TAXONOMY: [string, RegExp][] = [
  ['invoice-payment-collection', /invoic|payment|paid|unpaid|pay |chas|billing|deposit|overdue|cash flow|請求|入金|支払/i],
  ['scope-contract-management', /scope|contract|revision|proposal|quote|agreement|creep|deliverable|見積|契約|修正/i],
  ['booking-scheduling', /booking|appointment|no-show|schedul|calendar|shift|availability|turnover|予約|シフト/i],
  ['client-communication-response', /call|dm|message|inquir|respond|reply|after-hours|answer|lead|問い合わせ|電話|返信/i],
  ['social-media-content', /social|post|instagram|facebook|tiktok|content|platform|engagement|trend|SNS|投稿/i],
  ['tool-fragmentation', /tools|software|spreadsheet|excel|sheets|switching|separate|quickbooks|manual data|手作業|転記/i],
  ['delegation-team-visibility', /delegat|staff|employee|team|ownership|visibility|cc |communicat|外注|委任/i],
];

function categorize(text: string, fallbackTitle: string): string {
  for (const [key, pattern] of CLUSTER_TAXONOMY) {
    if (pattern.test(text)) return key;
  }
  return normalizeClusterKey(fallbackTitle.split(/\s+/).slice(0, 4).join('-') || 'uncategorized');
}

/**
 * Deterministic offline extractor (v2): analyzes the poster's own words
 * (originalQuote when present) and extracts up to 3 pain points — one per
 * sentence expressing a distinct problem — with verbatim sentence evidence
 * and taxonomy-based cluster keys shared across documents.
 */
export class MockPainExtractor implements PainPointExtractor {
  readonly id = 'mock';
  readonly version = '2';
  readonly promptVersion = 'mock-extract@2';

  async extract(document: StoredDocument): Promise<ExtractedPainPoint[]> {
    const text = documentAnalysisText(document);
    const parts = sentences(text);
    if (parts.length === 0) return [];

    const painSentences = parts.filter((sentence) => PAIN_SIGNAL.test(sentence)).slice(0, 3);
    const workaround = parts.find((s) => /manual|spreadsheet|by hand|workaround|手作業|手動/i.test(s));
    const targetUser = this.guessTargetUser(document);

    const toPain = (statement: string, evidenceSentences: string[]): ExtractedPainPoint => ({
      problemStatement: statement.length > 140 ? `${statement.slice(0, 137)}...` : statement,
      targetUser,
      context: document.title,
      currentWorkaround: workaround ?? '不明',
      desiredOutcome: `Solve: ${document.title}`,
      clusterKey: categorize(`${statement} ${document.title}`, document.title),
      evidence: evidenceSentences
        .slice(0, 2)
        .map((evidenceText) => ({ evidenceText, evidenceType: 'quote' })),
    });

    if (painSentences.length === 0) {
      return [toPain(document.title, parts)];
    }
    return painSentences.map((sentence) => toPain(sentence, [sentence]));
  }

  private guessTargetUser(document: StoredDocument): string {
    const segment = document.metadata?.targetSegment;
    if (typeof segment === 'string' && segment) {
      return `${segment} segment`;
    }
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
