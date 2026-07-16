import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ResearchPipeline } from '../src/core/pipeline.js';
import { SourceRegistry, type MarketDataSource } from '../src/core/source.js';
import type { AnalysisResult, FetchOptions, SourceItem, StoredDocument } from '../src/core/types.js';
import type { MarketAnalyzer } from '../src/core/analyzer.js';
import { openDatabase, type AtlasDatabase } from '../src/storage/database.js';
import { DocumentRepository, InsightRepository } from '../src/storage/repositories.js';
import { NullLogger } from '../src/logging/logger.js';

class FakeSource implements MarketDataSource {
  constructor(
    readonly id: string,
    private readonly items: SourceItem[],
    private readonly shouldFail = false,
  ) {}

  readonly name = 'Fake';
  readonly description = 'Fake source for tests';

  async fetchItems(_options: FetchOptions): Promise<SourceItem[]> {
    if (this.shouldFail) throw new Error('boom');
    return this.items;
  }
}

class FakeAnalyzer implements MarketAnalyzer {
  readonly id = 'fake';
  readonly name = 'Fake Analyzer';
  lastDocuments: StoredDocument[] = [];

  async analyze(documents: StoredDocument[]): Promise<AnalysisResult> {
    this.lastDocuments = documents;
    return {
      analyzerId: this.id,
      summary: `analyzed ${documents.length}`,
      sentiment: 'positive',
      keywords: ['test'],
      opportunityScore: 0.9,
      documentIds: documents.map((d) => d.id),
    };
  }
}

function sourceItem(sourceId: string, externalId: string): SourceItem {
  return { sourceId, externalId, title: `t-${externalId}`, content: `c-${externalId}` };
}

describe('ResearchPipeline', () => {
  let db: AtlasDatabase;
  let documents: DocumentRepository;
  let insights: InsightRepository;
  let registry: SourceRegistry;
  let analyzer: FakeAnalyzer;

  beforeEach(() => {
    db = openDatabase(':memory:');
    documents = new DocumentRepository(db);
    insights = new InsightRepository(db);
    registry = new SourceRegistry();
    analyzer = new FakeAnalyzer();
  });

  afterEach(() => {
    db.close();
  });

  function pipeline(): ResearchPipeline {
    return new ResearchPipeline({
      sources: registry,
      analyzer,
      documents,
      insights,
      logger: new NullLogger(),
    });
  }

  it('collects from all registered sources and stores documents', async () => {
    registry.register(new FakeSource('s1', [sourceItem('s1', 'a'), sourceItem('s1', 'b')]));
    registry.register(new FakeSource('s2', [sourceItem('s2', 'a')]));

    const result = await pipeline().collect();

    expect(result.bySource).toEqual({ s1: 2, s2: 1 });
    expect(documents.count()).toBe(3);
  });

  it('collects only from selected sources', async () => {
    registry.register(new FakeSource('s1', [sourceItem('s1', 'a')]));
    registry.register(new FakeSource('s2', [sourceItem('s2', 'a')]));

    const result = await pipeline().collect({ sourceIds: ['s2'] });

    expect(result.bySource).toEqual({ s2: 1 });
    expect(documents.count()).toBe(1);
  });

  it('continues collecting when one source fails', async () => {
    registry.register(new FakeSource('bad', [], true));
    registry.register(new FakeSource('good', [sourceItem('good', 'a')]));

    const result = await pipeline().collect();

    expect(result.bySource).toEqual({ bad: 0, good: 1 });
  });

  it('run() analyzes exactly the collected documents and stores the insight', async () => {
    registry.register(new FakeSource('s1', [sourceItem('s1', 'a')]));

    const { collected, insight } = await pipeline().run({ query: 'coffee' });

    expect(analyzer.lastDocuments).toHaveLength(1);
    expect(insight.documentIds).toEqual(collected.documents.map((d) => d.id));
    expect(insights.findLatest()).toHaveLength(1);
  });

  it('throws for an unknown source id', async () => {
    await expect(pipeline().collect({ sourceIds: ['missing'] })).rejects.toThrow(
      /Unknown data source: missing/,
    );
  });
});
