/**
 * Structured logging.
 *
 * One JSON object per line, so "what happened at 09:17" is answerable with
 * grep and jq rather than by eyeballing prose. Timestamps are ISO-8601 UTC;
 * IST conversion is a presentation concern.
 *
 * Nothing here ever receives a credential — call sites pass fields explicitly
 * rather than spreading an options object that might carry a token.
 */

export type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = ORDER[(process.env.LOG_LEVEL as Level | undefined) ?? 'info'] ?? ORDER.info;

function emit(level: Level, job: string, message: string, fields: Record<string, unknown>): void {
  if (ORDER[level] < threshold) return;

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    job,
    message,
    ...fields,
  });
  if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(job: string): Logger;
}

export function createLogger(job: string): Logger {
  return {
    debug: (message, fields = {}) => emit('debug', job, message, fields),
    info: (message, fields = {}) => emit('info', job, message, fields),
    warn: (message, fields = {}) => emit('warn', job, message, fields),
    error: (message, fields = {}) => emit('error', job, message, fields),
    child: (childJob: string) => createLogger(`${job}.${childJob}`),
  };
}

/** An error rendered for a log line. Never spreads the object — causes can carry secrets. */
export function errorFields(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message };
  }
  return { errorMessage: String(error) };
}
