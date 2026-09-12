# EquityWise.io — SEO Architecture & Engineering Reference

A comprehensive architectural manual and guide for human engineers and AI coding assistants working on the Search Engine Optimization (SEO), indexation, crawling, structured data, and public programmatic discovery surfaces of EquityWise.io.

---

## 1. High-Level Topology & Core Design Principles

EquityWise is a multi-user tracking, research, and technical screening platform for equities listed on the National Stock Exchange (NSE) of India. 

### The Public vs Private Boundary
EquityWise splits into two distinct operational halves:
1. **Public Discovery & Research Spine (SEO Optimized):**
   - Publicly accessible to Googlebot, Bingbot, social crawlers, and unauthenticated visitors.
   - Includes `/`, `/stocks`, `/stocks/[symbol]`, `/screener`, `/screener/[slug]`, `/sectors`, `/sectors/[sector]`, and trust hubs (`/about`, `/methodology`, `/data-sources`, `/disclaimer`, `/contact`, `/terms`, `/privacy`).
   - Served via Server-Side Rendering (SSR) with Incremental Static Regeneration (ISR).
   - Injects canonical links, OpenGraph/Twitter social cards, and Schema.org JSON-LD structured data.
2. **Private User Workspaces (Zero Indexation):**
   - User-specific data: `/watchlists`, `/profile`, `/admin`, `/account/*`, `/api/*`.
   - Requires valid session cookie (`auth_session`).
   - Protected by `robots: { index: false, follow: false }` metadata and `robots.txt` disallow rules to prevent search engine crawling and private data leakage.

### Core Product Constraints & Hard Invariants
When modifying or adding SEO pages or data fetchers, you **MUST** respect the following product rules:
1. **Integer Paise Everywhere:** All stock prices, moving averages, 52W highs/lows, and price changes are stored and processed as integer paise (₹1,245.50 = `124550`). Only convert to rupees for display strings in UI using `formatPaise()` from `@equitywise/shared`. Never use raw floats for currency.
2. **Closed Candles Only:** All indicators (RSI, EMAs, MACD, 52W ranges) are calculated exclusively on closed candles. Never look at the forming session.
3. **Broker Independence:** EquityWise is broker-independent. Never leak Fyers-specific terminology, symbols, resolutions, or broker account concepts into URLs, metadata, UI, or DTOs.
4. **No Order Execution:** EquityWise provides analytical decision support only. Never include order buttons, trade tickets, or execution affordances.
5. **No Hallucinated Data:** The database stores technical indicators, prices, and corporate actions. It does **not** store balance sheets, quarterly P&L, or IPO GMP. Do not invent mock financial accounting metrics for SEO.

---

## 2. Crawlability & Routing Architecture

### Middleware Crawler Gateways (`apps/web/src/middleware.ts`)
The Next.js middleware is the front gate for the application. Any route not explicitly classified as public will trigger an authentication redirect (`/login?next=...`).

```ts
const PUBLIC_PATHS = [
  '/',
  '/about',
  '/methodology',
  '/data-sources',
  '/disclaimer',
  '/contact',
  '/terms',
  '/privacy',
  '/robots.txt',
  '/sitemap.xml',
];

const PUBLIC_PREFIXES = [
  '/stocks',
  '/screener',
  '/sectors',
  '/api/search',
  '/api/og',
];
```

**Rule for Future Changes:** When creating a new public discovery route, you **MUST** register its exact path in `PUBLIC_PATHS` or its prefix in `PUBLIC_PREFIXES`. Otherwise, Googlebot will receive a `307 Temporary Redirect` to `/login`, eliminating the page from Google's index.

### Robots Configuration (`apps/web/src/app/robots.ts`)
Generates `/robots.txt` dynamically using Next.js Metadata API:
- **Allow Rules:** Explicitly whitelists public research hubs (`/`, `/stocks`, `/screener`, `/sectors`, etc.).
- **Disallow Rules:** Blocks crawl budget waste and private data indexing:
  - `/api/` (Internal endpoints)
  - `/admin` (Administrative console)
  - `/watchlists` (User-created watchlists)
  - `/profile` (User account management)
  - `/login`, `/signup`, `/reset`, `/verify`, `/account/` (Authentication flows)
  - `/*?*` (Query string combinations that produce duplicate canonical content)
- **Sitemap Link:** Points directly to `https://equitywise.io/sitemap.xml`.

### Multi-Tier Dynamic XML Sitemap (`apps/web/src/app/sitemap.ts`)
The sitemap dynamically pulls all active NSE equities from `instruments` and computes fresh metadata:

| Entry Group | URLs | Frequency | Priority | LastMod Source |
| :--- | :--- | :--- | :--- | :--- |
| **Root** | `/` | Daily | 1.0 | Current timestamp |
| **Core Hubs** | `/stocks`, `/screener`, `/sectors` | Daily | 0.9 | Current timestamp |
| **Screener Presets** | `/screener/52-week-high`, etc. | Daily | 0.85 | Latest indicator batch date |
| **Sectors** | `/sectors/banking`, etc. | Weekly | 0.8 | Latest indicator batch date |
| **Equities** | `/stocks/tatapower`, etc. | Daily | 0.75 | `daily_candles` / `daily_indicators` date |
| **Trust & E-E-A-T** | `/about`, `/methodology`, etc. | Monthly | 0.5 | Static deployment timestamp |

---

## 3. Metadata & OpenGraph Standards

Every public page must define a typed `Metadata` object following these standards:

### URL Normalization & Canonicals
- Base URL: Declared globally in `apps/web/src/app/layout.tsx` via `metadataBase: new URL('https://equitywise.io')`.
- Canonical tags: Must use root-relative paths (`alternates: { canonical: '/stocks/tatapower' }`) or absolute URLs matching `SITE_URL`.
- Lowercase symbols: All stock symbol slugs in URLs **MUST** be lowercase (e.g. `/stocks/tatapower`, `/stocks/infy`).

### Title Templates
- Global layout template: `%s | EquityWise`
- Individual stock pages: `{SYMBOL} Share Price & Technical Analysis — NSE Live Quote | EquityWise`
- Screener presets: `{Preset Name} Stocks NSE — Breakouts & Scans | EquityWise`
- Sector directories: `{Sector Name} Sector Stocks in India — NSE Quotes & Analysis | EquityWise`

### Social Cards (OpenGraph & Twitter)
Stock detail pages, screeners, and directories define explicit `openGraph` and `twitter` objects:
```ts
openGraph: {
  title: `${stock.name} (${stock.symbol}) Share Price & Technical Analysis`,
  description: `Live quote, 52-week range, RSI(14), moving averages, and technical indicators for ${stock.symbol} on NSE.`,
  url: `${SITE_URL}/stocks/${stock.symbol.toLowerCase()}`,
  type: 'website',
  images: [
    {
      url: `/api/og/stock?symbol=${stock.symbol.toLowerCase()}`,
      width: 1200,
      height: 630,
      alt: `${stock.symbol} NSE Technical Analysis Chart`,
    },
  ],
}
```

---

## 4. Structured Data (Schema.org JSON-LD)

Structured data is generated through type-safe functions in `apps/web/src/lib/seo/schema.ts` and injected into the DOM using `apps/web/src/components/seo/json-ld.tsx`.

### Core Schemas Implemented
1. **`Organization` & `WebSite` (Root Layout):**
   - `@type: "Organization"`: Brand identity, logo URL, description.
   - `@type: "WebSite"` with `potentialAction: { @type: "SearchAction", target: "https://equitywise.io/stocks?q={search_term_string}" }` to earn Google's Sitelinks Search Box.
2. **`BreadcrumbList` (All Public Pages):**
   - 1-indexed position list (`Home (1) > Stocks (2) > Tata Power (3)`).
   - Establishes crawl hierarchy and clean SERP breadcrumb navigation.
3. **`Corporation` (Stock Detail Pages):**
   - `tickerSymbol: "NSE:SYMBOL"`.
   - `isin: "INE..."`.
   - Resolves Google Knowledge Graph entities for Indian companies.
4. **`ItemList` (Stock Directory, Screener Presets, Sector Pages):**
   - Defines position-ordered collections of stocks.
   - Qualifies pages for rich list and carousel results.
5. **`FAQPage` (Stock Detail Pages):**
   - Technical Q&A (52-week high/low, RSI status, 50/200 EMA positions, corporate actions).
   - Generates expandable accordion rich snippets directly under search results.

### Safe Injection Rule
**NEVER** write inline `<script type="application/ld+json" dangerouslySetInnerHTML=... />` directly in page files. Always import `<JsonLd schema={...} />` from `@/components/seo/json-ld` to prevent Biome lint violations and ensure uniform serialization.

---

## 5. Incremental Static Regeneration (ISR) Strategy

To optimize server performance while keeping data fresh for Googlebot and human users:

| Surface | ISR Revalidate Period | Rationale |
| :--- | :--- | :--- |
| **`/stocks/[symbol]`** | `300` (5 minutes) | Balances market-hour quote freshness with edge caching speed. |
| **`/screener/[slug]`** | `300` (5 minutes) | Screeners update after each market batch calculation. |
| **`/stocks` (Directory)**| `3600` (1 hour) | New instrument listings and broad index changes happen infrequently. |
| **`/sectors/[sector]`** | `3600` (1 hour) | Sector constituent indicator aggregates update hourly/EOD. |
| **`/sectors` (Index)** | `86400` (24 hours) | Sector definitions change rarely. |
| **Trust Pages** | Static (`revalidate: false`)| Content changes only upon code deployment. |

---

## 6. E-E-A-T & Google YMYL Compliance

Financial stock search in India falls strictly under Google's **Your Money or Your Life (YMYL)** criteria. Without clear expertise, authoritativeness, and trust, pages will be downranked.

EquityWise establishes high E-E-A-T through 6 dedicated, crawlable transparency hubs:
1. **`/about`:** Explains the engineering philosophy, broker independence, and technical rigor behind the platform.
2. **`/methodology`:** Fully transparent mathematical formulas for Wilder's smoothed RSI(14), Exponential Moving Averages (EMA), MACD, and closed-candle evaluation invariants.
3. **`/data-sources`:** Discloses NSE market data ingestion policies, licensed Fyers API v3 integration, EOD batch reconciliation passes, and corporate action adjustments.
4. **`/disclaimer`:** Formal SEBI (Research Analysts) Regulations 2014 disclosure stating analytical, non-advisory, educational purpose.
5. **`/contact`:** Support channels and grievance redressal contact points.
6. **`/terms` & `/privacy`:** Clear policies on account security, cookies, and data retention.

---

## 7. Verification & Testing Runbook

When making changes to SEO, routing, or structured data, run the following automated verification steps:

```bash
# 1. Run the SEO unit test suite
./node_modules/.bin/vitest run apps/web/src/lib/seo/seo.test.ts

# 2. Verify TypeScript strict type-checking
./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit

# 3. Check Biome linter and formatter rules
./node_modules/.bin/biome check apps/web/src

# 4. Verify packages/db build
./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit
```

### Key SEO Test Assertions Covered in `seo.test.ts`:
- Valid `Organization` and `WebSite` graph structure.
- 1-indexed `BreadcrumbList` URLs matching `https://equitywise.io`.
- `Corporation` schema with correct `NSE:SYMBOL` ticker format.
- `ItemList` schema with valid item positions and URLs.
- `FAQPage` schema structure.
- `robots.ts` allows all public hubs and blocks all private/auth paths.
- `sitemap.ts` includes all core hubs, presets, active stocks, and zero private paths.
