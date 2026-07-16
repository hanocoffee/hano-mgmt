import { describe, expect, it } from 'vitest';
import { MockAnalyzer } from '../src/analyzers/mock-analyzer.js';
import type { StoredDocument } from '../src/core/types.js';

function doc(id: number, title: string, content: string): StoredDocument {
  return {
    id,
    sourceId: 'test',
    externalId: `ext-${id}`,
    title,
    content,
    collectedAt: '2026-01-01T00:00:00Z',
  };
}

describe('MockAnalyzer', () => {
  const analyzer = new MockAnalyzer();

  it('returns a neutral empty result for no documents', async () => {
    const result = await analyzer.analyze([]);
    expect(result.sentiment).toBe('neutral');
    expect(result.keywords).toEqual([]);
    expect(result.opportunityScore).toBe(0);
    expect(result.documentIds).toEqual([]);
  });

  it('detects positive sentiment and extracts keywords', async () => {
    const result = await analyzer.analyze([
      doc(1, 'Market growth', 'Strong growth and rising demand for coffee subscription services.'),
    ]);
    expect(result.sentiment).toBe('positive');
    expect(result.keywords).toContain('growth');
    expect(result.documentIds).toEqual([1]);
    expect(result.opportunityScore).toBeGreaterThan(0);
  });

  it('detects negative sentiment', async () => {
    const result = await analyzer.analyze([
      doc(1, 'Cafes struggle', 'Complaints and frustration everywhere, owners struggle daily.'),
    ]);
    expect(result.sentiment).toBe('negative');
  });

  it('includes the query in the summary', async () => {
    const result = await analyzer.analyze([doc(1, 'Title', 'Content here.')], { query: 'coffee' });
    expect(result.summary).toContain('"coffee"');
  });
});
