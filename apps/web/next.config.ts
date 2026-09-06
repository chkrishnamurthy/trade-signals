import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import type { NextConfig } from 'next';

// Secrets live in the repo-root .env, but Next only auto-loads .env from the
// app directory. This runs in the server process before any route handler, so
// FYERS_* reaches the backend while staying out of the client bundle (only
// NEXT_PUBLIC_* is ever inlined).
loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

/**
 * Security headers on every response. `frame-ancestors 'none'` + `X-Frame-Options`
 * stop clickjacking; `nosniff` stops MIME confusion; HSTS pins HTTPS (ignored on
 * dev http). The CSP allows inline script/style because Next's bootstrap and the
 * theme/nav init scripts are inline — tightening `script-src` to a nonce is a known
 * follow-up; the session cookie is `HttpOnly`, so XSS still can't read it.
 *
 * DEV vs PROD: Next.js dev mode evaluates strings as JS (React Fast Refresh / HMR)
 * and opens an HMR websocket, so development needs `'unsafe-eval'` and `ws:` — the
 * production bundle needs neither, so prod keeps the strict policy.
 */
const isDev = process.env.NODE_ENV !== 'production';

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? ' ws:' : ''}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
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
