import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type AtlasDatabase } from '../src/storage/database.js';
import { DocumentRepository, InsightRepository } from '../src/storage/repositories.js';
import type { SourceItem } from '../src/core/types.js';

function item(overrides: Partial<SourceItem> = {}): SourceItem {
  return {
    sourceId: 'test-source',
    externalId: 'ext-1',
    title: 'Test title',
    content: 'Test content',
    url: 'https://example.com/1',
    publishedAt: '2026-01-01T00:00:00Z',
    metadata: { tags: ['a', 'b'] },
    ...overrides,
  };
}

describe('DocumentRepository', () => {
  let db: AtlasDatabase;
  let repo: DocumentRepository;

  beforeEach(() => {
    db = openDatabase(':memory:');
    repo = new DocumentRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('stores and returns a document with metadata round-tripped', () => {
    const doc = repo.upsert(item());
    expect(doc.id).toBeGreaterThan(0);
    expect(doc.title).toBe('Test title');
    expect(doc.metadata).toEqual({ tags: ['a', 'b'] });
    expect(doc.collectedAt).toBeTruthy();
  });

  it('round-trips originalQuote and summary', () => {
    const doc = repo.upsert(
      item({ originalQuote: 'I hate chasing invoices every single month.', summary: '請求催促の負担' }),
    );
    expect(doc.originalQuote).toBe('I hate chasing invoices every single month.');
    expect(doc.summary).toBe('請求催促の負担');
    const listed = repo.findAll()[0];
    expect(listed?.originalQuote).toBe('I hate chasing invoices every single month.');
  });

  it('deduplicates by (sourceId, externalId) and updates content', () => {
    repo.upsert(item());
    const updated = repo.upsert(item({ title: 'Updated title' }));
    expect(repo.count()).toBe(1);
    expect(updated.title).toBe('Updated title');
  });

  it('filters by sourceId', () => {
    repo.upsert(item({ sourceId: 'source-a', externalId: '1' }));
    repo.upsert(item({ sourceId: 'source-b', externalId: '1' }));
    expect(repo.findAll({ sourceId: 'source-a' })).toHaveLength(1);
    expect(repo.findAll()).toHaveLength(2);
  });
});

describe('InsightRepository', () => {
  it('saves and lists insights, newest first', () => {
    const db = openDatabase(':memory:');
    const repo = new InsightRepository(db);
    try {
      repo.save({
        analyzerId: 'mock',
        summary: 'first',
        sentiment: 'neutral',
        keywords: ['k1'],
        opportunityScore: 0.5,
        documentIds: [1, 2],
      });
      repo.save({
        analyzerId: 'mock',
        summary: 'second',
        sentiment: 'positive',
        keywords: ['k2'],
        opportunityScore: 0.8,
        documentIds: [3],
      });
      const latest = repo.findLatest(10);
      expect(latest).toHaveLength(2);
      expect(latest[0]?.summary).toBe('second');
      expect(latest[0]?.keywords).toEqual(['k2']);
      expect(latest[0]?.documentIds).toEqual([3]);
    } finally {
      db.close();
    }
  });
});
