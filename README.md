# NSE Signal Platform

Scaffold only. No business logic, no database schema, no market data yet.
See [CLAUDE.md](CLAUDE.md) for the hard rules that govern everything added on top.

## Layout

```
apps/
  web/            Next.js App Router + Tailwind
  worker/         Node entrypoint; scheduler and jobs live here
packages/
  shared/         paise + IST/market-time helpers — everything depends on this
  core/           pure signal engine (empty)
  db/             Drizzle schema, client, migrations
  fyers/          Fyers API v3 adapter (empty)
config/           versioned YAML strategy config
```

## Setup

```bash
pnpm install
cp .env.example .env     # then fill in both Neon connection strings
pnpm build
pnpm --filter @signal/worker dev   # connects to Neon, prints the server version
```

`.env.example` documents which Neon endpoint goes in which variable and where
to find them in the console. The short version: `DATABASE_URL` is the **pooled**
host (`-pooler` in the hostname), `DATABASE_URL_DIRECT` is the **direct** host.
Migrations run against the direct one — `drizzle.config.ts` refuses to start if
it is handed a pooled URL.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | every package in watch mode, plus `next dev` |
| `pnpm build` | topological `tsc` build, then `next build` |
| `pnpm test` | Vitest across the workspace |
| `pnpm test:coverage` | ditto, with a v8 coverage report |
| `pnpm lint` | Biome lint + format check |
| `pnpm lint:fix` | Biome, writing fixes |
| `pnpm typecheck` | `tsc --noEmit` per package |
| `pnpm db:generate` | drizzle-kit: SQL migration from the schema |
| `pnpm db:migrate` | drizzle-kit: apply migrations (direct endpoint) |
| `pnpm db:studio` | drizzle-kit studio |

## TypeScript

`tsconfig.base.json` holds the shared settings — `strict`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ES2022 target,
NodeNext modules — and every package extends it.

`apps/web` is the one exception: Next.js bundles rather than emitting
Node-resolvable output, so it overrides `module`/`moduleResolution` to
`ESNext`/`Bundler` and adds the DOM libs. Every strictness flag is inherited
unchanged.

Workspace packages compile to `dist/` and are consumed through their `exports`
map, so `pnpm build` must run before `apps/web` or `apps/worker` can start.
