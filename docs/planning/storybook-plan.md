# Storybook Architecture & Implementation Plan

This document establishes the architectural plan and technical roadmap for integrating **Storybook 8** into EquityWise (`apps/web`).

---

## 1. Objectives & Business Value

EquityWise has a dense, data-heavy financial user interface featuring bespoke design tokens, financial semantic color ramps (bullish, bearish, neutral), tabular numerical alignments, and complex watchlist states.

Integrating Storybook achieves:
1. **Isolated Component Development**: Build and iterate on financial components (e.g. 52-week range bars, sparklines, stock drawers) without requiring live market connections or Fyers API quotas.
2. **Visual Contrast & Theme Auditing**: Test components instantly across **Dark** and **Light** modes to verify OKLCH color contrast on critical financial indicators.
3. **Edge Case Simulation**: Effortlessly preview states that are hard to capture in live markets (e.g. circuit breakers, extreme % gaps, missing technical indicators, market pre-open countdowns).
4. **Living Design System Catalog**: Act as the single source of truth for all UI primitives, data-display cards, and market-specific atoms.

---

## 2. Technical Stack & Compatibility Matrix

| Dependency | Version | Strategy |
| :--- | :--- | :--- |
| **Storybook** | `^8.5.x` | Use `@storybook/nextjs` framework adapter |
| **Next.js** | `15.5.4` (App Router) | Mock `next/navigation` hooks (`useRouter`, `useSearchParams`) |
| **React / React DOM** | `19.2.0` | Supported natively in Storybook 8.4+ |
| **Tailwind CSS** | `v4.1.14` (`@tailwindcss/postcss`) | Import `apps/web/src/app/globals.css` directly in Storybook preview |
| **Icons** | `lucide-react` | Standard React components, no special mocking required |

### Workspace Boundaries
Storybook dependencies and scripts remain strictly scoped within `apps/web` to avoid polluting the monorepo root:
```bash
# Run Storybook locally
pnpm --filter @equitywise/web storybook

# Build static documentation artifact
pnpm --filter @equitywise/web build-storybook
```

---

## 3. Configuration & Theming Architecture

### A. `.storybook/main.ts`
```typescript
import type { StorybookConfig } from '@storybook/nextjs';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-a11y',
  ],
  framework: {
    name: '@storybook/nextjs',
    options: {},
  },
  staticDirs: ['../public'],
};

export default config;
```

### B. `.storybook/preview.tsx` (Tailwind v4 & Theme Sync)
EquityWise uses custom OKLCH design tokens and a `@custom-variant dark (&:where(.dark, .dark *))` selector in `apps/web/src/app/globals.css`.

The Storybook preview must load `globals.css` and supply a theme decorator:

```tsx
import type { Preview } from '@storybook/react';
import '../src/app/globals.css';

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/ } },
    backgrounds: { disable: true }, // Controlled by theme token classes
  },
  globalTypes: {
    theme: {
      name: 'Theme',
      description: 'Global theme for financial components',
      defaultValue: 'dark',
      toolbar: {
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Light Theme' },
          { value: 'dark', title: 'Dark Theme' },
        ],
      },
    },
  },
  decorators: [
    (Story, context) => {
      const isDark = context.globals.theme === 'dark';
      return (
        <div className={isDark ? 'dark bg-background text-foreground' : 'bg-background text-foreground'}>
          <div className="min-h-screen p-6">
            <Story />
          </div>
        </div>
      );
    },
  ],
};

export default preview;
```

---

## 4. Financial Mock Data & Fixtures Library

Financial components require domain-faithful mock data adhering to the **integer paise invariant**.

Create `apps/web/src/stories/fixtures/market-data.ts`:
```typescript
export const MOCK_STOCKS = {
  RELIANCE: {
    instrumentId: 101,
    symbol: 'RELIANCE',
    name: 'Reliance Industries Ltd',
    isin: 'INE002A01018',
    lastPrice: 298550, // ₹2,985.50
    change: 3250,      // +₹32.50
    changePercent: 1.10,
    volume: 4512000,
    high52w: 302000,
    low52w: 222000,
  },
  TCS: {
    instrumentId: 102,
    symbol: 'TCS',
    name: 'Tata Consultancy Services Ltd',
    isin: 'INE467B01029',
    lastPrice: 382000, // ₹3,820.00
    change: -4500,     // -₹45.00
    changePercent: -1.16,
    volume: 1820000,
    high52w: 425000,
    low52w: 331000,
  },
  HDFCBANK: {
    instrumentId: 103,
    symbol: 'HDFCBANK',
    name: 'HDFC Bank Ltd',
    isin: 'INE040A01034',
    lastPrice: 164000,
    change: 0,
    changePercent: 0.0,
    volume: 8900000,
    high52w: 179000,
    low52w: 138000,
  },
};
```

---

## 5. Component Story Hierarchy

Organized cleanly by abstraction layer:

```
Design System /
  ├── Tokens / Colors & Semantic Tones
  └── Typography / Tabular Numbers

UI Primitives /
  ├── Button
  ├── Badge
  ├── Card
  ├── Dialog
  ├── Popover
  ├── Select
  ├── Switch
  └── Tabs

Market Atoms /
  ├── NumericDisplay (Paise, Rupees, Lakhs/Crores, Deltas)
  ├── StockIdentity (Symbol, Company, ISIN, Exchange)
  ├── Sparkline (Bullish green, Bearish red, Neutral gray)
  ├── SignalBadge (Technical setup direction, confidence score)
  └── MarketStatus (Open, Closed, Pre-market timer)

Watchlist Features /
  ├── SummaryBar (Constituent stats, breadth ratio)
  ├── WatchlistTabs (Tab list, default indicator, actions menu)
  ├── WatchlistCells (52W range progress bar, returns heatmap)
  ├── FilterPanel (RSI filters, price range sliders)
  ├── ColumnPanel (Column visibility and reorder)
  └── StockDrawer (Technical summary slide-out panel)

Application Layout /
  ├── AppShell
  ├── Topbar
  └── Sidebar
```

---

## 6. Phased Implementation Roadmap

### Phase 1: Setup & Scaffolding
* Install Storybook dependencies in `apps/web`:
  `@storybook/nextjs`, `@storybook/addon-essentials`, `@storybook/addon-interactions`, `@storybook/addon-a11y`.
* Configure `.storybook/main.ts` and `.storybook/preview.tsx`.
* Add `storybook` and `build-storybook` scripts in `apps/web/package.json`.

### Phase 2: Design Tokens & Market Atoms
* Stories for `NumericDisplay` demonstrating paise conversion and sign formatting.
* Stories for `Sparkline` with positive, negative, and flat price series.
* Stories for `MarketStatus` showing all market cycle states.
* Stories for `SignalBadge` showing factor breakdown tooltips.

### Phase 3: Watchlist Organisms
* Stories for `WatchlistTabs` (single list, multi-list, overflow).
* Stories for `WatchlistTable` with virtualized scrolling and custom column configurations.
* Stories for `FilterPanel` and `StockDrawer`.

### Phase 4: Interaction Testing & Automated Verification
* Implement interaction tests using `@storybook/test` (`play` function) to verify:
  * Sorting a column updates the row sequence.
  * Toggling filters hides non-matching stocks.
  * Clicking a row triggers the stock drawer preview.
* Integrate static build test in CI: `pnpm --filter @equitywise/web build-storybook`.
