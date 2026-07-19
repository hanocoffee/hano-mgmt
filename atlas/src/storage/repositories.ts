import type { AtlasDatabase } from './database.js';
import type { AnalysisResult, SourceItem, StoredDocument, StoredInsight } from '../core/types.js';

interface DocumentRow {
  id: number;
  source_id: string;
  external_id: string;
  title: string;
  content: string;
  original_quote: string | null;
  summary: string | null;
  url: string | null;
  published_at: string | null;
  metadata: string | null;
  collected_at: string;
}

interface InsightRow {
  id: number;
  analyzer_id: string;
  summary: string;
  sentiment: string;
  keywords: string;
  opportunity_score: number;
  document_ids: string;
  created_at: string;
}

function rowToDocument(row: DocumentRow): StoredDocument {
  return {
    id: row.id,
    sourceId: row.source_id,
    externalId: row.external_id,
    title: row.title,
    content: row.content,
    originalQuote: row.original_quote ?? undefined,
    summary: row.summary ?? undefined,
    url: row.url ?? undefined,
    publishedAt: row.published_at ?? undefined,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
    collectedAt: row.collected_at,
  };
}

function rowToInsight(row: InsightRow): StoredInsight {
  return {
    id: row.id,
    analyzerId: row.analyzer_id,
    summary: row.summary,
    sentiment: row.sentiment as StoredInsight['sentiment'],
    keywords: JSON.parse(row.keywords) as string[],
    opportunityScore: row.opportunity_score,
    documentIds: JSON.parse(row.document_ids) as number[],
    createdAt: row.created_at,
  };
}

export class DocumentRepository {
  constructor(private readonly db: AtlasDatabase) {}

  /**
   * Insert or update a fetched item, deduplicated by (sourceId, externalId).
   * Returns the stored document.
   */
  upsert(item: SourceItem): StoredDocument {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO documents (source_id, external_id, title, content, original_quote, summary, url, published_at, metadata, collected_at)
         VALUES (@sourceId, @externalId, @title, @content, @originalQuote, @summary, @url, @publishedAt, @metadata, @collectedAt)
         ON CONFLICT (source_id, external_id) DO UPDATE SET
           title = excluded.title,
           content = excluded.content,
           original_quote = excluded.original_quote,
           summary = excluded.summary,
           url = excluded.url,
           published_at = excluded.published_at,
           metadata = excluded.metadata,
           collected_at = excluded.collected_at`,
      )
      .run({
        sourceId: item.sourceId,
        externalId: item.externalId,
        title: item.title,
        content: item.content,
        originalQuote: item.originalQuote ?? null,
        summary: item.summary ?? null,
        url: item.url ?? null,
        publishedAt: item.publishedAt ?? null,
        metadata: item.metadata ? JSON.stringify(item.metadata) : null,
        collectedAt: now,
      });
    const row = this.db
      .prepare('SELECT * FROM documents WHERE source_id = ? AND external_id = ?')
      .get(item.sourceId, item.externalId) as DocumentRow;
    return rowToDocument(row);
  }

  upsertMany(items: SourceItem[]): StoredDocument[] {
    const transaction = this.db.transaction((batch: SourceItem[]) => batch.map((i) => this.upsert(i)));
    return transaction(items);
  }

  findAll(options: { sourceId?: string; limit?: number } = {}): StoredDocument[] {
    const limit = options.limit ?? 1000;
    const rows = options.sourceId
      ? (this.db
          .prepare('SELECT * FROM documents WHERE source_id = ? ORDER BY collected_at DESC LIMIT ?')
          .all(options.sourceId, limit) as DocumentRow[])
      : (this.db
          .prepare('SELECT * FROM documents ORDER BY collected_at DESC LIMIT ?')
          .all(limit) as DocumentRow[]);
    return rows.map(rowToDocument);
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM documents').get() as { count: number };
    return row.count;
  }
}

export class InsightRepository {
  constructor(private readonly db: AtlasDatabase) {}

  save(result: AnalysisResult): StoredInsight {
    const now = new Date().toISOString();
    const info = this.db
      .prepare(
        `INSERT INTO insights (analyzer_id, summary, sentiment, keywords, opportunity_score, document_ids, created_at)
         VALUES (@analyzerId, @summary, @sentiment, @keywords, @opportunityScore, @documentIds, @createdAt)`,
      )
      .run({
        analyzerId: result.analyzerId,
        summary: result.summary,
        sentiment: result.sentiment,
        keywords: JSON.stringify(result.keywords),
        opportunityScore: result.opportunityScore,
        documentIds: JSON.stringify(result.documentIds),
        createdAt: now,
      });
    return { ...result, id: Number(info.lastInsertRowid), createdAt: now };
  }

  findLatest(limit = 10): StoredInsight[] {
    const rows = this.db
      .prepare('SELECT * FROM insights ORDER BY created_at DESC, id DESC LIMIT ?')
      .all(limit) as InsightRow[];
    return rows.map(rowToInsight);
  }
}
