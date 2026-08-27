import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import type { NextConfig } from 'next';

// Secrets live in the repo-root .env, but Next only auto-loads .env from the
// app directory. This runs in the server process before any route handler, so
// FYERS_* reaches the backend while staying out of the client bundle (only
// NEXT_PUBLIC_* is ever inlined).
loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin tracing to the monorepo root; otherwise Next walks up and can latch
  // onto an unrelated lockfile further up the filesystem.
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  // Workspace packages ship compiled ESM, but routing them through Next's
  // pipeline keeps source maps and tree-shaking consistent across the monorepo.
  transpilePackages: [
    '@equitywise/shared',
    '@equitywise/db',
    '@equitywise/core',
    '@equitywise/fyers',
  ],
  typedRoutes: true,
};

export default nextConfig;
