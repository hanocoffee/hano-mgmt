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
  content: string;
  url?: string;
  publishedAt?: string; // ISO 8601
  /** Arbitrary source-specific attributes. */
  metadata?: Record<string, unknown>;
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
