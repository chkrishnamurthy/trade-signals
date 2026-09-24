#!/usr/bin/env bash
#
# Run the web app (the API the mobile app talks to) against the LOCAL dev
# database from docker-compose.dev.yml instead of production. Applies any pending
# migrations first. Your .env still supplies everything else (auth secrets,
# Google client id); only the database URLs are overridden — environment
# variables set here win over .env.
set -euo pipefail
cd "$(dirname "$0")/.."

export DATABASE_URL="postgresql://equitywise:equitywise@localhost:5434/nse_signals_dev"
export DATABASE_URL_DIRECT="$DATABASE_URL"

# 2FA needs an encryption key for TOTP seeds. If .env has none, use a fixed
# DEV-ONLY key: it only ever protects test accounts in this throwaway database.
if [ -z "${AUTH_MFA_ENCRYPTION_KEY:-}" ] && ! grep -q '^AUTH_MFA_ENCRYPTION_KEY=.' .env 2>/dev/null; then
  export AUTH_MFA_ENCRYPTION_KEY="ZGV2LW9ubHktbG9jYWwtZGItbWZhLWtleS0zMmJ5dGU="
fi

docker compose --env-file /dev/null -f docker-compose.dev.yml up -d --wait
pnpm --filter "@equitywise/web^..." build
pnpm --filter @equitywise/db exec drizzle-kit migrate
exec pnpm --filter @equitywise/web dev
