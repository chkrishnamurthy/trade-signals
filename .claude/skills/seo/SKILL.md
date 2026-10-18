---
name: seo
description: Public-route, indexing, sitemap, robots.txt and Schema.org JSON-LD conventions for apps/web. Use when adding or changing a public page, the middleware's public list, page metadata, sitemap.ts, robots.ts, or structured data.
---

# SEO and indexing

Verified against the code on 2026-10-18. EquityWise has a small **public** surface
(the landing page and the trust pages) and a **private** application behind sign-in.
Everything a signed-in user sees — including `/stocks/[symbol]`, `/screener` and
`/ipos` — is private and `noindex`. There is no public programmatic stock, screener or
sector spine; `docs/architecture/seo-architecture.md` describes one that was never
built.

## 1. The middleware decides what is public

`apps/web/src/middleware.ts` is closed by default. `isPublic(pathname)` is an explicit
list of exact paths: `/`, the `(auth)` pages, `/privacy`, `/terms`, `/about`,
`/methodology`, `/data-sources`, `/disclaimer`, `/contact`, plus `/api/auth/*`,
`/api/search`, the OG/Twitter images, `/robots.txt` and `/sitemap.xml`. Anything else
redirects an anonymous visitor (and Googlebot) to `/login`, or answers `401` under
`/api/`.

A new public page needs all three of: an entry in `isPublic`, an entry in
`app/sitemap.ts`, and an `allow` entry in `app/robots.ts`. Making a page public is a
product decision — check before widening the list.

## 2. Private pages declare `noindex`

Every private page sets, in its `metadata`:

```ts
robots: { index: false, follow: false },
```

It is on `(auth)/layout.tsx`, `not-found.tsx`, and every app page (`/today`,
`/watchlists`, `/screener`, `/stocks/[symbol]`, `/ipos/*`, `/portfolio/*`, `/alerts`,
`/announcements`, `/calendar`, `/flows`, `/profile`, `/account/*`, `/admin/*`). A new
private page copies it. Known gap: `/markets/breadth` sets no metadata yet; the
middleware still keeps it out of the index. `robots.ts` also disallows `/api/`, `/admin`,
and the app and auth paths.

## 3. Metadata

- `metadataBase` is `SITE_URL` (`https://equitywise.io`, from `lib/seo/schema.ts`),
  set in `app/layout.tsx`; the title template is `%s | EquityWise`.
- Canonicals are root-relative or built from `SITE_URL`.
- No provider names (Fyers, Dhan) in URLs, titles, descriptions or structured data.

## 4. Structured data (Schema.org JSON-LD)

Generators live in `apps/web/src/lib/seo/schema.ts`. In use today:

- `generateOrganizationAndWebsiteSchema()` — root layout.
- `generateBreadcrumbSchema(items)` — `components/layout/public-page.tsx`, on the public
  trust pages.

`generateStockSchema`, `generateItemListSchema` and `generateFaqSchema` exist but have
no caller, because no stock or list page is public.

Never write an inline `<script type="application/ld+json" dangerouslySetInnerHTML …>`.
Render through the wrapper, which keeps Biome's `noDangerouslySetInnerHtml` clean:

```tsx
import { JsonLd } from '@/components/seo/json-ld';

<JsonLd schema={schema} />
```

## 5. Trust links

`components/layout/public-footer.tsx` links to `/about`, `/methodology`,
`/data-sources`, `/disclaimer`, `/contact`, `/terms` and `/privacy`. Keep them: the
disclaimer states the product is not SEBI-registered advice.

## 6. Product rules that apply to public copy

- No signals, recommendations or "setup" language (CLAUDE.md, "Do not").
- No fundamentals the database does not hold (no P/E, EPS, market cap).
- Prices reach the page as integer paise through `formatPaise()`.

## 7. Verify

```bash
./node_modules/.bin/vitest run apps/web/src/lib/seo/seo.test.ts apps/web/src/server/route-auth.test.ts
./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit
./node_modules/.bin/biome check apps/web/src
```
