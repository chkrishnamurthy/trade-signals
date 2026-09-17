# Android app — Phase 1: discovery and architecture assessment

> **Purpose.** A cold read of this monorepo as it stands on **2026-09-17** (`main` at
> `c8dd6bc`), followed by the recommended way to build a native Android client, the
> backend gaps a phone hits on day one, the risks, the decisions already settled, and
> the first milestone. Written so it can be implemented later by someone (or some
> agent) who has not read the conversation that produced it.
>
> **Nothing described here is built.** The mobile app, the new packages, and the
> server changes are all future work. A visual version of this document exists as a
> Claude artifact (revision 2); this file is the source of truth going forward.
>
> Audited at `4ab00f2`; re-checked at `c8dd6bc` after the Dhan provider landed. The
> Dhan work added only pure modules to `packages/shared` (`circuit.ts`,
> `rate-limit.ts`, `stream.ts` — no imports) and touched nothing in auth or the API
> routes, so every finding below still holds. The provider boundary now covers two
> vendors; the phone never sees either.

---

## 1. Summary in one screen

The backend is in better shape for a mobile client than most web apps: a clean JSON
API with one error shape, Zod at every boundary, server-side revocable sessions,
per-user data isolation, and a rule that market data is only ever read through the
web app's API. The pure packages (`shared`, `core`, `market-data`) contain no
Node-only code and can run inside a phone's JavaScript engine.

Three things stand between the current API and a working native app. All three are
**server-side, additive** changes:

1. **The CSRF check rejects every native request.** Every state-changing route calls
   `isSameOrigin()` (`apps/web/src/server/auth/request.ts`), which requires an
   `Origin` or `Referer` header. Android's networking stack sends neither, so
   sign-in, sign-up and every PATCH/POST/DELETE would answer `403 BAD_ORIGIN`. The
   check is right for browsers and stays; it must become conditional on *how the
   request authenticated*.
2. **Sessions are delivered only as a browser cookie** (`__Host-session`). A phone
   needs a token it can keep in the Android Keystore, gate behind a fingerprint and
   send as a header. The `auth_sessions` table already supports this; it needs a
   second delivery path.
3. **No push-notification infrastructure** — no device table, no sender in the
   worker, no consent record.

**Recommendation:** React Native with Expo and TypeScript, as `apps/mobile` in this
monorepo (§5). **First milestone:** Phase 2 + Phase 3 + the two auth blockers, so the
foundation can be verified end-to-end from a real phone (§12).

Baseline at audit time: `pnpm typecheck` green in every package; `pnpm lint` reports
26 pre-existing Biome errors (CI intentionally skips lint); 55 Vitest files.

---

## 2. What exists today

`OVERVIEW.md` (reconciled 2026-09-12) still says "watchlists only". The tree has
since grown four more product surfaces; this section is the corrected picture.

### 2.1 Workspace layout

| Path | What it is | Runs where |
| --- | --- | --- |
| `apps/web` | Next.js 15 App Router: pages, JSON API routes, the auth system, the service layer (`src/server/*`). Reads market data; writes only user data. | VPS, PM2 |
| `apps/worker` | `croner` scheduler; the only writer of candles, indicators, signals, disclosures and provider credentials. 13 scheduled jobs. | VPS, PM2 |
| `packages/shared` | Pure: integer-paise money, IST/session time, timeframes, VWAP-signal Zod schemas + DTOs, and (since Dhan) a generic circuit breaker, rate limiter and reconnecting-stream helper. | Anywhere |
| `packages/core` | Pure engines: RSI, SMA/EMA, MACD, ATR, ADX, ROC, VWAP; daily swing engine; VWAP strategy; announcement interpretation rules; signal lifecycle. | Anywhere |
| `packages/market-data` | Provider-neutral types and the `MarketDataProvider` interface. | Anywhere |
| `packages/db` | Drizzle schema (21 tables), migrations, repositories. Imports `pg`. | Server only |
| `packages/fyers`, `packages/dhan` | Vendor API clients. | Server only |
| `packages/providers-fyers`, `packages/providers-dhan` | The adapters — the only places vendor types and ours meet. | Server only |
| `packages/archive` | Retired code kept for reference. | — |
| `config/*.yaml` | Index constituents, VWAP-signal config. | web + worker |
| `tracker/` | Standalone Vite docs/issue tracker; not in the workspace. | Local |

### 2.2 Stack as pinned

Node 24 (`.nvmrc`, `engines >=24`) · pnpm 10.33 · TypeScript 5.9 `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`,
ESM with `NodeNext` · Next.js 15.5, React 19.2, Tailwind 4, Radix, lucide, Storybook 10
· PostgreSQL 17 + TimescaleDB (self-hosted, localhost only), Drizzle 0.45, Zod 3.25 ·
Vitest 3, Biome 2.5 · GitHub Actions CI (typecheck, Storybook build, DB-backed tests) ·
deploy = merge to `main` → Actions → forced-command SSH → `deploy.sh` → PM2 ·
`equitywise.io` behind Nginx/TLS · Resend for transactional email (links point at
`AUTH_BASE_URL`, i.e. the website).

### 2.3 Product surfaces that genuinely exist

| Surface | Web page | API a phone can call | Status |
| --- | --- | --- | --- |
| Watchlists | `/watchlists` | `GET/POST /api/watchlists`; `GET/PATCH/DELETE /:id`; `/:id/items` (POST/PUT/DELETE); `/:id/layout`; `/:id/views`, `/:id/views/:viewId`; `/default`; `/reorder`; `/templates`; `/from-template`; `/:id/live` (SSE) | Available |
| Search | header | `GET /api/search?q=` (public); `POST /api/search/resolve` | Available |
| Charts / history | stock drawer | `GET /api/history/:symbol?tf=1D\|5D\|1M\|3M\|6M\|1Y\|5Y` (paise OHLCV) | Available |
| Signals | `/signals` | `GET /api/signals`, `/:id`, `/summary`; `POST /api/paper-trades` | Available — **hidden in the app (S8)** |
| Market Brief | `/today` | `GET /api/market-brief/latest` | Available |
| Announcements | `/announcements` | `GET /api/announcements` (filters, paging); `GET/PATCH /:id` | Available |
| Institutional flow | `/flows` | `GET /api/flows` | Available |
| Profile & account | `/profile` | `PATCH /api/profile`; `/profile/avatar`; `/account/password`; `/account/email` (+`/confirm`); `/account/sessions` (GET/DELETE); `/account/verify`; `DELETE /api/account` | Available |
| Stock detail | drawer only | none — `server/stock-detail.ts` exists without a route | Partial |
| Two-factor (TOTP) | `/profile` | none — `auth_mfa` table exists; UI says "Coming soon" | Not built |
| Push notifications | — | none | Not built |
| Admin | `/admin` | `/api/admin/users` | Available; out of mobile scope |
| Legal / marketing | static pages | — | Copy exists; must be reused in-app |

### 2.4 How data moves

- **Read:** page/route → `apps/web/src/server/*` → `@equitywise/db` repository →
  Postgres. Live quotes come through the provider adapter using the token the worker
  minted into `provider_credentials`. The web app never mints a token.
- **Write:** the worker alone writes market data; the web app writes only user-owned
  rows (auth, profile, watchlists, announcement state, paper studies).
- **Wire contract:** integer paise; ISO-8601 UTC strings (signals use epoch-ms);
  `null` means "not supplied". Errors are always `{ error, code?, remedy? }` with
  `Cache-Control: no-store`. Nothing on the wire names a vendor.
- **DTO types** live mostly in `apps/web/src/lib/*-types.ts` as plain interfaces
  (watchlist, market, disclosure, dashboard); the VWAP-signal contract is already Zod
  in `packages/shared`. Request schemas live in `apps/web/src/server/*schemas.ts`.
  This split is the main extraction job (§4).
- **Polling contract:** `GET /api/watchlists/:id` returns `refreshAfterSeconds`, so a
  client polls on the server's terms. This matters for mobile (§8, G5).

### 2.5 Environment variables today

| Variable | Read by | Class |
| --- | --- | --- |
| `DATABASE_URL`, `DATABASE_URL_DIRECT` | web, worker, migrations | Server-only secret |
| `AUTH_SESSION_SECRET` | web | Server-only secret |
| `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, `AUTH_BASE_URL`, `AUTH_ALLOW_SIGNUP`, `AVATAR_UPLOAD_DIR` | web | Server-only |
| `FYERS_APP_ID`, `FYERS_SECRET_KEY`, `FYERS_ACCESS_TOKEN`, `FYERS_STREAM`, `MARKET_DATA_PROVIDER`, Dhan equivalents | web / worker | Server-only secret |
| `FYERS_ID`, `FYERS_TOTP_SECRET`, `FYERS_PIN` | worker only | Account-level secret; never leaves the VPS |
| `TEST_DATABASE_URL` | Vitest | CI / local test |
| `VPS_SSH_KEY` | GitHub Actions | CI secret |

**None of these may ever reach the phone.** The mobile build carries one runtime
value — the API base URL — plus public identifiers (§9).

---

## 3. Authentication, as built

`docs/architecture/auth-system-design.md` (Better Auth) is superseded. What runs is a
bespoke first-party system in `apps/web/src/server/auth/*`.

**Credentials.** Email + password; Argon2id via `@node-rs/argon2` (OWASP params) with
rehash-on-login; password policy + Have-I-Been-Pwned check at sign-up; lockout keyed
by `ip:` and `email:` in `auth_attempts` (durable across deploys); decoy hash so
timing does not reveal whether an email exists. Email verification is optional and
never blocks login. Reset and email-change use one-shot hashed tokens in
`auth_tokens`.

**Sessions.** 256-bit random opaque token; DB stores its SHA-256; the cookie value is
`token.hmac` so the Edge middleware can reject forgeries without a DB hit. Cookie:
`__Host-session`, HttpOnly, Secure, SameSite=Lax. Idle timeout 7 days (rolling),
absolute 30 days; invalidated by password change, account disable, or row deletion.
Sessions list with "this device"; revoke one / others / everywhere. Append-only
`auth_audit`.

**Why it cannot be used as-is from a native app.**

- `isSameOrigin()` returns false with no `Origin`/`Referer`. React Native's fetch
  (OkHttp on Android) sends neither. Every mutating route — including sign-in —
  would fail with 403.
- The phone *could* let Android's cookie jar hold the cookie, but then the token is
  invisible to the app: it cannot be put behind biometrics, cannot be wiped precisely,
  cannot ride a background push-registration call, and `__Host-`/SameSite semantics
  differ from a browser's. Cookies are the right tool for browsers and the wrong one
  for apps.
- Sign-up sets a cookie and returns `{ ok, signedIn }` — the phone would have an
  account and no way to use it.

None of this is a flaw in the web design. The fix is additive (§7); the web path is
untouched.

---

## 4. Reuse classification

Buckets: **Reuse** (as-is) · **Extract** (to a shared package) · **Web-only** (stays
in Next.js) · **New** (mobile-specific) · **Backend** (server change required).

| Code | Bucket | Notes |
| --- | --- | --- |
| `packages/shared` | Reuse | Pure. **Caveat:** `formatPaise` passes a decimal *string* to `Intl.NumberFormat.format()` (the ES2023 overload). Hermes must be verified for this, for `en-IN` lakh/crore grouping and `signDisplay`. If it falls short, add a pure string formatter in `shared` (still integer-only), never a mobile fork. |
| `packages/core` | Reuse | Pure. The phone does not run the signal engine (rule 8), but uses `announcement-interpretation` constants/labels and `signal-lifecycle` helpers for display. |
| `packages/market-data` | Reuse | Types only (`Resolution`, `MarketStatus`, error codes). |
| `packages/shared/src/trade-signals.ts` | Reuse | Already the ideal shape: Zod schema + inferred DTO. |
| `apps/web/src/lib/{watchlist,market,disclosure,dashboard}-types.ts`, `return-windows.ts` | Extract | Plain interfaces with no web imports → `packages/api-contracts` as Zod schemas with inferred types; the web keeps importing the same names from the new package. |
| `apps/web/src/lib/api-routes.ts` | Extract | Route map, URL-only → `api-contracts`, so web and mobile cannot drift on a path. |
| `apps/web/src/server/{auth,profile}/schemas.ts`, `watchlist-schemas.ts`, `announcement-schemas.ts` | Extract | Request-body Zod schemas and password-policy constants → `api-contracts`. The Argon2 code does not move. |
| `apps/web/src/lib/format.ts`, `tone.ts`, `market-math.ts`, `watchlist-summary.ts`, `flow-analytics.ts`, `market-brief/*` | Extract (selectively) | Display maths and copy rules. Audit each for DOM/React imports first; pure ones go to `shared`. |
| `apps/web/src/app/globals.css` tokens | Extract | 198 custom properties incl. the financial four-slot convention. `packages/design-tokens` becomes the source and *generates* today's CSS block (byte-identical, test-verified) and a TypeScript theme for the phone. **Built in Phase 3 (S1).** |
| Legal copy (privacy, terms, disclaimer, data-sources, methodology) | Extract | One versioned source for website, app and the Play Data Safety answers; the app records the version accepted. |
| `apps/web/src/server/**` | Web-only | Reached over HTTP only. |
| `apps/web/src/components/**` | Web-only | Tailwind + Radix + DOM. Native components are built separately against the same tokens and copy. |
| `apps/web/src/middleware.ts` | Web-only + Backend | Keeps the cookie presence check; must also admit `Authorization: Bearer` (the Node layer still does the real check). |
| `packages/db`, `packages/fyers`, `packages/dhan`, both adapters | Server-only | Never importable from `apps/mobile`; enforced by dependency lists and a lint boundary rule. |
| `apps/mobile` | New | Expo app: navigation, screens, theme, secure storage, biometrics, push handling, deep links, offline cache, error boundaries, tests. |
| `packages/api-client` | New | Isomorphic typed client: fetch wrapper, auth injection, rotation, timeouts, error mapping, Zod parse. Mobile first; web adopts incrementally. |
| Bearer path, CSRF exemption, session client metadata, push registry, app-config, stock-detail route | Backend | Itemised in §8. |

### When the web design changes, what changes in the app?

| Layer | Examples | Shared? | How a change reaches phones |
| --- | --- | --- | --- |
| Tokens (values) | bullish green, surface planes, spacing/type scales, radii, four-slot convention | Yes | Edit once in `packages/design-tokens`; web on next deploy, app on next release. JavaScript-only, so shippable over the air (EAS Update) without a Play review. |
| Copy & rules | "Bullish setup", "Invalidation level", disclaimer, error/remedy text | Yes | Same, via `shared` / `api-contracts`. |
| Components & layout | watchlist table, filter panel, stock drawer, `chart.tsx` | No | Rebuilt natively: table → card list, drawer → screen, popover → bottom sheet. Deliberate — the desktop layout shrunk to a phone is what we are not building. |

The mobile design system (Phase 2 spec, Phases 3–5 build) mirrors the web one: same
surface-plane model, same Inter / Bricolage Grotesque / JetBrains Mono via
`expo-font`, same financial four slots; native additions: 48 dp touch targets, bottom
tabs, sheets, pull-to-refresh, direction always shown with an icon or label, never
colour alone. Styling is plain React Native `StyleSheet` with a typed theme object
generated from the tokens — no Tailwind-for-native layer.

---

## 5. Technology evaluation

| Criterion | Expo + RN | Bare RN | PWA | TWA / WebView | Kotlin |
| --- | --- | --- | --- | --- | --- |
| Reuse of existing TypeScript | High | High | Full | Full | None |
| Development complexity | Low | Medium | Low | Low | High |
| Performance (lists, charts) | Native | Native | Browser | Browser | Native |
| Keystore-backed token storage | Yes | Yes | No | No | Yes |
| Native UX (gestures, tabs, haptics) | Yes | Yes | No | No | Yes |
| Push notifications | FCM via `expo-notifications` | FCM, manual | Web Push, limited | Web Push, limited | FCM |
| Background tasks | Yes (OS limits) | Yes | Minimal | Minimal | Yes |
| Deep links / App Links | Built in | Manual | Partial | Yes | Yes |
| Biometric unlock | `expo-local-authentication` | Library | WebAuthn only | No | BiometricPrompt |
| Play Store publishing | EAS Submit | Gradle + manual | Not listable | Listable, thin | Gradle + manual |
| Long-term maintenance | Yearly SDK bump | Own native upgrades | Same as web | Same as web | Second codebase |
| Build infrastructure cost | EAS free tier / local | Free | Free | Free | Free |
| Fit for a finance data app | Strong | Strong | Weak offline/auth | Feels like a website | Strong |

**Verdict — Expo with React Native and TypeScript.** The repo argues for it: pure
packages, Zod-everywhere, paise/UTC rules and strict TS carry straight across, and
nothing in the tree is incompatible. Bare RN adds native-project upkeep with no
benefit here; Expo's prebuild still allows dropping to native if a module needs it.
PWA/TWA fail Keystore storage, biometric gating and a native feel outright (a PWA
manifest on the website is a free bonus later, not a substitute). Kotlin discards the
type contract and doubles every future feature.

---

## 6. Proposed architecture

```
Clients (HTTPS JSON only)
  apps/web        Next.js · cookie session · unchanged UI
  apps/mobile     Expo · Android first · bearer session in Keystore          [new]

Shared, client-safe
  packages/api-contracts   Zod DTOs + route map for every endpoint; error shape   [extract]
  packages/api-client      fetch wrapper: auth, rotation, timeout, retry, parse   [new]
  packages/shared          paise, IST time, timeframes, signal schemas
  packages/core            indicators, lifecycle, interpretation rules
  packages/market-data     provider-neutral types
  packages/design-tokens   one source → CSS vars (web) + TS theme (mobile)       [new, Phase 3]

──────── the phone never crosses this line ────────

Server only
  apps/web/src/server      auth (cookie + bearer), services, repositories
  apps/worker              13 jobs · only writer · + push sender (later)
  packages/db              Drizzle · Postgres                     never in a client bundle
  packages/fyers, dhan, providers-*                               never in a client bundle
```

Adjustments to the originally proposed structure: `validation/` is folded into
`api-contracts/` (a schema and its DTO are one thing); `db/` already exists and
stays.

### Invariants the phone inherits

| Rule | On the phone |
| --- | --- |
| `core` stays pure | Imported, never given IO. Clock and network live in the app and `api-client`. |
| Integer paise | Zod rejects non-integers at parse; `formatPaise` is the only path to a rupee string; a lint rule bans `toFixed` on price fields. |
| Market data only via the backend | No provider dependency, no credential; single outbound host; Android network-security config enforces HTTPS. |
| Worker is the writer | Push sending is a worker job reading a `push_devices` table the web API writes; the phone only registers/unregisters. |
| UTC internally, IST for display | Wire instants stay UTC; `shared/time.ts` renders IST regardless of the device timezone. |
| BUY / SELL is direction only | Same badge vocabulary; score renders with its breakdown or not at all; disclaimer is a first-run gate. |
| No order affordance | Nothing can act on a price; Play's financial-features questionnaire answered "no trading, no brokerage". |

### Two monorepo facts that shape Phase 3

- Workspace packages resolve through built `dist/` via `exports`, and their source
  uses `.js` specifiers (NodeNext). Metro will consume the same `dist/`; the mobile
  `dev` script must run the package watchers, as the web already does. First thing
  to prove.
- pnpm's strict `node_modules` needs a small Metro config (`watchFolders`,
  `nodeModulesPaths`) so Expo finds hoisted packages. Standard; proven in the first
  milestone.

---

## 7. Mobile auth and security design

**Opaque bearer sessions, not JWTs.** EquityWise already does a database lookup on
every authenticated request (`getSessionUser()`), so a self-contained JWT would save
nothing and add a second token type, key rotation and clock-skew handling. The
opaque model is already built and audited.

1. **Sign-in / sign-up declare the client.** Body gains `client: 'mobile'` plus
   `device: { name, platform, appVersion }`. Same schema, lockout, Argon2 verify and
   audit line. Web callers omit it; nothing changes for them.
2. **Mobile responses carry the token in the body**: `{ ok, session: { token,
   expiresAt }, user }`. Same 256-bit opaque value; SHA-256 into `auth_sessions` as
   today, plus two new columns `client` (`web | mobile`) and `device_name`.
3. **The phone stores it in the Android Keystore** via `expo-secure-store`. Never
   AsyncStorage, a file, or a log line. Optional biometric gate
   (`expo-local-authentication`) before the token is read into memory — a local
   convenience lock, never a server credential. Off by default (S10).
4. **Every request sends `Authorization: Bearer <token>`.** `getSessionUser()` reads
   the header first, then the cookie; identical validation (hash lookup, idle 7 d /
   absolute 30 d, password-change cut-off, account status). Idle timeout rolls on use.
5. **CSRF exemption is tied to the auth method.** `isSameOrigin()` is skipped only
   when the request authenticated via the Bearer header; cookie-authenticated
   requests are still origin-checked. A header a browser cannot add cross-site is
   immune to CSRF.
6. **Rotation without a refresh token.** `POST /api/auth/session/rotate` issues a
   fresh token and deletes the old row atomically; the app calls it every 7 days.
7. **Revocation already covers phones.** Sign out, sign out everywhere, password
   change, account disable and admin disable all invalidate mobile sessions
   instantly. The sessions screen shows device names.
8. **401 / 403 `ACCOUNT_DISABLED` are terminal on the phone.** `api-client` wipes
   SecureStore, clears the query cache, routes to sign-in. No retry, no silent
   re-login.

| Threat | Mitigation |
| --- | --- |
| Token theft from a rooted / backed-up device | Keystore storage, `android:allowBackup=false`, 7-day rotation, server-side revocation, sessions screen. |
| Password brute force via the app | Same `auth_attempts` lockout; Nginx rate limit on `/api/auth/*` as a second layer. |
| Man-in-the-middle | HTTPS only (`usesCleartextTraffic=false`), HSTS. **No certificate pinning by default:** Let's Encrypt rotates leaves every 60–90 days and a stale pin bricks every install. Pin only to the CA if a threat model later demands it. |
| Script reading the token (XSS analogue) | No WebView, no `eval`; token never in a URL, log or crash breadcrumb (Sentry scrubbing in Phase 6). |
| Reset / verify links opened on the phone | Android App Links for `equitywise.io/verify`, `/reset`, `/account/verify-email` with `/.well-known/assetlinks.json`; the website handles the link if the app is absent. |
| Audit | `auth_audit` gains `client`; new events `session_rotated`, `push_registered`. |

---

## 8. API gap analysis

| # | Gap | Where | Needed by | Size |
| --- | --- | --- | --- | --- |
| G1 | **CSRF origin check blocks native clients** — *blocker*. Skip `isSameOrigin()` only for Bearer-authenticated requests; also the hand-rolled checks in `enrolPaperStudy` and `announcements/[id]` PATCH. | `server/auth/request.ts`, 4 routes | Phase 3/4 | Small |
| G2 | **Bearer session path** — *blocker*. `getSessionUser()` reads the header; sign-in/sign-up accept `client`; sign-out and sessions routes work from a header; middleware admits Bearer; migration adds `client`, `device_name` to `auth_sessions`. | `server/auth/*`, `middleware.ts`, migration | Phase 4 | Medium |
| G3 | **Session rotation endpoint** `POST /api/auth/session/rotate`, atomic swap, audit line. | new route + repository fn | Phase 4 | Small |
| G4 | **App Links** — serve `/.well-known/assetlinks.json` with the Play signing certificate SHA-256. | Nginx or `apps/web/public` | Phase 4 | Small |
| G5 | **Live quotes over SSE** — RN's fetch cannot stream. (a) poll `GET /api/watchlists/:id` honouring `refreshAfterSeconds` — already supported; (b) `expo/fetch` streaming (SDK 52+) with an SSE parser. Do (a) first, (b) in Phase 6. | none for (a) | Phase 5.1 | None / Medium |
| G6 | **Stock detail route** `GET /api/stocks/:symbol` exposing `server/stock-detail.ts` (paise, indicators, 52-week, corporate actions, peers). | new route | Phase 5.3 | Small |
| G7 | **Push notifications** — `push_devices` table (user, Expo push token, platform, consent, updated_at); `POST/DELETE /api/push/devices`; worker job sending via Expo's push service (fronts FCM) on signal publish / key filing for a watched name; preferences in `user_profiles.preferences`. Needs a free Firebase project (S6). | db, web routes, worker | Phase 5.7 | Large |
| G8 | **App config / version gate** `GET /api/app-config` (public, cached): `minSupportedVersion`, `latestVersion`, `forceUpdate`, maintenance banner, feature flags. | new route, `config/app.yaml` | Phase 3 | Small |
| G9 | **Client identification** — log `X-EquityWise-Client: android/1.2.0 (build 34)` per request; add to `auth_audit` detail. | `server/auth/request.ts`, logging | Phase 3 | Small |
| G10 | **Avatar upload from a phone** — verify multipart with RN `FormData` + `expo-image-picker`. | verify only | Phase 5.6 | Small |
| G11 | **Market status endpoint** `GET /api/market/status` for the home screen (optional; today embedded in watchlist detail and the brief). | new route | Phase 5.1 | Small |
| G12 | **Contract packaging** — DTO interfaces → Zod in `packages/api-contracts` (§4). | `packages/api-contracts` | Phase 3 | Medium |

Nothing here weakens web authentication. G1 and G2 are additive: cookie users keep
the exact behaviour, headers and origin check they have now.

---

## 9. Environment strategy

Only variables prefixed `EXPO_PUBLIC_` are inlined into the bundle, and anything in
the bundle can be read by unzipping the APK. Rule: **if it would hurt to see it on a
public website, it cannot be `EXPO_PUBLIC_`.** The phone needs no secret: the session
token is created at sign-in and lives in the Keystore; everything privileged happens
on the server.

| Profile | API base URL | How the phone reaches it | Build |
| --- | --- | --- | --- |
| Local, physical phone (primary loop) | `http://localhost:3000` | `adb reverse tcp:3000 tcp:3000` forwards the phone's localhost to the Mac over USB — **no IP address in any file**. Wi-Fi alternative: gitignored `.env.local` with `EXPO_PUBLIC_API_URL=http://192.168.x.x:3000`. Cleartext only in the `development` variant. Web runs via `pnpm dev:web` against the SSH-tunnelled DB as today. | Expo dev client (built once by EAS) |
| Local, emulator (later, optional) | `http://10.0.2.2:3000` | Needs Android Studio, which is not installed (S4). | Expo dev client |
| Staging | `https://staging.equitywise.io` | Does not exist; see D5. | EAS `preview` (APK) |
| Production | `https://equitywise.io` | `eas.json` production profile; HTTPS only. | EAS `production` (AAB) |

**The Mac without Android Studio (S4/S5).** Needed: Android platform-tools (`adb`,
Homebrew cask), Node 24 + pnpm (present), Expo CLI (arrives with dependencies). Java
and the full SDK only for optional local builds. The loop: EAS builds a
`development` client once → install on the phone → `pnpm --filter mobile start`
streams JavaScript over USB → each save reloads on the phone. Play submission is
always a separate explicit command.

| Variable | Class | Where |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_APP_VARIANT` | Safe in bundle | `eas.json` per profile; gitignored `.env.local` locally |
| `EXPO_PUBLIC_SENTRY_DSN` (if D7 approved) | Safe in bundle | A DSN is a public write-only address |
| EAS project id, application id `io.equitywise.app`, `google-services.json` | Public identifiers | `app.config.ts`; the Google file kept out of git and injected by EAS |
| `EXPO_TOKEN`, Play service-account JSON, upload keystore | CI/CD secret | GitHub Actions secrets / EAS-managed credentials |
| Expo push access token (FCM server key) | Server-only secret | Worker `.env` on the VPS |
| Everything in today's `.env` | Server-only | Unchanged |

---

## 10. Risk register

| # | Risk | Likelihood | Impact | Mitigation / early test |
| --- | --- | --- | --- | --- |
| R1 | Hermes `Intl` gaps break `formatPaise` (string input, `en-IN` grouping, `signDisplay`) | Medium | High — every price | First Phase 3 device test runs the `money.test.ts` fixtures on the phone. Fallback: pure string formatter in `shared`, still integer-only. |
| R2 | Metro + pnpm + NodeNext `dist/` misresolve | Medium | Medium — blocks all work | First Phase 3 task: import `formatPaise` in a blank app and render it. |
| R3 | Play closed-testing requirement delays launch — personal account (S2) must run a closed test with a minimum number of opted-in testers (currently 12) for 14 continuous days before production access | High | Medium — calendar | Create the account and recruit 12+ testers during Phase 3. **Verify the count and duration on Google's official page at the time; both are policy values that change.** |
| R4 | Provider single-session token — a morning outage looks like an app bug | Medium | Medium | Render `quotesStale` and provider errors honestly with the existing `remedy` text; never retry into a rate-limit ban. |
| R5 | Scope creep from the web feature set | High | Medium | Phase 5 is one vertical at a time; v1.0 = watchlists, search, stock detail/charts, profile (S7). |
| R6 | Live SSE parity expectations | Medium | Low | Polling on `refreshAfterSeconds` gives ~3 s updates in market hours; SSE later. |
| R7 | Push notifications read as trading tips | Low | High — legal/policy | Technical, factual copy ("RELIANCE: BUY setup published, score 84"); opt-in per category; disclaimer accepted before enabling; Play financial declaration accurate. |
| R8 | Legal copy diverges across website, app and Play Data Safety | Medium | Medium | Single versioned source; the app records the version accepted. |
| R9 | Pre-existing Biome errors make lint gating awkward | High | Low | CI lint gate scoped to `apps/mobile` and the new packages. |
| R10 | Expo SDK / Play target-API churn | High | Low | Phase 8 calendar: one SDK upgrade a year, before Play's August deadline; verified against official pages each time. |

---

## 11. Decisions

### Settled — 2026-09-16 Q&A (binding from Phase 2 onwards)

| # | Decision | Answer | In practice |
| --- | --- | --- | --- |
| S1 | Styling in the app | Plain `StyleSheet` + typed theme; follow the design system | No NativeWind. `packages/design-tokens` built in **Phase 3**, generating both the web CSS variables and the app theme. |
| S2 | Play developer account | **Personal** | Faster to open (ID + phone, one-time fee). Mandatory closed test (12+ testers, 14 days) before production. Listing shows your name and a contact address. Convertible to an organisation account later. |
| S3 | Application id | **`io.equitywise.app`** | Permanent after first upload; matches the owned domain, which App Links and push identity rely on. |
| S4 | Developer machine | Mac, **no Android Studio** | EAS cloud builds; only platform-tools locally. Physical phone is the primary device; emulator deferred. Phone model / Android version still to be recorded. |
| S5 | Build pipeline | EAS cloud builds; **every change verified on the phone before any push** | One dev client from EAS; changes stream over USB. Store submission is a separate explicit step. |
| S6 | Push needs Firebase | Accepted | Free Firebase project for FCM; the worker sends via Expo's push service (G7, later phase). |
| S7 | v1.0 scope | Watchlists · search · stock detail & charts · profile | Announcements, flows, push in v1.1+. |
| S8 | Signals in the app | **Hidden for now** | No Signals tab, no paper journal, no `/api/signals` calls in v1.0. Contracts stay shared for later. |
| S9 | iOS | Later | Nothing iOS-specific built or documented; nothing chosen blocks it. |
| S10 | Biometric unlock | Optional, **off by default** | Settings toggle; a local gate over the Keystore token. |

### Still open — awaiting explicit approval

Each has a recommendation; an unanswered item is taken as the recommendation.

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Expo + React Native + TypeScript in `apps/mobile` | Yes (§5; consistent with S1) |
| D2 | Opaque bearer sessions reusing `auth_sessions` with 7-day rotation, instead of JWT + refresh | Opaque (§7) |
| D3 | Mobile sign-in shares existing routes (with a `client` field) rather than `/api/mobile/auth/*` | Shared routes: one lockout, one audit path |
| D4 | `packages/api-contracts` (Zod) + `packages/api-client`; web adopts incrementally | Yes, Phase 3; mechanical import renames, no behaviour change |
| D5 | Staging: second web + DB pair on the VPS, or production with test accounts | Defer staging to Phase 6; EAS `preview` against production with dedicated test accounts |
| D6 | Design-tokens package timing | Settled by S1: Phase 3 |
| D7 | Crash reporting / analytics | Sentry for crashes (free tier, Expo SDK, EAS source maps); no third-party analytics at launch |
| D8 | Where mobile docs live | `docs/mobile/` — this folder |

---

## 12. First milestone — "Foundation"

Bundles Phase 2, Phase 3 and the two server blockers from Phase 4, because a
foundation you cannot sign into cannot be verified end-to-end.

**In scope**

- Architecture decision record, dependency list with reasons, screen inventory,
  navigation map, mobile design-system spec (Phase 2).
- `apps/mobile` scaffolded with Expo, TypeScript strict (same base config), Biome,
  Vitest + React Native Testing Library, Metro configured for pnpm and workspace
  `dist/`.
- `packages/api-contracts`, `packages/api-client` created and consumed by the app;
  web imports repointed.
- `packages/design-tokens` as the single source: generates the `globals.css` token
  block (byte-identical, test-verified) and the app's typed theme (S1).
- Theme (light/dark), root navigation (auth stack + tab shell Home / Watchlists /
  Market / Profile — no Signals tab), error boundary, offline banner, app-config
  version gate.
- Application id `io.equitywise.app` fixed in `app.config.ts`; personal Play Console
  account created; closed-test tester list started (S2, R3).
- Server: G1 (conditional CSRF), G2 (bearer path + migration), G8 (app-config),
  G9 (client header).
- Real sign-in from the phone against production; the website's sessions screen
  shows the phone as a device.
- CI job for the app: typecheck, scoped lint, unit tests. EAS `development` and
  `preview` builds produced once by hand.

**Out of scope:** any product screen beyond a signed-in "hello, {displayName}"
home; push, biometrics, deep links, charts, the emulator; signals in any form;
the Play store listing.

**Completion criteria — all must be true**

- [ ] `pnpm typecheck`, `pnpm test` and the scoped lint pass on `main` with the new
      packages and app included; existing web CI stays green.
- [ ] A `development` build installs on a physical Android phone;
      `formatPaise(124550)` renders `₹1,245.50` and `formatPaise(12455000)` renders
      `₹1,24,550.00` on the device (R1 closed).
- [ ] Sign-in from the phone succeeds against `https://equitywise.io` with a real
      account; the token is in SecureStore; the website's sessions list shows the
      phone by device name; revoking it there logs the phone out on its next request.
- [ ] A web sign-in still sets the cookie and still rejects a cross-site POST —
      proven by the existing auth tests plus one new test for the Bearer path and one
      for the CSRF-exemption boundary.
- [ ] Airplane mode shows the offline state, not a crash; a forced
      `minSupportedVersion` above the installed version shows the update gate.
- [ ] An EAS `preview` APK installs on a second phone without a dev server.
- [ ] `docs/mobile/` contains the ADR, this discovery, and a "run it locally" guide
      a new engineer can follow.

---

## 13. What Phase 2 delivers

- Folder structure for `apps/mobile`, `packages/api-contracts`, `packages/api-client`,
  `packages/design-tokens`.
- Screen inventory and navigation map (auth stack · tabs Home / Watchlists / Market /
  Profile · stacks for stock detail and, later, announcements and flows · modals for
  search, add-to-list, disclaimer). Signals designed but hidden (S8).
- Mobile design-system spec: tokens → theme mapping, component inventory (buttons,
  fields, cards, chips, price-movement cell, chart, skeletons, empty/error states),
  touch-target and contrast rules, Indian-market conventions (₹, lakh/crore, IST,
  live/delayed status).
- Typed API-client design: TanStack Query for server state (and why), a small store
  for UI state, SecureStore for secrets, MMKV/AsyncStorage for non-sensitive
  preferences.
- Dependency list, each with its reason and the platform capability it would
  otherwise duplicate.
- Testing strategy (Vitest + RNTL for units/components, Maestro for on-device
  end-to-end flows, Detox rejected with reasons) and CI wiring.
- CI/CD: EAS Build / Submit / Update profiles; what may ship over the air and what
  must not.
- Play Store release checklist and maintenance plan, with every time-varying
  requirement flagged for verification against Google's pages at release time.
- Architecture decision record with the D1–D8 outcomes.

**Before Phase 2 starts:** answer D1–D8 ("approve all" is valid), and create the
personal Google Play Console account so the R3 clock starts early.
