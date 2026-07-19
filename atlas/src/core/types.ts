/**
 * Core domain types shared across sources, storage, and analyzers.
 */

/** A single item fetched from a data source (article, post, review, etc.). */
export interface SourceItem {
  /** ID of the source that produced this item. */
  sourceId: string;
  /** Stable identifier within the source, used for deduplication. */
  externalId: string;
  title: string;
  /** Full text when available. Falls back to originalQuote/summary on import. */
  content: string;
  /**
   * Short verbatim quote from the poster (target 25-300 chars, minimal
   * necessary excerpt). Analysis prefers this over content/summary.
   */
  originalQuote?: string;
  /** Paraphrased summary, used for report display — never for analysis. */
  summary?: string;
  url?: string;
  publishedAt?: string; // ISO 8601
  /** Arbitrary source-specific attributes. */
  metadata?: Record<string, unknown>;
}

/**
 * The text analyzers should reason over: the poster's own words when we
 * have them, otherwise the collected content.
 */
export function documentAnalysisText(item: Pick<SourceItem, 'content' | 'originalQuote'>): string {
  return item.originalQuote && item.originalQuote.trim() ? item.originalQuote.trim() : item.content;
}

/** A source item after it has been persisted. */
export interface StoredDocument extends SourceItem {
  id: number;
  collectedAt: string; // ISO 8601
}

export type Sentiment = 'positive' | 'neutral' | 'negative';

/** Result produced by an analyzer over a set of documents. */
export interface AnalysisResult {
  analyzerId: string;
  /** Free-text summary of the findings. */
  summary: string;
  sentiment: Sentiment;
  /** Ranked keywords / topics extracted from the documents. */
  keywords: string[];
  /** Opportunity score in [0, 1] — how promising the analyzed segment looks. */
  opportunityScore: number;
  /** IDs of the documents that were analyzed. */
  documentIds: number[];
}

/** A persisted analysis result. */
export interface StoredInsight extends AnalysisResult {
  id: number;
  createdAt: string; // ISO 8601
}

/** Options passed to a data source when fetching. */
export interface FetchOptions {
  /** Search topic / keyword driving the collection. */
  query?: string;
  /** Upper bound on the number of items to return. */
  limit?: number;
}

// --- Pain point analysis model ---------------------------------------------

/** A verbatim piece of evidence extracted from a document. */
export interface ExtractedEvidence {
  /** Verbatim quote from the source document. */
  evidenceText: string;
  /** quote | complaint | workaround | pricing | other */
  evidenceType: string;
}

/** A pain point extracted from a document (stage A, before evaluation). */
export interface ExtractedPainPoint {
  problemStatement: string;
  targetUser: string;
  context: string;
  currentWorkaround: string;
  desiredOutcome: string;
  /** Normalized key grouping pain points that describe the same problem. */
  clusterKey: string;
  evidence: ExtractedEvidence[];
}

export type ScoreDimension =
  | 'severity'
  | 'frequency'
  | 'willingnessToPay'
  | 'automationFit'
  | 'reachability'
  | 'evidenceQuality';

/** A single evaluated dimension. Scores without reason/evidence are rejected or capped. */
export interface DimensionScore {
  score: number; // 0-1
  reason: string;
  /** IDs of the evidence items (e.g. "e1") supporting this score. */
  evidenceIds: string[];
}

export type BuildComplexity = 'low' | 'medium' | 'high';

/** A business idea candidate generated from a pain point (stage B output). */
export interface BusinessIdeaDraft {
  name: string;
  valueProposition: string;
  productType: string;
  targetCustomer: string;
  suggestedPriceModel: string;
  acquisitionChannel: string;
  deliveryMethod: string;
  humanWorkRequired: string;
  estimatedBuildComplexity: BuildComplexity;
  validationMethod: string;
}

/** Full evaluation of one pain point (stage B, validated by core/scoring.ts). */
export interface PainPointEvaluation {
  scores: Record<ScoreDimension, DimensionScore>;
  /** How much to trust this evaluation. Kept separate from opportunityScore. */
  confidence: number; // 0-1
  reasoningSummary: string;
  businessIdeas: BusinessIdeaDraft[];
}

export interface StoredPainPoint {
  id: number;
  documentId: number;
  clusterKey: string;
  problemStatement: string;
  targetUser: string;
  context: string;
  currentWorkaround: string;
  desiredOutcome: string;
  severity: number;
  frequency: number;
  willingnessToPay: number;
  automationFit: number;
  reachability: number;
  evidenceQuality: number;
  /** Computed deterministically in TypeScript (core/scoring.ts), never by the LLM. */
  opportunityScore: number;
  confidence: number;
  reasoningSummary: string;
  analyzerVersion: string;
  promptVersion: string;
  createdAt: string;
}

export interface StoredEvidence {
  id: number;
  painPointId: number;
  documentId: number;
  evidenceText: string;
  evidenceType: string;
  sourceUrl?: string;
  publishedAt?: string;
  createdAt: string;
}

export interface StoredBusinessIdea extends BusinessIdeaDraft {
  id: number;
  painPointId: number;
  status: string;
  createdAt: string;
}
