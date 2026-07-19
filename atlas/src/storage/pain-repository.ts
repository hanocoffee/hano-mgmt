import type { AtlasDatabase } from './database.js';
import type {
  ExtractedPainPoint,
  PainPointEvaluation,
  StoredBusinessIdea,
  StoredDocument,
  StoredEvidence,
  StoredPainPoint,
} from '../core/types.js';

interface PainPointRow {
  id: number;
  document_id: number;
  cluster_key: string;
  problem_statement: string;
  target_user: string;
  context: string;
  current_workaround: string;
  desired_outcome: string;
  severity: number;
  frequency: number;
  willingness_to_pay: number;
  automation_fit: number;
  reachability: number;
  evidence_quality: number;
  opportunity_score: number;
  confidence: number;
  reasoning_summary: string;
  analyzer_version: string;
  prompt_version: string;
  created_at: string;
}

interface EvidenceRow {
  id: number;
  pain_point_id: number;
  document_id: number;
  evidence_text: string;
  evidence_type: string;
  source_url: string | null;
  published_at: string | null;
  created_at: string;
}

interface BusinessIdeaRow {
  id: number;
  pain_point_id: number;
  name: string;
  value_proposition: string;
  product_type: string;
  target_customer: string;
  suggested_price_model: string;
  acquisition_channel: string;
  delivery_method: string;
  human_work_required: string;
  estimated_build_complexity: string;
  validation_method: string;
  status: string;
  created_at: string;
}

interface DocumentRow {
  id: number;
  source_id: string;
  external_id: string;
  title: string;
  content: string;
  original_quote: string | null;
  summary: string | null;
  url: string | null;
  published_at: string | null;
  metadata: string | null;
  collected_at: string;
}

function rowToPainPoint(row: PainPointRow): StoredPainPoint {
  return {
    id: row.id,
    documentId: row.document_id,
    clusterKey: row.cluster_key,
    problemStatement: row.problem_statement,
    targetUser: row.target_user,
    context: row.context,
    currentWorkaround: row.current_workaround,
    desiredOutcome: row.desired_outcome,
    severity: row.severity,
    frequency: row.frequency,
    willingnessToPay: row.willingness_to_pay,
    automationFit: row.automation_fit,
    reachability: row.reachability,
    evidenceQuality: row.evidence_quality,
    opportunityScore: row.opportunity_score,
    confidence: row.confidence,
    reasoningSummary: row.reasoning_summary,
    analyzerVersion: row.analyzer_version,
    promptVersion: row.prompt_version,
    createdAt: row.created_at,
  };
}

function rowToEvidence(row: EvidenceRow): StoredEvidence {
  return {
    id: row.id,
    painPointId: row.pain_point_id,
    documentId: row.document_id,
    evidenceText: row.evidence_text,
    evidenceType: row.evidence_type,
    sourceUrl: row.source_url ?? undefined,
    publishedAt: row.published_at ?? undefined,
    createdAt: row.created_at,
  };
}

function rowToIdea(row: BusinessIdeaRow): StoredBusinessIdea {
  return {
    id: row.id,
    painPointId: row.pain_point_id,
    name: row.name,
    valueProposition: row.value_proposition,
    productType: row.product_type,
    targetCustomer: row.target_customer,
    suggestedPriceModel: row.suggested_price_model,
    acquisitionChannel: row.acquisition_channel,
    deliveryMethod: row.delivery_method,
    humanWorkRequired: row.human_work_required,
    estimatedBuildComplexity: row.estimated_build_complexity as StoredBusinessIdea['estimatedBuildComplexity'],
    validationMethod: row.validation_method,
    status: row.status,
    createdAt: row.created_at,
  };
}

function rowToDocument(row: DocumentRow): StoredDocument {
  return {
    id: row.id,
    sourceId: row.source_id,
    externalId: row.external_id,
    title: row.title,
    content: row.content,
    originalQuote: row.original_quote ?? undefined,
    summary: row.summary ?? undefined,
    url: row.url ?? undefined,
    publishedAt: row.published_at ?? undefined,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
    collectedAt: row.collected_at,
  };
}

export interface SavePainAnalysisInput {
  document: StoredDocument;
  pain: ExtractedPainPoint;
  /** Must already be validated by core/scoring.ts normalizeEvaluation(). */
  evaluation: PainPointEvaluation;
  /** Computed by core/scoring.ts computeOpportunityScore(). */
  opportunityScore: number;
  reasoningSummary: string;
  analyzerVersion: string;
  promptVersion: string;
}

export interface IdeaWithContext extends StoredBusinessIdea {
  opportunityScore: number;
  problemStatement: string;
}

export class PainPointRepository {
  constructor(private readonly db: AtlasDatabase) {}

  /** Persist one pain point with its evidence and business ideas atomically. */
  saveAnalysis(input: SavePainAnalysisInput): StoredPainPoint {
    const now = new Date().toISOString();
    const painId = this.db.transaction(() => {
      const scores = input.evaluation.scores;
      const info = this.db
        .prepare(
          `INSERT INTO pain_points (
             document_id, cluster_key, problem_statement, target_user, context,
             current_workaround, desired_outcome,
             severity, frequency, willingness_to_pay, automation_fit, reachability,
             evidence_quality, opportunity_score, confidence, reasoning_summary,
             analyzer_version, prompt_version, created_at
           ) VALUES (
             @documentId, @clusterKey, @problemStatement, @targetUser, @context,
             @currentWorkaround, @desiredOutcome,
             @severity, @frequency, @willingnessToPay, @automationFit, @reachability,
             @evidenceQuality, @opportunityScore, @confidence, @reasoningSummary,
             @analyzerVersion, @promptVersion, @createdAt
           )`,
        )
        .run({
          documentId: input.document.id,
          clusterKey: input.pain.clusterKey,
          problemStatement: input.pain.problemStatement,
          targetUser: input.pain.targetUser,
          context: input.pain.context,
          currentWorkaround: input.pain.currentWorkaround,
          desiredOutcome: input.pain.desiredOutcome,
          severity: scores.severity.score,
          frequency: scores.frequency.score,
          willingnessToPay: scores.willingnessToPay.score,
          automationFit: scores.automationFit.score,
          reachability: scores.reachability.score,
          evidenceQuality: scores.evidenceQuality.score,
          opportunityScore: input.opportunityScore,
          confidence: input.evaluation.confidence,
          reasoningSummary: input.reasoningSummary,
          analyzerVersion: input.analyzerVersion,
          promptVersion: input.promptVersion,
          createdAt: now,
        });
      const id = Number(info.lastInsertRowid);

      const insertEvidence = this.db.prepare(
        `INSERT INTO evidence (pain_point_id, document_id, evidence_text, evidence_type, source_url, published_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const item of input.pain.evidence) {
        insertEvidence.run(
          id,
          input.document.id,
          item.evidenceText,
          item.evidenceType,
          input.document.url ?? null,
          input.document.publishedAt ?? null,
          now,
        );
      }

      const insertIdea = this.db.prepare(
        `INSERT INTO business_ideas (
           pain_point_id, name, value_proposition, product_type, target_customer,
           suggested_price_model, acquisition_channel, delivery_method,
           human_work_required, estimated_build_complexity, validation_method, status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'candidate', ?)`,
      );
      for (const idea of input.evaluation.businessIdeas) {
        insertIdea.run(
          id,
          idea.name,
          idea.valueProposition,
          idea.productType,
          idea.targetCustomer,
          idea.suggestedPriceModel,
          idea.acquisitionChannel,
          idea.deliveryMethod,
          idea.humanWorkRequired,
          idea.estimatedBuildComplexity,
          idea.validationMethod,
          now,
        );
      }
      return id;
    })();

    const row = this.db.prepare('SELECT * FROM pain_points WHERE id = ?').get(painId) as PainPointRow;
    return rowToPainPoint(row);
  }

  listPains(limit = 20): StoredPainPoint[] {
    const rows = this.db
      .prepare('SELECT * FROM pain_points ORDER BY opportunity_score DESC, id ASC LIMIT ?')
      .all(limit) as PainPointRow[];
    return rows.map(rowToPainPoint);
  }

  listIdeas(limit = 20): IdeaWithContext[] {
    const rows = this.db
      .prepare(
        `SELECT bi.*, pp.opportunity_score, pp.problem_statement
         FROM business_ideas bi
         JOIN pain_points pp ON pp.id = bi.pain_point_id
         ORDER BY pp.opportunity_score DESC, bi.id ASC LIMIT ?`,
      )
      .all(limit) as (BusinessIdeaRow & { opportunity_score: number; problem_statement: string })[];
    return rows.map((row) => ({
      ...rowToIdea(row),
      opportunityScore: row.opportunity_score,
      problemStatement: row.problem_statement,
    }));
  }

  getEvidence(painPointId: number): StoredEvidence[] {
    const rows = this.db
      .prepare('SELECT * FROM evidence WHERE pain_point_id = ? ORDER BY id ASC')
      .all(painPointId) as EvidenceRow[];
    return rows.map(rowToEvidence);
  }

  getIdeas(painPointId: number): StoredBusinessIdea[] {
    const rows = this.db
      .prepare('SELECT * FROM business_ideas WHERE pain_point_id = ? ORDER BY id ASC')
      .all(painPointId) as BusinessIdeaRow[];
    return rows.map(rowToIdea);
  }

  countPains(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM pain_points').get() as {
      count: number;
    };
    return row.count;
  }

  countIdeas(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM business_ideas').get() as {
      count: number;
    };
    return row.count;
  }

  /** Record that a document was analyzed (even if zero pain points were found). */
  recordDocumentAnalyzed(documentId: number, analyzerVersion: string, painPointCount: number): void {
    this.db
      .prepare(
        `INSERT INTO document_analysis (document_id, analyzer_version, analyzed_at, pain_point_count)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (document_id, analyzer_version) DO UPDATE SET
           analyzed_at = excluded.analyzed_at,
           pain_point_count = excluded.pain_point_count`,
      )
      .run(documentId, analyzerVersion, new Date().toISOString(), painPointCount);
  }

  /** Documents not yet analyzed by the given analyzer version. */
  findPendingDocuments(analyzerVersion: string, limit = 1000): StoredDocument[] {
    const rows = this.db
      .prepare(
        `SELECT d.* FROM documents d
         LEFT JOIN document_analysis da
           ON da.document_id = d.id AND da.analyzer_version = ?
         WHERE da.document_id IS NULL
         ORDER BY d.id ASC LIMIT ?`,
      )
      .all(analyzerVersion, limit) as DocumentRow[];
    return rows.map(rowToDocument);
  }
}
