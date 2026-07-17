import type {
  AnalysisResult,
  ExtractedEvidence,
  ExtractedPainPoint,
  StoredDocument,
} from './types.js';

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

// --- Two-stage pain point analysis ------------------------------------------

/** An evidence item with the temporary ID ("e1", "e2", ...) used in evaluation output. */
export interface EvidenceRef extends ExtractedEvidence {
  id: string;
}

/** Stage A: extract pain points (with verbatim evidence) from one document. */
export interface PainPointExtractor {
  readonly id: string;
  readonly version: string;
  readonly promptVersion: string;

  extract(document: StoredDocument): Promise<ExtractedPainPoint[]>;
}

/**
 * Stage B: evaluate one pain point and generate business idea candidates.
 * The return value is treated as untrusted: the pipeline validates it with
 * core/scoring.ts normalizeEvaluation() and refuses to persist invalid output.
 */
export interface PainPointEvaluator {
  readonly id: string;
  readonly version: string;
  readonly promptVersion: string;

  evaluate(painPoint: ExtractedPainPoint, evidence: EvidenceRef[]): Promise<unknown>;
}
