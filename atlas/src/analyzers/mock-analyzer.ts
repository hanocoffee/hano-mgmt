import type { AnalyzeContext, MarketAnalyzer } from '../core/analyzer.js';
import type { AnalysisResult, Sentiment, StoredDocument } from '../core/types.js';

const POSITIVE_WORDS = ['growth', 'demand', 'rises', 'satisfaction', 'opportunity', 'increase'];
const NEGATIVE_WORDS = ['struggle', 'complaints', 'frustration', 'negative', 'churn', 'wastes'];
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'with', 'on', 'that', 'this',
  'is', 'are', 'was', 'were', 'be', 'as', 'at', 'by', 'from', 'it', 'its', 'their',
  'they', 'say', 'says', 'would', 'when', 'over', 'per', 'than', 'under', 'among',
]);

/**
 * Deterministic heuristic analyzer used until a real LLM analyzer is added.
 * Extracts keyword frequencies and a naive sentiment / opportunity score,
 * so the full pipeline can run offline and in tests.
 */
export class MockAnalyzer implements MarketAnalyzer {
  readonly id = 'mock';
  readonly name = 'Mock Heuristic Analyzer';

  async analyze(documents: StoredDocument[], context?: AnalyzeContext): Promise<AnalysisResult> {
    if (documents.length === 0) {
      return {
        analyzerId: this.id,
        summary: 'No documents to analyze.',
        sentiment: 'neutral',
        keywords: [],
        opportunityScore: 0,
        documentIds: [],
      };
    }

    const text = documents.map((d) => `${d.title} ${d.content}`).join(' ').toLowerCase();
    const words = text.match(/[a-z][a-z-]{2,}/g) ?? [];

    const frequencies = new Map<string, number>();
    for (const word of words) {
      if (STOP_WORDS.has(word)) continue;
      frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
    }
    const keywords = [...frequencies.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);

    const positives = POSITIVE_WORDS.reduce((n, w) => n + (frequencies.get(w) ?? 0), 0);
    const negatives = NEGATIVE_WORDS.reduce((n, w) => n + (frequencies.get(w) ?? 0), 0);
    const sentiment: Sentiment =
      positives > negatives ? 'positive' : negatives > positives ? 'negative' : 'neutral';

    // Pain points (negative signals) also indicate business opportunities,
    // so both polarities raise the score relative to document volume.
    const opportunityScore = Math.min(1, (positives + negatives) / (documents.length * 2));

    const topic = context?.query ? ` on "${context.query}"` : '';
    const summary =
      `Analyzed ${documents.length} document(s)${topic}. ` +
      `Overall sentiment: ${sentiment} (${positives} positive / ${negatives} negative signals). ` +
      `Top topics: ${keywords.slice(0, 5).join(', ') || 'n/a'}.`;

    return {
      analyzerId: this.id,
      summary,
      sentiment,
      keywords,
      opportunityScore: Number(opportunityScore.toFixed(2)),
      documentIds: documents.map((d) => d.id),
    };
  }
}
