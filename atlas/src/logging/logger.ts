export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Minimal structured logger interface. Swap the implementation
 * (e.g. for pino or a file logger) without touching call sites.
 */
export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

/** JSON-lines logger writing to stderr so CLI stdout stays clean for results. */
export class ConsoleLogger implements Logger {
  constructor(
    private readonly level: LogLevel = 'info',
    private readonly bindings: Record<string, unknown> = {},
  ) {}

  private log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;
    const entry = {
      time: new Date().toISOString(),
      level,
      message,
      ...this.bindings,
      ...fields,
    };
    process.stderr.write(`${JSON.stringify(entry)}\n`);
  }

  debug(message: string, fields?: Record<string, unknown>): void {
    this.log('debug', message, fields);
  }

  info(message: string, fields?: Record<string, unknown>): void {
    this.log('info', message, fields);
  }

  warn(message: string, fields?: Record<string, unknown>): void {
    this.log('warn', message, fields);
  }

  error(message: string, fields?: Record<string, unknown>): void {
    this.log('error', message, fields);
  }

  child(bindings: Record<string, unknown>): Logger {
    return new ConsoleLogger(this.level, { ...this.bindings, ...bindings });
  }
}

/** No-op logger for tests. */
export class NullLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
  child(): Logger {
    return this;
  }
}
