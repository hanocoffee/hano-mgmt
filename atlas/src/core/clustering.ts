import type { StoredPainPoint } from './types.js';

/**
 * A group of pain points describing the same underlying problem.
 * Built from cluster_key with fuzzy merging of similar keys — no vector DB.
 */
export interface PainCluster {
  /** Representative key (from the largest merged group). */
  key: string;
  /** All keys that were merged into this cluster. */
  mergedKeys: string[];
  painPoints: StoredPainPoint[];
  size: number;
  /** Distinct source documents backing this cluster. */
  documentCount: number;
  avgOpportunity: number;
  maxOpportunity: number;
  avgConfidence: number;
  /**
   * Ranking score: quality of the pain (avg opportunity) weighted with
   * breadth of evidence (how many distinct documents show it, capped at 5).
   */
  score: number;
}

function tokenize(key: string): Set<string> {
  return new Set(key.split('-').filter((token) => token.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

/** Keys whose token sets overlap at least this much are considered the same problem. */
export const CLUSTER_MERGE_THRESHOLD = 0.5;

/**
 * Group pain points by cluster_key, merging keys that describe the same
 * problem (token Jaccard similarity >= CLUSTER_MERGE_THRESHOLD).
 * Returns clusters sorted by score, best first. Deterministic.
 */
export function buildClusters(painPoints: StoredPainPoint[]): PainCluster[] {
  const byKey = new Map<string, StoredPainPoint[]>();
  for (const pain of painPoints) {
    const group = byKey.get(pain.clusterKey) ?? [];
    group.push(pain);
    byKey.set(pain.clusterKey, group);
  }

  // Largest groups become merge targets first, so the representative key
  // is the most common phrasing of the problem.
  const entries = [...byKey.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );

  const merged: { key: string; keys: string[]; tokens: Set<string>; pains: StoredPainPoint[] }[] =
    [];
  for (const [key, pains] of entries) {
    const tokens = tokenize(key);
    const target = merged.find((cluster) => jaccard(cluster.tokens, tokens) >= CLUSTER_MERGE_THRESHOLD);
    if (target) {
      target.keys.push(key);
      target.pains.push(...pains);
      for (const token of tokens) target.tokens.add(token);
    } else {
      merged.push({ key, keys: [key], tokens, pains });
    }
  }

  return merged
    .map((cluster) => {
      const pains = [...cluster.pains].sort((a, b) => b.opportunityScore - a.opportunityScore);
      const documentCount = new Set(pains.map((pain) => pain.documentId)).size;
      const avgOpportunity =
        pains.reduce((sum, pain) => sum + pain.opportunityScore, 0) / pains.length;
      const avgConfidence = pains.reduce((sum, pain) => sum + pain.confidence, 0) / pains.length;
      const maxOpportunity = pains[0]?.opportunityScore ?? 0;
      const breadth = Math.min(documentCount, 5) / 5;
      const score = Number((0.7 * avgOpportunity + 0.3 * breadth).toFixed(2));
      return {
        key: cluster.key,
        mergedKeys: cluster.keys,
        painPoints: pains,
        size: pains.length,
        documentCount,
        avgOpportunity: Number(avgOpportunity.toFixed(2)),
        maxOpportunity,
        avgConfidence: Number(avgConfidence.toFixed(2)),
        score,
      };
    })
    .sort((a, b) => b.score - a.score || b.size - a.size || a.key.localeCompare(b.key));
}

/** Top-N clusters treated as business opportunities. */
export function selectOpportunities(clusters: PainCluster[], top = 5): PainCluster[] {
  return clusters.slice(0, top);
}
