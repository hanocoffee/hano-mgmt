import { createHash } from 'node:crypto';
import type { SourceItem } from '../core/types.js';

export interface ImportParseResult {
  items: SourceItem[];
  /** Human-readable messages for records that could not be imported. */
  errors: string[];
}

/**
 * Stable external ID for records that don't provide one, so re-importing
 * the same file never duplicates documents.
 */
function deriveExternalId(title: string, content: string): string {
  return `sha-${createHash('sha256').update(`${title}\n${content}`).digest('hex').slice(0, 16)}`;
}

function toSourceItem(
  record: unknown,
  index: number,
  defaultSourceId: string,
): { item?: SourceItem; error?: string } {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    return { error: `record ${index + 1}: not a JSON object` };
  }
  const value = record as Record<string, unknown>;
  const content = typeof value.content === 'string' ? value.content.trim() : '';
  if (!content) {
    return { error: `record ${index + 1}: "content" is required and must be a non-empty string` };
  }
  const title =
    typeof value.title === 'string' && value.title.trim()
      ? value.title.trim()
      : content.slice(0, 80);
  const externalId =
    typeof value.externalId === 'string' && value.externalId.trim()
      ? value.externalId.trim()
      : deriveExternalId(title, content);
  const metadata: Record<string, unknown> = {
    ...(typeof value.metadata === 'object' && value.metadata !== null
      ? (value.metadata as Record<string, unknown>)
      : {}),
  };
  // Preserve collection fields that have no column of their own.
  if (typeof value.author === 'string' && value.author.trim()) {
    metadata.author = value.author.trim();
  }
  if (typeof value.collectedAt === 'string' && value.collectedAt.trim()) {
    metadata.collectedAt = value.collectedAt.trim();
  }
  return {
    item: {
      sourceId:
        typeof value.sourceId === 'string' && value.sourceId.trim()
          ? value.sourceId.trim()
          : defaultSourceId,
      externalId,
      title,
      content,
      url: typeof value.url === 'string' && value.url.trim() ? value.url.trim() : undefined,
      publishedAt:
        typeof value.publishedAt === 'string' && value.publishedAt.trim()
          ? value.publishedAt.trim()
          : undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    },
  };
}

/**
 * Parse manually collected items from JSON (array) or JSONL text.
 * Each record needs at least `content`; `title`, `externalId`, `url`,
 * `publishedAt`, `sourceId` and `metadata` are optional.
 */
export function parseSourceItems(
  raw: string,
  options: { defaultSourceId?: string } = {},
): ImportParseResult {
  const defaultSourceId = options.defaultSourceId ?? 'manual';
  const trimmed = raw.trim();
  const errors: string[] = [];
  if (!trimmed) {
    return { items: [], errors: ['file is empty'] };
  }

  let records: unknown[] = [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        records = parsed;
      } else {
        errors.push('top-level JSON must be an array');
      }
    } catch (error) {
      errors.push(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    const lines = trimmed.split('\n');
    lines.forEach((line, lineIndex) => {
      const text = line.trim();
      if (!text) return;
      try {
        records.push(JSON.parse(text));
      } catch {
        errors.push(`line ${lineIndex + 1}: invalid JSON`);
      }
    });
  }

  const items: SourceItem[] = [];
  records.forEach((record, index) => {
    const { item, error } = toSourceItem(record, index, defaultSourceId);
    if (item) items.push(item);
    if (error) errors.push(error);
  });
  return { items, errors };
}
