#!/usr/bin/env bash
#
# Full test suite against a real, local, disposable Postgres.
#
# Brings up docker-compose.test.yml (Postgres 17 + TimescaleDB — the same stack
# the VPS runs), exports the *_test URL so the DB-backed suites actually run
# (they skip when TEST_DATABASE_URL is unset), runs Vitest — whose global setup
# migrates the database once — then tears the container and its volume down.
#
# The database is ephemeral (tmpfs, `down -v`), so every run starts from empty.
#
# Usage: pnpm test:integration   [-- <extra vitest args>]
set -euo pipefail

cd "$(dirname "$0")/.."

export TEST_DATABASE_URL="postgresql://equitywise:equitywise@localhost:5433/nse_signals_test"

cleanup() {
  docker compose -f docker-compose.test.yml down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose -f docker-compose.test.yml up -d --wait

pnpm vitest run "$@"
