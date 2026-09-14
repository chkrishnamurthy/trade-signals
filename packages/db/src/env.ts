import { z } from 'zod';

/**
 * Two connection strings for the same database. They are not interchangeable —
 * see `.env.example`. On the self-hosted VPS (no pooler) the two are identical;
 * the split is kept because the code still reads both.
 */
const envSchema = z.object({
  /** The application query path. */
  DATABASE_URL: z.string().url().startsWith('postgres'),
  /**
   * Direct. Migrations, studio, COPY, extensions — anything needing session state.
   *
   * OPTIONAL, and deliberately so: nothing that reaches this validator ever reads
   * it. `createDatabase` takes `DATABASE_URL` only, so requiring it here broke
   * every deploy of `apps/web`, which is documented in `.env.example` as the one
   * place that must NOT carry the direct credential.
   *
   * The migration path does not lose a guard by this being optional —
   * `drizzle.config.ts` reads `process.env.DATABASE_URL_DIRECT` itself and
   * throws both when it is absent and when it points at a pooled endpoint.
   */
  DATABASE_URL_DIRECT: z.string().url().startsWith('postgres').optional(),
});

export type DatabaseEnv = z.infer<typeof envSchema>;

/**
 * Parses and validates the database environment.
 *
 * Defaults to `process.env`; callers may pass an explicit record to keep a code
 * path pure and testable.
 */
export function readDatabaseEnv(source: NodeJS.ProcessEnv = process.env): DatabaseEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid database environment. Copy .env.example to .env and fill it in.\n${detail}`,
    );
  }
  return parsed.data;
}

/**
 * True when the URL points at a pooled endpoint (host contains `-pooler`).
 *
 * Used to catch the classic mistake of running migrations through a transaction
 * pooler, where they fail in confusing ways rather than cleanly. The self-hosted
 * VPS has no pooler, so this is a guard for a stray managed-host URL.
 */
export function isPooledUrl(url: string): boolean {
  return new URL(url).hostname.includes('-pooler');
}
