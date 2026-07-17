import 'dotenv/config';
import type { LogLevel } from '../logging/logger.js';

export interface AtlasConfig {
  /** Path to the SQLite database file (':memory:' for ephemeral). */
  dbPath: string;
  logLevel: LogLevel;
  /** Which analyzer implementation to use: 'mock' or 'openai'. */
  analyzer: string;
  /** Required when analyzer is 'openai'. */
  openaiApiKey?: string;
  openaiModel: string;
  /** Override for OpenAI-compatible endpoints (Azure, proxies, ...). */
  openaiBaseUrl?: string;
}

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

function parseLogLevel(value: string | undefined): LogLevel {
  if (value && (LOG_LEVELS as string[]).includes(value)) {
    return value as LogLevel;
  }
  return 'info';
}

/** Load configuration from process.env (populated by dotenv). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AtlasConfig {
  return {
    dbPath: env.ATLAS_DB_PATH ?? 'data/atlas.db',
    logLevel: parseLogLevel(env.ATLAS_LOG_LEVEL),
    analyzer: env.ATLAS_ANALYZER ?? 'mock',
    openaiApiKey: env.OPENAI_API_KEY,
    openaiModel: env.ATLAS_OPENAI_MODEL ?? 'gpt-4o-mini',
    openaiBaseUrl: env.ATLAS_OPENAI_BASE_URL,
  };
}
