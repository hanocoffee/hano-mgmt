import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PainAnalysisPipeline } from '../src/core/pain-pipeline.js';
import { MockPainExtractor, MockPainEvaluator } from '../src/analyzers/mock-pain-analyzer.js';
import type { PainPointEvaluator } from '../src/core/analyzer.js';
import { openDatabase, type AtlasDatabase } from '../src/storage/database.js';
import { DocumentRepository } from '../src/storage/repositories.js';
import { PainPointRepository } from '../src/storage/pain-repository.js';
import { NullLogger } from '../src/logging/logger.js';
import { parseSourceItems } from '../src/sources/file-import.js';
import {
  buildOpportunityReport,
  renderReportJson,
  renderReportMarkdown,
} from '../src/reports/opportunity-report.js';

const IMPORT_FILE = JSON.stringify([
  {
    title: 'Cafe owners waste hours on manual inventory',
    content:
      'I spend 6 hours every week counting stock in a spreadsheet. I would pay for a tool that automates this manual data entry.',
    url: 'https://example.com/post-1',
  },
  {
    title: 'Freelancers struggle with weekly invoicing',
    content:
      'Every week I lose an evening to invoicing by hand. My current workaround is a spreadsheet and it keeps breaking.',
  },
]);

describe('PainAnalysisPipeline (end-to-end with mock analyzers)', () => {
  let db: AtlasDatabase;
  let documents: DocumentRepository;
  let painPoints: PainPointRepository;

  beforeEach(() => {
    db = openDatabase(':memory:');
    documents = new DocumentRepository(db);
    painPoints = new PainPointRepository(db);
    documents.upsertMany(parseSourceItems(IMPORT_FILE).items);
  });

  afterEach(() => {
    db.close();
  });

  function pipeline(evaluator: PainPointEvaluator = new MockPainEvaluator()): PainAnalysisPipeline {
    return new PainAnalysisPipeline({
      extractor: new MockPainExtractor(),
      evaluator,
      documents,
      painPoints,
      logger: new NullLogger(),
    });
  }

  it('imports, extracts, evaluates and stores pain points with ideas', async () => {
    const summary = await pipeline().analyze();

    expect(summary.documentsProcessed).toBe(2);
    // v2 extractor: doc 1 yields 1 pain, doc 2 yields 2 (multi-pain per post)
    expect(summary.painPointsSaved).toBe(3);
    expect(summary.ideasSaved).toBe(3);
    expect(summary.evaluationsRejected).toBe(0);

    const pains = painPoints.listPains();
    expect(pains).toHaveLength(3);
    for (const pain of pains) {
      expect(pain.opportunityScore).toBeGreaterThanOrEqual(0);
      expect(pain.opportunityScore).toBeLessThanOrEqual(1);
      expect(painPoints.getEvidence(pain.id).length).toBeGreaterThan(0);
      expect(pain.analyzerVersion).toBe('mock@2+mock@1');
    }
    expect(painPoints.listIdeas().length).toBe(3);
  });

  it('skips already analyzed documents on the next run', async () => {
    await pipeline().analyze();
    const second = await pipeline().analyze();
    expect(second.documentsProcessed).toBe(0);
    expect(painPoints.countPains()).toBe(3);
  });

  it('re-analyzes everything with all: true', async () => {
    await pipeline().analyze();
    const rerun = await pipeline().analyze({ all: true });
    expect(rerun.documentsProcessed).toBe(2);
  });

  it('does not persist anything when the evaluator returns invalid output', async () => {
    const brokenEvaluator: PainPointEvaluator = {
      id: 'broken',
      version: '1',
      promptVersion: 'broken@1',
      evaluate: async () => ({ scores: { severity: { score: 5 } } }),
    };
    const summary = await pipeline(brokenEvaluator).analyze();

    expect(summary.painPointsSaved).toBe(0);
    expect(summary.evaluationsRejected).toBe(3);
    expect(painPoints.countPains()).toBe(0);
    expect(painPoints.countIdeas()).toBe(0);
  });

  it('produces a markdown and JSON report with clusters and top pain points', async () => {
    await pipeline().analyze();

    const report = buildOpportunityReport({ documents, painPoints }, 5);
    expect(report.totals.painPoints).toBe(3);
    expect(report.totals.clusters).toBeGreaterThan(0);
    expect(report.topPainPoints.length).toBe(3);
    expect(report.opportunities.length).toBeGreaterThan(0);
    expect(report.opportunities[0]?.score).toBeGreaterThan(0);

    const markdown = renderReportMarkdown(report);
    expect(markdown).toContain('# Atlas Opportunity Report');
    expect(markdown).toContain('## Opportunities (top clusters)');
    expect(markdown).toContain('Cafe owners waste hours on manual inventory');
    expect(markdown).toContain('### Evidence');
    expect(markdown).toContain('### Business ideas');

    const parsed = JSON.parse(renderReportJson(report)) as typeof report;
    expect(parsed.topPainPoints).toHaveLength(3);
    expect(parsed.opportunities.length).toBeGreaterThan(0);
  });
});
