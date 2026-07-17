import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type AtlasDatabase = Database.Database;

interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Versioned migrations tracked via PRAGMA user_version.
 * Append new migrations with the next version number; never edit old ones.
 * (v1 uses IF NOT EXISTS so databases created before versioning migrate cleanly.)
 */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'documents and insights',
    sql: `
      CREATE TABLE IF NOT EXISTS documents (
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
      );
      CREATE TABLE IF NOT EXISTS insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        analyzer_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        sentiment TEXT NOT NULL,
        keywords TEXT NOT NULL,
        opportunity_score REAL NOT NULL,
        document_ids TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_documents_source ON documents (source_id);
      CREATE INDEX IF NOT EXISTS idx_insights_created ON insights (created_at);
    `,
  },
  {
    version: 2,
    name: 'pain point analysis model',
    sql: `
      CREATE TABLE IF NOT EXISTS pain_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL REFERENCES documents (id),
        cluster_key TEXT NOT NULL,
        problem_statement TEXT NOT NULL,
        target_user TEXT NOT NULL,
        context TEXT NOT NULL,
        current_workaround TEXT NOT NULL,
        desired_outcome TEXT NOT NULL,
        severity REAL NOT NULL CHECK (severity BETWEEN 0 AND 1),
        frequency REAL NOT NULL CHECK (frequency BETWEEN 0 AND 1),
        willingness_to_pay REAL NOT NULL CHECK (willingness_to_pay BETWEEN 0 AND 1),
        automation_fit REAL NOT NULL CHECK (automation_fit BETWEEN 0 AND 1),
        reachability REAL NOT NULL CHECK (reachability BETWEEN 0 AND 1),
        evidence_quality REAL NOT NULL CHECK (evidence_quality BETWEEN 0 AND 1),
        opportunity_score REAL NOT NULL CHECK (opportunity_score BETWEEN 0 AND 1),
        confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
        reasoning_summary TEXT NOT NULL,
        analyzer_version TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pain_point_id INTEGER NOT NULL REFERENCES pain_points (id) ON DELETE CASCADE,
        document_id INTEGER NOT NULL REFERENCES documents (id),
        evidence_text TEXT NOT NULL,
        evidence_type TEXT NOT NULL,
        source_url TEXT,
        published_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS business_ideas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pain_point_id INTEGER NOT NULL REFERENCES pain_points (id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        value_proposition TEXT NOT NULL,
        product_type TEXT NOT NULL,
        target_customer TEXT NOT NULL,
        suggested_price_model TEXT NOT NULL,
        acquisition_channel TEXT NOT NULL,
        delivery_method TEXT NOT NULL,
        human_work_required TEXT NOT NULL,
        estimated_build_complexity TEXT NOT NULL
          CHECK (estimated_build_complexity IN ('low', 'medium', 'high')),
        validation_method TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'candidate',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS document_analysis (
        document_id INTEGER NOT NULL REFERENCES documents (id),
        analyzer_version TEXT NOT NULL,
        analyzed_at TEXT NOT NULL,
        pain_point_count INTEGER NOT NULL,
        PRIMARY KEY (document_id, analyzer_version)
      );
      CREATE INDEX IF NOT EXISTS idx_pain_points_score ON pain_points (opportunity_score DESC);
      CREATE INDEX IF NOT EXISTS idx_pain_points_cluster ON pain_points (cluster_key);
      CREATE INDEX IF NOT EXISTS idx_evidence_pain ON evidence (pain_point_id);
      CREATE INDEX IF NOT EXISTS idx_ideas_pain ON business_ideas (pain_point_id);
    `,
  },
];

export function migrate(db: AtlasDatabase): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      db.pragma(`user_version = ${migration.version}`);
    })();
  }
}

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
  migrate(db);
  return db;
}
