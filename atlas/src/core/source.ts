import type { FetchOptions, SourceItem } from './types.js';

/**
 * A market data source. Implement this interface to plug in a new
 * information source (news API, SNS, e-commerce reviews, scraping, ...).
 *
 * Implementations must be side-effect free apart from I/O needed to fetch:
 * persistence is handled by the pipeline, not the source.
 */
export interface MarketDataSource {
  /** Unique, stable identifier (used as CLI argument and in the DB). */
  readonly id: string;
  /** Human-readable name shown in CLI output. */
  readonly name: string;
  /** Short description of what this source provides. */
  readonly description: string;

  fetchItems(options: FetchOptions): Promise<SourceItem[]>;
}

/** Registry holding all available data sources. */
export class SourceRegistry {
  private readonly sources = new Map<string, MarketDataSource>();

  register(source: MarketDataSource): void {
    if (this.sources.has(source.id)) {
      throw new Error(`Data source already registered: ${source.id}`);
    }
    this.sources.set(source.id, source);
  }

  get(id: string): MarketDataSource {
    const source = this.sources.get(id);
    if (!source) {
      const known = [...this.sources.keys()].join(', ') || '(none)';
      throw new Error(`Unknown data source: ${id} (available: ${known})`);
    }
    return source;
  }

  list(): MarketDataSource[] {
    return [...this.sources.values()];
  }
}
