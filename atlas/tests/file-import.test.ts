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
