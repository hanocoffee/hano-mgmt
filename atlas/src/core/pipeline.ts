import type { MarketAnalyzer } from './analyzer.js';
import type { SourceRegistry } from './source.js';
import type { FetchOptions, StoredDocument, StoredInsight } from './types.js';
import type { DocumentRepository, InsightRepository } from '../storage/repositories.js';
import type { Logger } from '../logging/logger.js';

export interface CollectResult {
  /** Documents stored, grouped per source. */
  bySource: Record<string, number>;
  documents: StoredDocument[];
}

export interface PipelineDeps {
  sources: SourceRegistry;
  analyzer: MarketAnalyzer;
  documents: DocumentRepository;
  insights: InsightRepository;
  logger: Logger;
}

/**
 * Orchestrates the research flow: fetch from sources → persist →
 * analyze → persist insight. Each step is also callable on its own
 * (used by the `collect` / `analyze` CLI commands).
 */
export class ResearchPipeline {
  constructor(private readonly deps: PipelineDeps) {}

  /** Fetch items from the given sources (all registered sources by default) and store them. */
  async collect(options: FetchOptions & { sourceIds?: string[] } = {}): Promise<CollectResult> {
    const { sources, documents, logger } = this.deps;
    const targets = options.sourceIds?.length
      ? options.sourceIds.map((id) => sources.get(id))
      : sources.list();

    const bySource: Record<string, number> = {};
    const stored: StoredDocument[] = [];
    for (const source of targets) {
      logger.info('fetching from source', { source: source.id, query: options.query });
      try {
        const items = await source.fetchItems({ query: options.query, limit: options.limit });
        const docs = documents.upsertMany(items);
        bySource[source.id] = docs.length;
        stored.push(...docs);
        logger.info('stored documents', { source: source.id, count: docs.length });
      } catch (error) {
        logger.error('source fetch failed', {
          source: source.id,
          error: error instanceof Error ? error.message : String(error),
        });
        bySource[source.id] = 0;
      }
    }
    return { bySource, documents: stored };
  }

  /** Analyze the given documents (all stored documents by default) and persist the insight. */
  async analyze(options: { query?: string; docs?: StoredDocument[] } = {}): Promise<StoredInsight> {
    const { analyzer, documents, insights, logger } = this.deps;
    const docs = options.docs ?? documents.findAll();
    logger.info('running analyzer', { analyzer: analyzer.id, documents: docs.length });
    const result = await analyzer.analyze(docs, { query: options.query });
    const insight = insights.save(result);
    logger.info('insight stored', { insight: insight.id, sentiment: insight.sentiment });
    return insight;
  }

  /** Full run: collect from all (or selected) sources, then analyze what was collected. */
  async run(options: FetchOptions & { sourceIds?: string[] } = {}): Promise<{
    collected: CollectResult;
    insight: StoredInsight;
  }> {
    const collected = await this.collect(options);
    const insight = await this.analyze({ query: options.query, docs: collected.documents });
    return { collected, insight };
  }
}
