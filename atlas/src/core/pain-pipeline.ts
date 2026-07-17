import type { EvidenceRef, PainPointExtractor, PainPointEvaluator } from './analyzer.js';
import type { StoredDocument } from './types.js';
import {
  InvalidEvaluationError,
  computeOpportunityScore,
  dimensionScores,
  formatReasoning,
  normalizeEvaluation,
} from './scoring.js';
import type { DocumentRepository } from '../storage/repositories.js';
import type { PainPointRepository } from '../storage/pain-repository.js';
import type { Logger } from '../logging/logger.js';

export interface PainPipelineDeps {
  extractor: PainPointExtractor;
  evaluator: PainPointEvaluator;
  documents: DocumentRepository;
  painPoints: PainPointRepository;
  logger: Logger;
}

export interface PainAnalysisSummary {
  documentsProcessed: number;
  documentsFailed: number;
  painPointsSaved: number;
  ideasSaved: number;
  evaluationsRejected: number;
}

/**
 * Two-stage pain point analysis:
 *   A. extractor: document → pain points + verbatim evidence
 *   B. evaluator: pain point → dimension scores / business ideas (untrusted)
 * Evaluator output is validated (normalizeEvaluation) and the opportunity
 * score is computed deterministically before anything is persisted.
 */
export class PainAnalysisPipeline {
  constructor(private readonly deps: PainPipelineDeps) {}

  get analyzerVersion(): string {
    const { extractor, evaluator } = this.deps;
    return `${extractor.id}@${extractor.version}+${evaluator.id}@${evaluator.version}`;
  }

  get promptVersion(): string {
    const { extractor, evaluator } = this.deps;
    return `${extractor.promptVersion}+${evaluator.promptVersion}`;
  }

  /**
   * Analyze stored documents. By default only documents this analyzer version
   * has not processed yet; pass `all: true` to re-analyze everything.
   */
  async analyze(options: { all?: boolean; limit?: number } = {}): Promise<PainAnalysisSummary> {
    const { extractor, evaluator, documents, painPoints, logger } = this.deps;
    const docs = options.all
      ? documents.findAll({ limit: options.limit ?? 1000 })
      : painPoints.findPendingDocuments(this.analyzerVersion, options.limit ?? 1000);

    const summary: PainAnalysisSummary = {
      documentsProcessed: 0,
      documentsFailed: 0,
      painPointsSaved: 0,
      ideasSaved: 0,
      evaluationsRejected: 0,
    };

    for (const document of docs) {
      let extracted;
      try {
        extracted = await extractor.extract(document);
      } catch (error) {
        // Not recorded as analyzed, so the next run retries this document.
        summary.documentsFailed += 1;
        logger.error('pain extraction failed', {
          document: document.id,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      let savedForDocument = 0;
      for (const pain of extracted) {
        const evidenceRefs: EvidenceRef[] = pain.evidence.map((item, index) => ({
          id: `e${index + 1}`,
          ...item,
        }));
        try {
          const rawEvaluation = await evaluator.evaluate(pain, evidenceRefs);
          const evaluation = normalizeEvaluation(
            rawEvaluation,
            new Set(evidenceRefs.map((ref) => ref.id)),
          );
          const opportunityScore = computeOpportunityScore(dimensionScores(evaluation));
          const stored = painPoints.saveAnalysis({
            document,
            pain,
            evaluation,
            opportunityScore,
            reasoningSummary: formatReasoning(evaluation),
            analyzerVersion: this.analyzerVersion,
            promptVersion: this.promptVersion,
          });
          savedForDocument += 1;
          summary.painPointsSaved += 1;
          summary.ideasSaved += evaluation.businessIdeas.length;
          logger.info('pain point saved', {
            painPoint: stored.id,
            document: document.id,
            cluster: stored.clusterKey,
            score: stored.opportunityScore,
          });
        } catch (error) {
          summary.evaluationsRejected += 1;
          const level = error instanceof InvalidEvaluationError ? 'warn' : 'error';
          logger[level]('evaluation rejected, nothing saved', {
            document: document.id,
            problem: pain.problemStatement,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      painPoints.recordDocumentAnalyzed(document.id, this.analyzerVersion, savedForDocument);
      summary.documentsProcessed += 1;
    }

    logger.info('pain analysis finished', { ...summary });
    return summary;
  }
}
