import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseSourceItems } from '../src/sources/file-import.js';
import { openDatabase, type AtlasDatabase } from '../src/storage/database.js';
import { DocumentRepository } from '../src/storage/repositories.js';

describe('parseSourceItems', () => {
  it('parses a JSON array', () => {
    const raw = JSON.stringify([
      { title: 'A', content: 'content a', url: 'https://example.com/a' },
      { title: 'B', content: 'content b' },
    ]);
    const { items, errors } = parseSourceItems(raw);
    expect(errors).toEqual([]);
    expect(items).toHaveLength(2);
    expect(items[0]?.sourceId).toBe('manual');
    expect(items[0]?.url).toBe('https://example.com/a');
  });

  it('parses JSONL', () => {
    const raw = [
      JSON.stringify({ title: 'A', content: 'content a' }),
      '',
      JSON.stringify({ content: 'content b only' }),
    ].join('\n');
    const { items, errors } = parseSourceItems(raw);
    expect(errors).toEqual([]);
    expect(items).toHaveLength(2);
    // title falls back to the content
    expect(items[1]?.title).toBe('content b only');
  });

  it('collects errors for invalid records but keeps valid ones', () => {
    const raw = [
      JSON.stringify({ title: 'ok', content: 'fine' }),
      'this is not json',
      JSON.stringify({ title: 'no content' }),
    ].join('\n');
    const { items, errors } = parseSourceItems(raw);
    expect(items).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('line 2');
    expect(errors[1]).toContain('content');
  });

  it('derives a stable externalId when none is given', () => {
    const raw = JSON.stringify([{ title: 'A', content: 'same content' }]);
    const first = parseSourceItems(raw).items[0];
    const second = parseSourceItems(raw).items[0];
    expect(first?.externalId).toBeTruthy();
    expect(first?.externalId).toBe(second?.externalId);
  });

  it('parses originalQuote and summary, using the quote as analysis content', () => {
    const raw = JSON.stringify([
      {
        title: 'Invoice chasing',
        originalQuote:
          'I hate chasing invoices every month. I spend hours emailing clients and still do not get paid.',
        summary: '請求書の催促が精神的につらい',
        url: 'https://example.com/q',
      },
    ]);
    const { items, errors, warnings } = parseSourceItems(raw);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(items[0]?.originalQuote).toContain('I hate chasing invoices');
    expect(items[0]?.summary).toBe('請求書の催促が精神的につらい');
    // no explicit content → falls back to the verbatim quote
    expect(items[0]?.content).toBe(items[0]?.originalQuote);
  });

  it('warns when originalQuote is outside the 25-300 char guideline', () => {
    const raw = [
      JSON.stringify({ title: 'short', originalQuote: 'too short', summary: 's' }),
      JSON.stringify({ title: 'long', originalQuote: 'x'.repeat(400), summary: 's' }),
    ].join('\n');
    const { items, warnings } = parseSourceItems(raw);
    expect(items).toHaveLength(2);
    expect(warnings.some((w) => w.includes('record 1') && w.includes('9 chars'))).toBe(true);
    expect(warnings.some((w) => w.includes('record 2') && w.includes('400 chars'))).toBe(true);
  });

  it('warns when a record only has a summary (no verbatim quote)', () => {
    const raw = JSON.stringify([{ title: 'summary only', summary: 'a paraphrased problem' }]);
    const { items, warnings } = parseSourceItems(raw);
    expect(items).toHaveLength(1);
    expect(items[0]?.content).toBe('a paraphrased problem');
    expect(warnings.some((w) => w.includes('no originalQuote'))).toBe(true);
  });

  it('preserves top-level author and collectedAt inside metadata', () => {
    const raw = JSON.stringify([
      {
        content: 'x',
        author: 'user-42',
        collectedAt: '2026-07-17T00:00:00Z',
        metadata: { targetSegment: 'freelance' },
      },
    ]);
    const { items } = parseSourceItems(raw);
    expect(items[0]?.metadata).toEqual({
      targetSegment: 'freelance',
      author: 'user-42',
      collectedAt: '2026-07-17T00:00:00Z',
    });
  });

  it('respects a custom default sourceId', () => {
    const raw = JSON.stringify([{ content: 'x' }]);
    const { items } = parseSourceItems(raw, { defaultSourceId: 'reddit-manual' });
    expect(items[0]?.sourceId).toBe('reddit-manual');
  });

  it('reports an empty file', () => {
    expect(parseSourceItems('  ').errors).toEqual(['file is empty']);
  });
});

describe('import deduplication', () => {
  let db: AtlasDatabase;
  let documents: DocumentRepository;

  beforeEach(() => {
    db = openDatabase(':memory:');
    documents = new DocumentRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('re-importing the same file does not duplicate documents', () => {
    const raw = JSON.stringify([
      { title: 'A', content: 'content a' },
      { title: 'B', content: 'content b' },
    ]);
    documents.upsertMany(parseSourceItems(raw).items);
    documents.upsertMany(parseSourceItems(raw).items);
    expect(documents.count()).toBe(2);
  });
});
