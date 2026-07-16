import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type AtlasDatabase = Database.Database;

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL,
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    url TEXT,
    published_at TEXT,
    metadata TEXT,
    collected_at TEXT NOT NULL,
    UNIQUE (source_id, external_id)
  )`,
  `CREATE TABLE IF NOT EXISTS insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    analyzer_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    sentiment TEXT NOT NULL,
    keywords TEXT NOT NULL,
    opportunity_score REAL NOT NULL,
    document_ids TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_documents_source ON documents (source_id)`,
  `CREATE INDEX IF NOT EXISTS idx_insights_created ON insights (created_at)`,
];

/**
 * Open (and migrate) the SQLite database.
 * Pass ':memory:' for an ephemeral database in tests.
 */
export function openDatabase(path: string): AtlasDatabase {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) {
    db.exec(migration);
  }
  return db;
}
