---
name: seo
description: SEO architecture, Googlebot indexing, public routes, sitemaps, robots.txt, and Schema.org JSON-LD conventions. Use when adding or modifying public pages, routing in middleware, metadata, sitemaps, structured data, or technical SEO for EquityWise.
---

# SEO Architecture & Indexation Conventions

Verified against the codebase as of 2026-09-12. EquityWise splits into a **public discovery and research spine** (accessible to Googlebot and unauthenticated users) and a **private authenticated workspace** (watchlists, profile, admin).

## 1. Unblocked Crawler Gateway Rule (`middleware.ts`)

`apps/web/src/middleware.ts` default-denies unauthenticated requests and redirects to `/login`.
Any new public page **MUST** be explicitly listed in:
- `PUBLIC_PATHS` (exact match, e.g. `'/new-hub'`), or
- `PUBLIC_PREFIXES` (prefix match, e.g. `'/stocks'`)

If you fail to register a public route here, Googlebot receives a `307 Temporary Redirect` to `/login`, immediately dropping the page from Google Search indexation.

## 2. Private Surfaces Must Be Hidden (`robots: { index: false }`)

All private/auth surfaces must explicitly declare noindex in their `metadata`:
```ts
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};
```
This is configured on `(auth)/layout.tsx`, `admin/page.tsx`, `profile/page.tsx`, `watchlists/page.tsx`, `account/*`, and `not-found.tsx`.
Never allow `/watchlists`, `/profile`, `/admin`, or `/api` to appear in `sitemap.ts` or `robots.ts` allow rules.

## 3. Metadata & Canonical Standards

- `metadataBase` is defined at the root in `apps/web/src/app/layout.tsx` as `https://equitywise.io`.
- All canonical URLs must use root-relative paths (`alternates: { canonical: '/stocks/tatapower' }`) or absolute URLs from `SITE_URL` in `lib/seo/schema.ts`.
- Stock symbols in URLs are **always lowercase** (`/stocks/tatapower`, `/stocks/infy`).
- Metadata titles follow the pattern:
  - Global: `%s | EquityWise`
  - Stock detail: `${SYMBOL} Share Price & Technical Analysis — NSE Live Quote | EquityWise`
  - Screeners: `${Preset} Stocks NSE — Breakouts & Scans | EquityWise`
  - Sectors: `${Sector} Sector Stocks in India — NSE Quotes & Analysis | EquityWise`

## 4. Structured Data (Schema.org JSON-LD)

All structured data is generated with typed functions from `@/lib/seo/schema`:
- `generateOrganizationAndWebsiteSchema()` (Root layout / homepage)
- `generateBreadcrumbSchema(items)` (1-indexed BreadcrumbList on every public page)
- `generateStockSchema({ symbol, name, sector, isin })` (Corporation with `NSE:SYMBOL` on stock detail pages)
- `generateItemListSchema({ name, description, url, items })` (Directory & screener lists)
- `generateFaqSchema(faqs)` (FAQPage on stock detail pages)

**CRITICAL COMPONENT RULE:**
Never write inline `<script type="application/ld+json" dangerouslySetInnerHTML=... />` in pages. Always use the safe wrapper:
```tsx
import { JsonLd } from '@/components/seo/json-ld';

<JsonLd schema={stockSchema} />
```
This satisfies Biome's `noDangerouslySetInnerHtml` rule cleanly.

## 5. Incremental Static Regeneration (ISR) Cadence

Never make stock or screener pages pure dynamic `force-dynamic` unless real-time user mutations occur. Use Next.js ISR:
- `/stocks/[symbol]`: `export const revalidate = 300;` (5 minutes)
- `/screener/[slug]`: `export const revalidate = 300;` (5 minutes)
- `/stocks`: `export const revalidate = 3600;` (1 hour)
- `/sectors/[sector]`: `export const revalidate = 3600;` (1 hour)
- `/sectors`: `export const revalidate = 86400;` (24 hours)

## 6. Hard System Invariants in SEO Code

1. **Integer Paise:** Display prices by passing integer paise to `formatPaise()` from `@equitywise/shared`. Never convert database numbers to raw float rupees in business logic.
2. **Closed Candles:** SEO indicators are computed from completed trading sessions. No forming bars.
3. **No Broker Names in SEO:** Do not mention Fyers or provider types in URLs, meta tags, schemas, or UI copies.
4. **No Mock Financials:** We store technical indicators and corporate actions. Do not hallucinate P/E, EPS, balance sheet debt, or quarterly net profit if not in DB.
5. **E-E-A-T Compliance:** Always maintain links in `public-footer.tsx` to `/about`, `/methodology`, `/data-sources`, and `/disclaimer` (SEBI non-advisory compliance).

## 7. Verification Commands

Before concluding any SEO work, run:
```bash
./node_modules/.bin/vitest run apps/web/src/lib/seo/seo.test.ts
./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit
./node_modules/.bin/biome check apps/web/src
```
