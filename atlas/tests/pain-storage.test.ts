import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type AtlasDatabase } from '../src/storage/database.js';
import { DocumentRepository } from '../src/storage/repositories.js';
import { PainPointRepository, type SavePainAnalysisInput } from '../src/storage/pain-repository.js';
import type { PainPointEvaluation, StoredDocument } from '../src/core/types.js';

function evaluation(score = 0.7): PainPointEvaluation {
  const dim = { score, reason: 'reason', evidenceIds: ['e1'] };
  return {
    scores: {
      severity: { ...dim },
      frequency: { ...dim },
      willingnessToPay: { ...dim },
      automationFit: { ...dim },
      reachability: { ...dim },
      evidenceQuality: { ...dim },
    },
    confidence: 0.5,
    reasoningSummary: 'summary',
    businessIdeas: [
      {
        name: 'Idea A',
        valueProposition: 'saves hours',
        productType: 'saas-tool',
        targetCustomer: 'cafes',
        suggestedPriceModel: 'monthly-subscription',
        acquisitionChannel: 'communities',
        deliveryMethod: 'web-app',
        humanWorkRequired: 'review',
        estimatedBuildComplexity: 'low',
        validationMethod: 'landing page',
      },
    ],
  };
}

function analysisInput(document: StoredDocument, score = 0.7): SavePainAnalysisInput {
  return {
    document,
    pain: {
      problemStatement: 'Inventory takes hours',
      targetUser: 'cafe owners',
      context: 'weekly stock counting',
      currentWorkaround: 'spreadsheet',
      desiredOutcome: 'automatic counting',
      clusterKey: 'manual-inventory',
      evidence: [
        { evidenceText: 'I spend 6 hours a week on this', evidenceType: 'quote' },
        { evidenceText: 'we still use excel', evidenceType: 'workaround' },
      ],
    },
    evaluation: evaluation(score),
    opportunityScore: score,
    reasoningSummary: 'formatted reasoning',
    analyzerVersion: 'mock@1+mock@1',
    promptVersion: 'p1+p1',
  };
}

describe('PainPointRepository', () => {
  let db: AtlasDatabase;
  let documents: DocumentRepository;
  let repo: PainPointRepository;
  let doc: StoredDocument;

  beforeEach(() => {
    db = openDatabase(':memory:');
    documents = new DocumentRepository(db);
    repo = new PainPointRepository(db);
    doc = documents.upsert({
      sourceId: 'manual',
      externalId: 'x1',
      title: 'doc',
      content: 'content',
      url: 'https://example.com/x1',
    });
  });

  afterEach(() => {
    db.close();
  });

  it('saves a pain point with linked evidence and ideas', () => {
    const pain = repo.saveAnalysis(analysisInput(doc));

    expect(pain.id).toBeGreaterThan(0);
    expect(pain.opportunityScore).toBe(0.7);
    expect(pain.analyzerVersion).toBe('mock@1+mock@1');

    const evidence = repo.getEvidence(pain.id);
    expect(evidence).toHaveLength(2);
    expect(evidence[0]?.painPointId).toBe(pain.id);
    expect(evidence[0]?.documentId).toBe(doc.id);
    expect(evidence[0]?.sourceUrl).toBe('https://example.com/x1');

    const ideas = repo.getIdeas(pain.id);
    expect(ideas).toHaveLength(1);
    expect(ideas[0]?.status).toBe('candidate');
  });

  it('enforces 0-1 CHECK constraints at the database level', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO pain_points (
             document_id, cluster_key, problem_statement, target_user, context,
             current_workaround, desired_outcome, severity, frequency,
             willingness_to_pay, automation_fit, reachability, evidence_quality,
             opportunity_score, confidence, reasoning_summary,
             analyzer_version, prompt_version, created_at
           ) VALUES (?, 'k', 'p', 't', 'c', 'w', 'd', 1.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 'r', 'a', 'p', 'now')`,
        )
        .run(doc.id),
    ).toThrow(/CHECK/);
  });

  it('rejects an invalid build complexity at the database level', () => {
    const input = analysisInput(doc);
    input.evaluation.businessIdeas[0]!.estimatedBuildComplexity =
      'gigantic' as unknown as 'low';
    expect(() => repo.saveAnalysis(input)).toThrow(/CHECK/);
    // the transaction must roll back the pain point as well
    expect(repo.countPains()).toBe(0);
  });

  it('lists pain points ordered by opportunity score', () => {
    repo.saveAnalysis(analysisInput(doc, 0.3));
    repo.saveAnalysis(analysisInput(doc, 0.9));
    const pains = repo.listPains();
    expect(pains[0]?.opportunityScore).toBe(0.9);
    expect(pains[1]?.opportunityScore).toBe(0.3);
  });

  it('tracks analyzed documents per analyzer version', () => {
    expect(repo.findPendingDocuments('v1')).toHaveLength(1);
    repo.recordDocumentAnalyzed(doc.id, 'v1', 0);
    expect(repo.findPendingDocuments('v1')).toHaveLength(0);
    // a different analyzer version sees the document as pending again
    expect(repo.findPendingDocuments('v2')).toHaveLength(1);
  });
});
