# apps/mobile — EquityWise Android app

Expo SDK 57 · React Native · Expo Router · TypeScript. Design and decisions:
`docs/mobile/` (start with `README.md`, then `01-discovery.md` and
`02-architecture.md`). How to run it on a phone: `docs/mobile/03-run-on-your-phone.md`.

## Rules (from the repo CLAUDE.md, restated for the phone)

- The app talks ONLY to the EquityWise API (`EXPO_PUBLIC_API_URL`). Never import
  `@equitywise/db`, `@equitywise/fyers`, `@equitywise/dhan` or any provider adapter.
- Prices are integer paise; the only path to a rupee string is `src/lib/format.ts`
  (which calls `formatPaise`). No `toFixed` on a price.
- Instants are UTC on the wire and rendered in IST via `src/lib/format.ts`.
- The session token lives in SecureStore (Android Keystore). Never AsyncStorage,
  never a log line, never a URL.
- No order affordance of any kind. BUY/SELL may label a signal's direction only.
  Signals, intraday and paper trading are not in v1.0 (S8, S13).
- Every screen must work from small phones to tablets, portrait and landscape,
  large font sizes, light and dark (S18). Use `useTheme().size` / `<Grid>`.

## Expo changes every SDK — check the versioned docs

Read `https://docs.expo.dev/versions/v57.0.0/` (or `https://docs.expo.dev/llms.txt`)
before using an Expo API from memory. Add native libraries with
`npx expo install <pkg>` (keeps SDK-compatible versions). TypeScript is pinned to
the repo's 5.9 on purpose (`expo.install.exclude`).

## Commands

```bash
pnpm dev:mobile                       # from the repo root: build shared packages, start Metro
pnpm --filter @equitywise/mobile typecheck
npx biome check apps/mobile
pnpm vitest run apps/mobile           # pure logic tests (src/lib/*.test.ts)
```
