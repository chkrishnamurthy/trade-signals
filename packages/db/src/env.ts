import { z } from 'zod';

/**
 * Neon hands out two connection strings for the same database. They are not
 * interchangeable — see `.env.example` for which is which and where to find
 * them in the console.
 */
const envSchema = z.object({
  /** Pooled (PgBouncer, host contains `-pooler`). The application query path. */
  DATABASE_URL: z.string().url().startsWith('postgres'),
  /** Direct. Migrations, studio, COPY, extensions — anything needing session state. */
  DATABASE_URL_DIRECT: z.string().url().startsWith('postgres'),
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
 * True when the URL points at Neon's pooled endpoint.
 *
 * Used to catch the classic mistake of running migrations through PgBouncer,
 * where they fail in confusing ways rather than cleanly.
 */
export function isPooledUrl(url: string): boolean {
  return new URL(url).hostname.includes('-pooler');
}
