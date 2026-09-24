# Android app — Phase 2/3: architecture as built

> **Status (2026-09-24):** implemented on branch `feat/mobile-app` (not yet merged
> or deployed). Decisions D1–D8 were taken as their recommendations, and S1–S19 are
> binding (`01-discovery.md` §11). This records what exists and why. Run it:
> `03-run-on-your-phone.md`. Publish it: `07-play-store.md`.

## Decision record

| # | Decision | Outcome |
| --- | --- | --- |
| D1 | Framework | Expo SDK 57 + React Native 0.86 + TypeScript, `apps/mobile`. TypeScript pinned to the repo's 5.9 (`expo.install.exclude`). pnpm isolated installs (supported since SDK 54); no Metro config needed. |
| D2 | Sessions | Opaque bearer tokens in the existing `auth_sessions`. The bearer value is the same HMAC-signed `token.mac` the cookie carries, so one validator serves both. Weekly rotation via `POST /api/auth/session/rotate`. |
| D3 | Auth routes | Shared with the web. A request is "native" when it carries `X-EquityWise-Client: android/<ver> (build <n>)`; then sessions and 2FA bindings come back in the body instead of cookies. |
| D4 | Contracts | `packages/api-contracts` (Zod + route map) and `packages/api-client` (typed fetch). The web still uses its own interfaces; adopting the contracts there is incremental follow-up work. |
| D5 | Environments | Production only (S17). Dev builds use `http://localhost:3000` through `adb reverse`; cleartext is allowed in the development variant only. |
| D6 | Design tokens | `packages/design-tokens` holds the web's OKLCH values and converts them to hex for React Native. A test fails if any value drifts from `globals.css`. It does **not** generate `globals.css` yet (the web stays the source of truth). |
| D7 | Crash reporting | Not added yet. Sentry is still the recommendation, before the closed test. |
| D8 | Docs | `docs/mobile/`. |
| D9 | Google sign-in library | `react-native-credentials-manager` (Android Credential Manager, supports a nonce, MIT). **Not** `@react-native-google-signin/google-signin`: its free build uses the deprecated legacy Android SDK and has no nonce support. |

## Server changes (G1–G3, G6, G8, G9, G13, G14, S15)

| Change | Where |
| --- | --- |
| Native/bearer detection (Edge-safe) | `apps/web/src/server/auth/client.ts` |
| CSRF: `isSameOrigin()` passes requests with a Bearer or client header — custom headers need a CORS preflight, which this server never grants | `server/auth/request.ts` (covers all 44 call sites) |
| `startSession()` returns `IssuedSession`; `sessionBody()` adds `session: { token, expiresAt }` for the app | `server/auth/session.ts` |
| Bearer before cookie in the session check; middleware admits Bearer on `/api/*` | `server/auth/require-user.ts`, `middleware.ts` |
| Sign-in / sign-up / 2FA verify / password change / 2FA toggle return the token | the matching routes |
| 2FA challenge binding in the body for the app | `server/auth/challenges.ts`, `mfa.ts` |
| Rotation keeps provenance and the 30-day cap; refused after a security-version bump | `repositories/auth.ts#rotateSessionToken`, `api/auth/session/rotate` |
| Native Google: nonce → Credential Manager ID token → server verifies (Google JWKS, `aud`, `iss`, `exp`, nonce, verified email) → shared `signInWithGoogleIdentity()`; a new account waits as a *pending sign-up* until the terms popup is accepted; 2FA always enforced | `server/auth/google-id-token.ts`, `google-native.ts`, `google-oauth.ts`, `api/auth/google/native{,/nonce}` |
| Terms version recorded on every new account (S15) | `server/auth/terms.ts`, `auth_users.terms_version` |
| `GET /api/app-config` (version gate, sign-up/Google switches, terms version) | `config/app.yaml`, `server/app-config.ts` |
| `GET /api/stocks/:symbol` (G6) | `api/stocks/[symbol]` |
| `GET /api/auth/session` reports `mfaEnabled`; sessions list returns `client`, `deviceName`, `authenticationMethod`; the web shows the phone's name | the matching routes, `components/profile/sessions-list.tsx` |
| Migration `0026_mobile_sessions` (additive): `auth_sessions.client` + `device_name`, `auth_users.terms_version`, `google_native` challenge purpose | `packages/db/drizzle/0026_mobile_sessions.sql` |

Web behaviour is unchanged for cookie users. The only exception is that new web accounts now also record `terms_version`.

## App structure

```
apps/mobile/
  app.config.ts            variants: development (io.equitywise.app.dev) / preview / production
  eas.json                 build profiles; production = AAB, auto-increment
  src/app/                 Expo Router routes (every file is a screen)
    _layout.tsx            providers, version gate, biometric lock, auth-guarded groups
    (auth)/                sign-in, sign-up, two-factor, forgot-password
    (app)/(tabs)/          Markets · Watchlists · Search · Account · Admin (admins only)
    (app)/watchlist/[id]   list detail: live prices (polled), sort, add/remove, rename, default, delete
    (app)/stock/[symbol]   chart (1D–5Y, touch readout), ranges, technical snapshot, actions, peers
    (app)/add-to-watchlist modal
    (app)/account/*        sessions, password, sign-in methods, delete account, about & legal
  src/components/          themed kit: Text, Button, TextField, Card, Screen, Grid, states, chart…
  src/lib/                 api, auth, session store + policy, queries, format, layout, theme
```

**State.** TanStack Query holds server state, wired to `AppState` (no polling in the background) and NetInfo (paused while offline). Auth state lives in `AuthProvider`. The token is kept only in SecureStore and in memory. A 2FA challenge is handed from screen to screen in memory, never in a URL.

**Live prices.** Watchlists poll `GET /api/watchlists/:id` on the server's `refreshAfterSeconds`, and only while the screen is focused and the market is open (60 s otherwise). Indices poll every 15 s when the market is open. SSE (G5b) is later work.

**Responsive (S18).** Screen widths fall into three size classes: compact (under 600 dp), medium (600–839 dp) and expanded (840 dp and up). Content width is capped on tablets, card grids use 1, 2 or 3 columns, the stock screen goes two-column on wide screens, and tab labels move beside their icons. Fonts scale up to 2×. Light and dark themes follow the system setting.

**Product rules on the phone.** The app has no Signals, Intraday or Paper-trading screens (S8, S13) and no order affordance. A signal strength score is never shown, because the phone can't show the factor breakdown behind it. Indicators are labelled as closed-candle, end-of-day values. A disclaimer footer appears on the data screens.

## Verification done

- `pnpm typecheck` passes across the workspace. The mobile, client-package and shared tests pass (114). Auth DB integration tests, including rotation and migration 0026, pass against the local Postgres 17 + TimescaleDB container.
- `expo export --platform android` bundles the whole app to Hermes bytecode (R2 closed). `expo-doctor`: 21/21.
- **Not yet done:** running on a physical phone (R1 is mitigated by the integer formatter fallback, still to confirm on the device). Google sign-in end to end (needs the Android OAuth clients, `03-run-on-your-phone.md` Part F). An EAS build.

## Known follow-ups

1. VPS deploy should install with `--filter '!@equitywise/mobile'` (see `03-run-on-your-phone.md` Part A).
2. Web Google sign-in still skips 2FA (G15, deferred by S16).
3. App Links (G4) are not claimed yet: the app has no `/verify` or `/reset` screens.
4. Sentry crash reporting (D7) before the closed test.
5. Web adoption of `api-contracts`, and generating `globals.css` from `design-tokens`.
6. Google-only accounts delete via the website (the account DELETE route requires a password).
7. Push notifications (G7) — v1.1.
