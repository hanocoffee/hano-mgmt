import { describe, expect, it } from 'vitest';
import { buildClusters, selectOpportunities } from '../src/core/clustering.js';
import type { StoredPainPoint } from '../src/core/types.js';

let nextId = 1;

function pain(
  clusterKey: string,
  opportunityScore: number,
  documentId: number,
): StoredPainPoint {
  const id = nextId++;
  return {
    id,
    documentId,
    clusterKey,
    problemStatement: `problem ${id}`,
    targetUser: 'freelancers',
    context: 'ctx',
    currentWorkaround: 'manual',
    desiredOutcome: 'solved',
    severity: opportunityScore,
    frequency: opportunityScore,
    willingnessToPay: opportunityScore,
    automationFit: opportunityScore,
    reachability: opportunityScore,
    evidenceQuality: opportunityScore,
    opportunityScore,
    confidence: 0.5,
    reasoningSummary: 'r',
    analyzerVersion: 'mock@2+mock@1',
    promptVersion: 'p',
    createdAt: '2026-01-01T00:00:00Z',
  };
}

describe('buildClusters', () => {
  it('groups pain points with the same cluster key', () => {
    const clusters = buildClusters([
      pain('invoice-payment-collection', 0.6, 1),
      pain('invoice-payment-collection', 0.4, 2),
      pain('social-media-content', 0.5, 3),
    ]);
    expect(clusters).toHaveLength(2);
    const invoice = clusters.find((c) => c.key === 'invoice-payment-collection');
    expect(invoice?.size).toBe(2);
    expect(invoice?.documentCount).toBe(2);
    expect(invoice?.avgOpportunity).toBe(0.5);
  });

  it('merges similar keys describing the same problem', () => {
    const clusters = buildClusters([
      pain('invoice-payment-collection', 0.6, 1),
      pain('invoice-payment-collection', 0.6, 2),
      pain('payment-collection', 0.4, 3),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.key).toBe('invoice-payment-collection');
    expect(clusters[0]?.mergedKeys).toContain('payment-collection');
    expect(clusters[0]?.size).toBe(3);
  });

  it('keeps unrelated keys separate', () => {
    const clusters = buildClusters([
      pain('invoice-payment-collection', 0.5, 1),
      pain('booking-scheduling', 0.5, 2),
    ]);
    expect(clusters).toHaveLength(2);
  });

  it('ranks broad clusters above narrow high scorers', () => {
    const broad = [1, 2, 3, 4, 5].map((doc) => pain('missed-customer-inquiries', 0.6, doc));
    const narrow = [pain('niche-problem-key', 0.9, 6)];
    const clusters = buildClusters([...broad, ...narrow]);
    // broad: 0.7*0.6 + 0.3*(5/5) = 0.72 / narrow: 0.7*0.9 + 0.3*(1/5) = 0.69
    expect(clusters[0]?.key).toBe('missed-customer-inquiries');
    expect(clusters[0]?.score).toBe(0.72);
    expect(clusters[1]?.score).toBe(0.69);
  });

  it('counts distinct documents, not pain points', () => {
    const clusters = buildClusters([
      pain('scope-contract-management', 0.5, 1),
      pain('scope-contract-management', 0.5, 1),
    ]);
    expect(clusters[0]?.size).toBe(2);
    expect(clusters[0]?.documentCount).toBe(1);
  });
});

describe('selectOpportunities', () => {
  it('returns the top N clusters', () => {
    const pains = [
      pain('invoice-payment-collection', 0.3, 1),
      pain('booking-scheduling', 0.5, 11),
      pain('social-media-content', 0.7, 21),
    ];
    const clusters = buildClusters(pains);
    const top = selectOpportunities(clusters, 2);
    expect(top).toHaveLength(2);
    expect(top[0]?.score).toBeGreaterThanOrEqual(top[1]?.score ?? 0);
  });
});
