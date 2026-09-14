import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Load the repo-root .env; this file runs from packages/db.
loadEnv({ path: '../../.env' });

const url = process.env.DATABASE_URL_DIRECT;
if (url === undefined || url === '') {
  throw new Error(
    'DATABASE_URL_DIRECT is not set. Migrations need a DIRECT (non-pooled) Postgres ' +
      'connection — they run CREATE EXTENSION, advisory locks and other session-level ' +
      'statements a connection pooler rejects. See .env.example.',
  );
}

// A pooled endpoint (PgBouncer in transaction mode) cannot run migrations. The
// self-hosted VPS has no pooler, but this guard still catches a stray pooled URL.
if (new URL(url).hostname.includes('-pooler')) {
  throw new Error(
    'DATABASE_URL_DIRECT points at a POOLED endpoint (host contains "-pooler"). ' +
      'drizzle-kit needs the direct, non-pooled endpoint. See .env.example.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url },
  strict: true,
  verbose: true,
  casing: 'snake_case',
});
