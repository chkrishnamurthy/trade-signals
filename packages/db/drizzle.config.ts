import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Load the repo-root .env; this file runs from packages/db.
loadEnv({ path: '../../.env' });

const url = process.env.DATABASE_URL_DIRECT;
if (url === undefined || url === '') {
  throw new Error(
    "DATABASE_URL_DIRECT is not set. Migrations must run against Neon's DIRECT endpoint " +
      '(the host WITHOUT "-pooler"); the pooled string will fail. See .env.example.',
  );
}

if (new URL(url).hostname.includes('-pooler')) {
  throw new Error(
    'DATABASE_URL_DIRECT points at a POOLED Neon endpoint (host contains "-pooler"). ' +
      'drizzle-kit needs the direct endpoint. See .env.example.',
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
