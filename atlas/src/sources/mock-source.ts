import type { MarketDataSource } from '../core/source.js';
import type { FetchOptions, SourceItem } from '../core/types.js';

interface MockRecord {
  externalId: string;
  title: string;
  content: string;
  url: string;
  publishedAt: string;
  tags: string[];
}

const SAMPLE_RECORDS: MockRecord[] = [
  {
    externalId: 'mock-001',
    title: 'AI-powered coffee subscription services see 40% growth',
    content:
      'Subscription coffee services using AI to personalize roast recommendations grew 40% year over year. Customers report higher satisfaction and lower churn when recommendations adapt to their taste feedback.',
    url: 'https://example.com/articles/ai-coffee-subscription',
    publishedAt: '2026-06-01T09:00:00Z',
    tags: ['ai', 'coffee', 'subscription', 'growth'],
  },
  {
    externalId: 'mock-002',
    title: 'Small cafes struggle with inventory management costs',
    content:
      'A survey of 500 independent cafes found that manual inventory management wastes an average of 6 hours per week. Owners cite a lack of affordable tools designed for small operations as the main pain point.',
    url: 'https://example.com/articles/cafe-inventory-pain',
    publishedAt: '2026-06-10T09:00:00Z',
    tags: ['cafe', 'inventory', 'pain-point', 'smb'],
  },
  {
    externalId: 'mock-003',
    title: 'Demand rises for AI market research tools among solo founders',
    content:
      'Solo founders and micro businesses increasingly buy AI research tools priced under $50/month. The segment values automated summaries and opportunity scoring over raw data access.',
    url: 'https://example.com/articles/ai-research-tools-demand',
    publishedAt: '2026-06-20T09:00:00Z',
    tags: ['ai', 'market-research', 'saas', 'pricing'],
  },
  {
    externalId: 'mock-004',
    title: 'Negative reviews highlight complexity of enterprise analytics suites',
    content:
      'Review analysis shows frustration with enterprise analytics platforms: long onboarding, unused features, and high seat prices. Users say they would switch to a simpler, cheaper alternative.',
    url: 'https://example.com/articles/enterprise-analytics-complaints',
    publishedAt: '2026-07-01T09:00:00Z',
    tags: ['analytics', 'enterprise', 'complaints', 'switching'],
  },
];

/**
 * Static sample source used until real API integrations are added.
 * Demonstrates the MarketDataSource contract, including query filtering.
 */
export class MockNewsSource implements MarketDataSource {
  readonly id = 'mock-news';
  readonly name = 'Mock News Feed';
  readonly description = 'Built-in sample articles for development (no external API)';

  async fetchItems(options: FetchOptions = {}): Promise<SourceItem[]> {
    const query = options.query?.toLowerCase();
    let records = SAMPLE_RECORDS;
    if (query) {
      records = records.filter(
        (r) =>
          r.title.toLowerCase().includes(query) ||
          r.content.toLowerCase().includes(query) ||
          r.tags.some((t) => t.includes(query)),
      );
    }
    if (options.limit !== undefined) {
      records = records.slice(0, options.limit);
    }
    return records.map((r) => ({
      sourceId: this.id,
      externalId: r.externalId,
      title: r.title,
      content: r.content,
      url: r.url,
      publishedAt: r.publishedAt,
      metadata: { tags: r.tags },
    }));
  }
}
