import { loadConfig, type AtlasConfig } from './config/env.js';
import { SourceRegistry } from './core/source.js';
import type { MarketAnalyzer } from './core/analyzer.js';
import { ResearchPipeline } from './core/pipeline.js';
import { MockNewsSource } from './sources/mock-source.js';
import { MockAnalyzer } from './analyzers/mock-analyzer.js';
import { OpenAIAnalyzer, OpenAIChatClient } from './analyzers/openai-analyzer.js';
import { openDatabase, type AtlasDatabase } from './storage/database.js';
import { DocumentRepository, InsightRepository } from './storage/repositories.js';
import { ConsoleLogger, type Logger } from './logging/logger.js';

export interface AtlasApp {
  config: AtlasConfig;
  logger: Logger;
  db: AtlasDatabase;
  sources: SourceRegistry;
  analyzer: MarketAnalyzer;
  documents: DocumentRepository;
  insights: InsightRepository;
  pipeline: ResearchPipeline;
  close(): void;
}

/** Register new data source implementations here. */
function buildSourceRegistry(): SourceRegistry {
  const registry = new SourceRegistry();
  registry.register(new MockNewsSource());
  return registry;
}

/** Register new analyzer implementations here, keyed by config name. */
function buildAnalyzer(config: AtlasConfig, logger: Logger): MarketAnalyzer {
  const analyzers: Record<string, () => MarketAnalyzer> = {
    mock: () => new MockAnalyzer(),
    openai: () => {
      if (!config.openaiApiKey) {
        throw new Error('ATLAS_ANALYZER=openai requires OPENAI_API_KEY to be set (see .env.example)');
      }
      const client = new OpenAIChatClient({
        apiKey: config.openaiApiKey,
        baseUrl: config.openaiBaseUrl,
      });
      return new OpenAIAnalyzer({ client, model: config.openaiModel, logger });
    },
  };
  const factory = analyzers[config.analyzer];
  if (!factory) {
    throw new Error(
      `Unknown analyzer: ${config.analyzer} (available: ${Object.keys(analyzers).join(', ')})`,
    );
  }
  return factory();
}

/** Composition root: wires config, storage, sources, analyzer and pipeline. */
export function createApp(overrides: Partial<AtlasConfig> = {}): AtlasApp {
  const config = { ...loadConfig(), ...overrides };
  const logger = new ConsoleLogger(config.logLevel, { app: 'atlas' });
  const db = openDatabase(config.dbPath);
  const documents = new DocumentRepository(db);
  const insights = new InsightRepository(db);
  const sources = buildSourceRegistry();
  const analyzer = buildAnalyzer(config, logger.child({ component: 'analyzer' }));
  const pipeline = new ResearchPipeline({ sources, analyzer, documents, insights, logger });

  return {
    config,
    logger,
    db,
    sources,
    analyzer,
    documents,
    insights,
    pipeline,
    close: () => db.close(),
  };
}
