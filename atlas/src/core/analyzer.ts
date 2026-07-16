import type { AnalysisResult, StoredDocument } from './types.js';

/** Context passed to an analyzer alongside the documents. */
export interface AnalyzeContext {
  /** The query/topic the documents were collected for, if any. */
  query?: string;
}

/**
 * An AI analysis engine. Implement this interface to plug in a real
 * LLM-backed analyzer (Claude, local model, ...) later — the pipeline
 * and storage layers do not care how the analysis is produced.
 */
export interface MarketAnalyzer {
  /** Unique, stable identifier (stored with each insight). */
  readonly id: string;
  /** Human-readable name shown in CLI output. */
  readonly name: string;

  analyze(documents: StoredDocument[], context?: AnalyzeContext): Promise<AnalysisResult>;
}
