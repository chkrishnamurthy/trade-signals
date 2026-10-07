---
name: Landing page and public navigation
status: in-progress
horizon: next
created: 2026-10-07
updated: 2026-10-07
area: [web]
summary: Research-backed plan for the landing page and the signed-out / signed-in navigation — what is public, what each header shows, and the compliance lines the marketing must not cross.
owner: krishna
---

# Landing page and navigation before and after sign-in

> **Status:** delivery is phased. Done on `main`: Phase 0 (unsupported claims removed, `3f9682e`),
> Phase 1 (app-wide focus rings, skip links, `primary-strong`, `fce3431`), Phase 2 (signed-in navigation,
> `b28ce45`), 2.1 (post-release fixes, `b779e39`) and Phase 3 (public header, footer, landing page and
> public pages — §8). Phase B of §3 (public research pages) waits on data-display rights, which now
> also covers showing provider data to signed-in users (§8.4).
> Companion to `navigation-redesign-plan.md` (the signed-in app shell).

## 0. Recommendation in one paragraph

Adopt the **"open research, personal workspace"** model used by Screener.in, Tickertape and Trendlyne:
public pages answer "what is happening / which stocks / why", and an account is for the things
that are *yours* (watchlists, portfolio, alerts, saved screens). Ship it in two phases, because one
dependency is not a design choice: **phase A** (now) is a rebuilt marketing landing with a 4-item public
menu and no public market data; **phase B** opens stock, screener and market pages to signed-out visitors
with end-of-day data **once NSE redistribution rights are confirmed**. Signed-in users never see the
landing: `/` redirects to the Market brief. Keep signals out of every public surface.

---

## 1. What the current landing does (audit, `f98eeea`)

| # | Finding | Severity | Why it matters |
|---|---|---|---|
| L1 | **Placeholder testimonials ship with 5-star ratings** (`app/page.tsx`, "Rahul A.", "Priya N.", "Sundar V."). The code comment says replace before launch; they are live. | **High** | Invented reviews presented as real are deceptive, and on a finance site they destroy the trust the rest of the page builds. |
| L2 | **Markets "signals" and shows a Bullish-setup card with an entry zone and invalidation level** — but signals are admin-only (CLAUDE.md) and users never see them. | **High** | Promises a feature users don't get. And SEBI's 2025 RA FAQ says technical-analysis research on individual securities is *not* exempt from research-analyst registration — buy/sell-style setups on named stocks are the riskiest thing the page can show. |
| L3 | **"Free forever plan… Upgrade only when you want the full signal engine"** — subscriptions are explicitly out of scope (CLAUDE.md "Do not"). | **High** | A pricing promise with no product or plan behind it. |
| L4 | **Header search sends signed-out visitors to `/watchlists?symbol=`** → middleware → `/login`, and the watchlist ignores `symbol` anyway. | **High** | The first thing a curious visitor does ends at a login wall with their query lost. |
| L5 | **The public header has no navigation** — logo, search, theme toggle, Sign in, Get Started. Nothing explains what the product contains. | Medium | Every comparable site leads with a product/markets menu; visitors can't explore before committing. |
| L6 | **"Benchmark index" tiles show index codes with no values.** | Medium | Looks broken. (Probably deliberate — see §3 on data rights — in which case remove it.) |
| L7 | **SEO doc and middleware disagree**: `docs/architecture/seo-architecture.md` lists `/stocks`, `/screener`, `/sectors` as public; middleware gates them and the sitemap omits them. | Medium | The organic-search strategy exists on paper only. Decide (§3) and make the doc match. |
| L8 | Signed-in users who open `/` get the marketing page with a "Welcome back" badge. | Low | Two homes. Comparable apps send a signed-in user to their dashboard. |
| L9 | Footer calls the content "educational information". | Low | Since Aug 2024, SEBI restricts people who claim to be *educators* from using market price data from the preceding three months. EquityWise is a data/analytics tool; describing itself as education invites the wrong rule. |
| L10 | Theme toggle in the header; "Sign In" / "Get Started" capitalisation differs from the rest of the app. | Low | Polish. |

What is good and should stay: the headline "Know why a stock deserves your attention", the honest
"not a broker" stance, the integrity section, and the disclaimer box in the footer.

---

## 2. Research: how comparable sites do it

| Site | Signed-out header | Public without login | Hero / proof | Notes for us |
|---|---|---|---|---|
| **Screener.in** | Home · Screens · Tools ▾ · Login | Company pages, screens | "Stock analysis and screening tool for investors in India"; search front and centre | Closest analogue. Minimal header, search is the CTA, data credited in footer (C-MOTS). |
| **Tickertape** | Home · IN Stocks · US Stocks · MFs · Gold · Credit + big search | Everything: market mood, movers, screeners, news | Live NIFTY/SENSEX, user-count stats | Open-data model drives SEO and app installs. |
| **Trendlyne** | ~19 top-level items + More | Indices, gainers/losers, most tools | — | Shows the cost of no IA: a wall of links. Counter-example. |
| **StockEdge** | Explore ▾ (Market / Analytics tools / Personal tracking) · Products · Pricing · Login · Register for free | Market ticker, scans preview | SEBI RA number in hero, user stats | Good **Explore** grouping: market vs tools vs *your* stuff — mirrors our Track/Discover split. |
| **TradingView** | Products ▾ · Community ▾ · Markets ▾ · Brokers ▾ · More ▾ · Get started | Charts, markets, ideas | "Where the world does markets", "$0 forever, no credit card" | Mega-menus with descriptions; one primary CTA. |
| **Groww** | Stocks ▾ · F&O ▾ · Mutual Funds ▾ · More ▾ · Get started | Product pages, calculators, market pages | "Groww your wealth", trust stat | Heavy regulatory footer (it's a broker). |
| **Zerodha** | Signup · About · Products · Pricing · Support | Product pages, Varsity | "Invest in everything", trust pillars, anti-spam message | "No spam or gimmicks" — honesty as positioning, like ours. |

**Patterns adopted:** 4–5 grouped top-level items with descriptive dropdowns (TradingView, StockEdge);
search as a first-class control once there is something public to search (Screener, Tickertape); a
single primary CTA in brand colour plus an always-visible "Sign in"; honesty as positioning (Zerodha);
trust/legal block in the footer (all). **Rejected:** Trendlyne-style link walls; user-count stats and
media logos (we have none — never invent them); app-download CTAs (no app yet).

---

## 3. The decision that shapes everything: what is public

| | Phase A — now | Phase B — after data rights confirmed |
|---|---|---|
| Public | Landing, About, Methodology, Data sources, Contact, legal | + `/stocks/[symbol]`, `/screener` (ready-made screens), `/markets/breadth`, `/ipos/*`, `/calendar`, `/announcements`, `/flows` — **end-of-day** values, "At close · date" stamp |
| Account needed | Everything else | Watchlists, portfolio, alerts, saving/building screens, ratio-board layout, live prices |
| Search in header | Hidden | Shown → public stock page |
| SEO | Trust pages only | Stock and market pages indexable (the existing SEO doc's plan) |

**Why two phases:** NSE's Data Usage & Sharing Policy covers real-time, delayed *and* end-of-day data and
does not permit redistribution except under an agreement. Check what the current Fyers/Dhan terms allow
for display to non-account-holders before phase B; if they don't, phase B needs a vendor or NSE agreement.
This is a legal/commercial check, not a design one — the design works either way.

**Compliance guardrails for every public page** (not legal advice — have counsel confirm):
1. No BUY/SELL, "setup", "target", entry/exit levels or scores on named stocks in public pages or
   marketing. Facts ("closed above its 200-day average", "delivery 2.1× average") only.
2. Say what the product is: "research tool / data and technical readings", not "educational content".
3. Footer states: not a broker; not SEBI-registered as an investment adviser or research analyst; nothing is
   a recommendation; standard market-risk line; grievance/contact email.
4. No testimonials until real, consented quotes exist; no star ratings; no user counts you can't prove.
5. Grey-market premium (IPOs) labelled unofficial with source, as today.

---

## 4. Navigation before and after sign-in

### 4.1 Signed-out header (public pages)

```
[logo EquityWise]  Product ▾  Markets ▾ (B)  Learn ▾  About        [Search (B)]  Sign in  [Create free account]
```

- **Product ▾** (mega-menu, 3 columns):
  *Track* — Market brief · Watchlists · Portfolio tracker · Alerts;
  *Discover* — Screener · Stock pages · IPOs · Announcements;
  *Start here* — "How EquityWise works" tour card · "How every number is calculated".
  In phase A each item links to its section of the landing page (`/#watchlists`…); dedicated
  `/features/<x>` pages later if SEO needs them.
- **Markets ▾** (phase B only): Market breadth · IPOs · Market calendar · Announcements · Institutional flow
  — the same group as the app's Markets menu, so the words don't change after sign-in.
- **Learn ▾**: Methodology · Data sources · FAQ (· Glossary later).
- **About**: About · Contact & support.
- Right side: search (phase B, `/` shortcut), **Sign in** (text button, always visible incl. phone),
  **Create free account** (the only filled button). Theme toggle moves to the footer.
- **Phone:** logo · Sign in · menu button. The menu is a full-height sheet: search, accordion groups,
  About, disclaimer link, and a pinned footer with Sign in + Create free account. On the landing page a
  sticky bottom CTA bar appears once the hero scrolls away.

### 4.2 Signed in, on a public page (About, Methodology, a public stock page)

Same left side (visitors and members share the public IA), right side becomes
`[Search]  [Open my market brief →]  [avatar]`. No "Sign in"/"Create account".

### 4.3 Signed in, inside the app

The app shell from `navigation-redesign-plan.md`: Market brief · Watchlists · Portfolio · Screener ·
Markets ▾ · Alerts (+ Lab ▾ for admins), search, market-status pill, notices, avatar.

### 4.4 Rules that make the two feel like one product

| Rule | Why |
|---|---|
| Logo far left, account control far right, search in the same slot, 56–64px header in all states | Muscle memory across the sign-in boundary |
| Same group names: "Markets" means the same five pages before and after sign-in | No relearning |
| Logo goes to `/` when signed out, `/today` when signed in; `/` redirects signed-in users to `/today` | One home per state (L8) |
| Every gated action returns the user to where they were, with the action done (`?next=` + intent) | The sign-up is a step, not a detour |
| Footer legal links in every state | Trust signals never disappear |

### 4.5 Gating pattern (phase B)

Soft, contextual, never a full-page wall on public content: the visitor reads freely; trying a personal
action (Add to watchlist, Set alert, Save screen) opens an anchored panel —
"Save EXAMPLE to a watchlist · free and private · we'll bring you straight back" — with Google, email, and
"Not now — keep reading". After sign-up, the stock is already in their first watchlist. Personal routes
(`/watchlists`, `/portfolio`, `/alerts`, `/profile`) keep the hard redirect to `/login?next=`.

---

## 5. The landing page

Order, with the job each section does (desktop and phone mockups on the canvas):

| # | Section | Content | Job |
|---|---|---|---|
| 1 | Header | §4.1 | Orientation |
| 2 | Hero | "Know **why** a stock deserves your attention." · sub: watchlists, a 95-metric screener and a plain-English brief on every session — every number shows how it was worked out · CTAs **Create free account** / See how it works · checks: Free · Never asks for your broker login · No tips, no order buttons · visual: a watchlist with **made-up stocks, labelled Sample data** | Value in 5 seconds; honest visual |
| 3 | Three questions | What is happening in the market? / Which stocks deserve attention? / Why this one? — each with its features as links | Uses the product's own framing (CLAUDE.md) as the IA |
| 4 | Product tour | Tabs: Watchlists · Screener · Stock page · Portfolio tracker · IPOs · Market brief; each a real screenshot with sample data + 2–3 sentences + "Try it free" | Show, don't list |
| 5 | How the numbers are made | Closed sessions only · Adjusted for splits and bonuses · Every figure explains itself → Methodology | Credibility in plain words (today's version talks about "integer paise" — true, but engineer-speak) |
| 6 | What EquityWise is not | Not a broker · Not investment advice · Not a tip service · Never linked to your demat | Differentiator and compliance in one |
| 7 | Where the data comes from | Prices [confirm wording], filings & IPOs, indicators recomputed after each close → Data sources | Freshness and provenance |
| 8 | FAQ | Is it free? · Do I need to connect my broker? · Is this investment advice? · How fresh are the prices? · Can I import my holdings? (+ `FAQPage` JSON-LD) | Objection handling, SEO |
| 9 | Closing CTA | "Read the market with reasons, not rumours." · Create free account | Second chance to convert |
| 10 | Footer | Product · Markets · Learn · Company columns, disclaimer block, theme toggle, © | Trust, navigation |

Removed: testimonials (L1), signal card (L2), pricing promise (L3), empty index tiles (L6).

**Copy rules:** say "readings", "facts", "conditions"; never "signals", "calls", "targets", "tips",
"buy/sell". Sentence case everywhere ("Sign in", "Create free account").

**Accessibility/perf:** one `h1`; landmarks; real `<button>`s for menus with `aria-expanded`; the hero
visual is real HTML (not a screenshot) so it's sharp and readable; brand-green buttons use the
darker `#007a4d` (white text 5.4:1 — today's `primary` fill measures 4.1:1, under the 4.5:1 minimum); LCP is text, no hero video.

---

## 6. Implementation outline (when approved)

1. `app/page.tsx` — rebuild sections per §5; `if (user) redirect('/today')`; delete testimonials and the
   signal card; add `FAQPage` JSON-LD.
2. `components/layout/public-header.tsx` — Product/Learn/About menus (Radix NavigationMenu or
   DropdownMenu), phone sheet; hide search in phase A; signed-in variant per §4.2. Reuse
   `lib/navigation.ts` (`MARKETS_GROUP`, `HELP_LINKS`) so names match the app.
3. `components/layout/public-footer.tsx` — columns per §5, theme toggle, revised disclaimer
   ("research tool", RA/IA status, grievance email); drop "educational".
4. Phase B: middleware `isPublic` gains the public research routes; pages render EOD data for signed-out
   visitors; soft-gate component; sitemap + robots updated; `seo-architecture.md` reconciled.
5. Measure: visitor → sign-up rate, sign-ups started from a gated action, search usage, organic entrances
   to stock pages (phase B).

## 7. Open decisions

1. **Data rights** for showing EOD prices to signed-out visitors (gates phase B).
2. Whether anything will ever be paid — if so, add Pricing to the header then, not before.
3. Final wording of the data-sources line and the SEBI status sentence (counsel).
4. Grievance/contact email to publish in the footer.

## 8. Phase 3 — as built (2026-10-07)

### 8.1 Decisions taken while building

| Topic | Decision | Why |
|---|---|---|
| Header (§4.1) | Four landing-section links (Features · See it in action · How it works · Trust & safety) + a **Learn** menu (Methodology, Data sources, About, Disclaimer, Contact) — not the Product/Learn/About mega-menus | Nothing behind "Product" is public yet; section links say exactly where they go. Learn reuses the app's `NavMenu` (`LEARN_GROUP` in `lib/navigation.ts`) |
| Signed in on a public page (§4.2) | Learn menu, stock search, **Open Market brief**, account menu; no section links | `/` redirects members to `/today`, so `/#…` links would not land where they say |
| Height | `--nav-bar-height` (56px), same as the app bar | §4.4 "same height in all states" |
| Signals | **Admin-only everywhere**, including watchlists and the Market brief (CLAUDE.md updated) | SEBI RA FAQ 2025: technical analysis on named securities is research; the landing promises "no tips" |
| FAQ structured data (§5 row 8) | **Dropped** | Google stopped showing FAQ rich results on 7 May 2026; the visible FAQ stays |
| Sign-up switched off | Every "Create free account" becomes "Sign in" when `AUTH_ALLOW_SIGNUP=false` (`useSignupOpen()`) | `/signup` answers 404 then |
| Phone sticky CTA (§5) | Built: appears once the hero's button scrolls away; steps aside over other sign-up buttons and the footer | Plan §5; never covers footer links |
| Share card | `app/opengraph-image.tsx` (+ `twitter-image`), `app/icon.png`; pages with their own `openGraph` list `SHARE_IMAGE` | A page's `openGraph` replaces the layout's, image included |

### 8.2 Claims corrected against the code

"Every NSE-listed stock" → NSE mainboard, EQ/BE/BZ series · "a reading never changes" → readings are
restated when a split, bonus or correction is recorded · "PDF holdings statement" → CSV/Excel holdings
file or a broker contract note · watchlist indicators are columns you add · the brief covers the Nifty 50
universe · stock-page evidence is a tab, not a link · freshness wording matches what each page shows.

### 8.3 Public pages rewritten

About, Methodology (ATR added; the removed backtester no longer mentioned), Data sources (NSE files,
BSE announcements, AMFI, providers, InvestorGain GMP), Disclaimer ("research tool", no "educational"),
Terms (no "licensed feeds" claim), Privacy (Hostinger, Resend, retention incl. 14 nightly backups and
the security log that outlives an account; export is on request, not a button), Contact (mailto links;
the unverified `engineering@` address removed). All share `components/layout/public-page.tsx`.

Account deletion now works for Google-only accounts (they re-type their email instead of a password).

### 8.4 Still open (owner)

1. **Data licence.** Fyers' API terms allow apps for other users only with exchange approvals and FYERS
   consent, and restrict use of exchange data for "charting, technical tools…". This applies to the
   signed-in multi-user product today, not just to phase B. Get written confirmation (Fyers, Dhan, NSE)
   or counsel's view before promoting the site.
2. Grievance Officer name and postal address (`lib/legal.ts`) — shown once filled in.
3. Analytics for §6.5 measures: none exists; adding any needs the privacy page updated first.

## Sources

- [Screener.in](https://www.screener.in/), [Tickertape](https://www.tickertape.in/), [Trendlyne](https://trendlyne.com/),
  [StockEdge](https://www.stockedge.com/), [TradingView](https://www.tradingview.com/), [Groww](https://groww.in/),
  [Zerodha](https://zerodha.com/) — home pages reviewed 2026-10-07.
- [SEBI restricts finfluencers from using live market data for educational content — exchange4media](https://www.exchange4media.com/influence-zone-news/sebi-restricts-finfluencers-from-using-live-stock-market-data-educational-content-140505.html)
- [Key clarifications under the SEBI-issued FAQs 2025 (research analysts) — Lakshmikumaran & Sridharan](https://www.lkslaw.com/insights/articles/key-clarifications-under-the-sebi-issued-faqs-2025)
- [NSE Data Sharing & Usage Policy](https://www.nseindia.com/static/market-data/nse-data-policy)
- [FYERS — Terms & Conditions for API Usage](https://fyers.in/terms-and-conditions-api/)
- [Search Engine Journal — Google drops FAQ rich results](https://www.searchenginejournal.com/google-drops-faq-rich-results-from-search/574429/)
