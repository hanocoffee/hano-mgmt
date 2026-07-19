import { describe, expect, it } from 'vitest';
import { MockPainExtractor } from '../src/analyzers/mock-pain-analyzer.js';
import type { StoredDocument } from '../src/core/types.js';

function doc(overrides: Partial<StoredDocument> = {}): StoredDocument {
  return {
    id: 1,
    sourceId: 'test',
    externalId: 'x1',
    title: 'Test document',
    content: 'Some content here.',
    collectedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('MockPainExtractor (v2)', () => {
  const extractor = new MockPainExtractor();

  it('extracts multiple pain points from one document', async () => {
    const pains = await extractor.extract(
      doc({
        content:
          'I keep missing calls while working on site. I also cannot reply to DMs about bookings. My website is fine.',
      }),
    );
    expect(pains.length).toBe(2);
    expect(pains[0]?.problemStatement).toContain('missing calls');
    expect(pains[1]?.problemStatement).toContain('cannot reply');
  });

  it('prefers originalQuote over content for extraction', async () => {
    const pains = await extractor.extract(
      doc({
        content: 'A freelancer finds invoicing difficult.',
        originalQuote: 'I hate chasing invoices every month and still do not get paid.',
      }),
    );
    expect(pains).toHaveLength(1);
    expect(pains[0]?.evidence[0]?.evidenceText).toBe(
      'I hate chasing invoices every month and still do not get paid.',
    );
  });

  it('assigns shared taxonomy cluster keys across documents', async () => {
    const first = await extractor.extract(
      doc({ id: 1, content: 'I hate chasing unpaid invoices from clients.' }),
    );
    const second = await extractor.extract(
      doc({ id: 2, title: 'Late payments', content: 'Chasing overdue payment is exhausting and hard.' }),
    );
    expect(first[0]?.clusterKey).toBe('invoice-payment-collection');
    expect(second[0]?.clusterKey).toBe('invoice-payment-collection');
  });

  it('uses metadata.targetSegment as the target user', async () => {
    const pains = await extractor.extract(
      doc({
        content: 'I struggle with posting to social media.',
        metadata: { targetSegment: 'marketing-content' },
      }),
    );
    expect(pains[0]?.targetUser).toBe('marketing-content segment');
  });

  it('falls back to a single whole-document pain when no sentence signals exist', async () => {
    const pains = await extractor.extract(
      doc({ title: 'Quiet post', content: 'Everything works well for me. I like my process.' }),
    );
    expect(pains).toHaveLength(1);
    expect(pains[0]?.problemStatement).toBe('Quiet post');
  });
});
