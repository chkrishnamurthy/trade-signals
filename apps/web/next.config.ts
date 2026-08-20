import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin tracing to the monorepo root; otherwise Next walks up and can latch
  // onto an unrelated lockfile further up the filesystem.
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  // Workspace packages ship compiled ESM, but routing them through Next's
  // pipeline keeps source maps and tree-shaking consistent across the monorepo.
  transpilePackages: ['@signal/shared', '@signal/db'],
  typedRoutes: true,
};

export default nextConfig;
