'use client';

import { useState } from 'react';
import { ChartContainer, ChartToolbar } from '@/components/charts/chart-container';
import { DataTable, type DataTableColumn } from '@/components/data-display/data-table';
import {
  DefinitionGrid,
  DefinitionRow,
  MetricCard,
  StatTile,
} from '@/components/data-display/metric-card';
import {
  CardSkeleton,
  ConnectionError,
  DataUnavailable,
  EmptyState,
  ErrorState,
  InlineError,
  SkeletonRows,
  TableSkeleton,
} from '@/components/data-display/states';
import { ActiveFilters, FilterBar, FilterGroup, SearchInput } from '@/components/forms/filter-bar';
import { FormDescription, FormField, FormLabel, FormMessage } from '@/components/forms/form-field';
import { AppShell } from '@/components/layout/app-shell';
import { ContentGrid } from '@/components/layout/grid';
import {
  PageContainer,
  PageContent,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
  Section,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/layout/page';
import { DataFreshness, LiveIndicator, MarketStatus } from '@/components/market/market-status';
import {
  Currency,
  IndexLevel,
  IndicatorValue,
  MarketCap,
  Percent,
  PercentChange,
  Price,
  PriceChange,
  Quantity,
  Ratio,
  Turnover,
  Volume,
} from '@/components/market/numeric';
import {
  SetupTag,
  SignalBadge,
  SignalReason,
  SignalScore,
  SignalStrength,
  TrendIndicator,
  VolumeIndicator,
} from '@/components/market/signal';
import { Sparkline } from '@/components/market/sparkline';
import { StockAvatar, StockIdentity } from '@/components/market/stock-identity';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardHeading,
  CardTitle,
  CardToolbar,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Text } from '@/components/ui/typography';
import type { SignalDirection } from '@/lib/dashboard-types';
import { Rule, Specimen, Swatch, SwatchGrid } from './swatches';

/**
 * The design system, rendered by the design system.
 *
 * This page is the acceptance test for consistency: every token and every
 * shared component appears here exactly once, built from the same imports a
 * feature page uses. If something looks wrong here, it is wrong everywhere.
 *
 * It is a route inside the app rather than a separate Storybook so it cannot
 * drift from the real theme, the real fonts or the real dark mode.
 */

const DIRECTIONS: readonly SignalDirection[] = [
  'strong_bullish',
  'bullish',
  'neutral',
  'bearish',
  'strong_bearish',
];

interface DemoRow {
  symbol: string;
  name: string;
  ltp: number;
  changePercent: number;
  volume: number;
}

const DEMO_ROWS: readonly DemoRow[] = [
  {
    symbol: 'RELIANCE',
    name: 'Reliance Industries',
    ltp: 284550,
    changePercent: 1.52,
    volume: 8_240_000,
  },
  {
    symbol: 'TCS',
    name: 'Tata Consultancy Services',
    ltp: 412075,
    changePercent: -0.84,
    volume: 1_920_000,
  },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', ltp: 165230, changePercent: 0, volume: 12_400_000 },
];

export function DesignSystem() {
  const [timeframe, setTimeframe] = useState<'1D' | '5D' | '1M'>('1D');
  const [query, setQuery] = useState('');

  const columns: readonly DataTableColumn<DemoRow>[] = [
    {
      id: 'symbol',
      header: 'Stock',
      sortValue: (row) => row.symbol,
      cell: (row) => <StockIdentity symbol={row.symbol} name={row.name} />,
    },
    {
      id: 'ltp',
      header: 'LTP',
      numeric: true,
      sortValue: (row) => row.ltp,
      cell: (row) => <Price paise={row.ltp} bare size="sm" />,
    },
    {
      id: 'change',
      header: 'Change',
      numeric: true,
      sortValue: (row) => row.changePercent,
      cell: (row) => <PercentChange value={row.changePercent} size="sm" />,
    },
    {
      id: 'volume',
      header: 'Volume',
      numeric: true,
      hideBelow: 'sm',
      sortValue: (row) => row.volume,
      cell: (row) => <Volume shares={row.volume} size="sm" />,
    },
  ];

  return (
    <AppShell>
      <PageContainer width="narrow">
        <PageHeader>
          <PageHeading>
            <PageTitle>Design system</PageTitle>
            <PageDescription>
              Every token and shared component, rendered from the same imports a feature page uses.
              Toggle the theme in the topbar to check both palettes.
            </PageDescription>
          </PageHeading>
        </PageHeader>

        <PageContent>
          {/* ---------------------------------------------------------------- */}
          <Section>
            <SectionHeader>
              <SectionTitle>Principles</SectionTitle>
            </SectionHeader>
            <Card>
              <CardContent>
                <ul className="space-y-2">
                  <Rule>
                    No component names a raw palette colour. Every colour is a semantic token
                    defined once in <code className="font-mono text-xs">globals.css</code>.
                  </Rule>
                  <Rule>
                    Every financial number renders through a component from{' '}
                    <code className="font-mono text-xs">market/numeric</code>, so decimals, Indian
                    grouping, tabular figures and the missing-data em dash are decided once.
                  </Rule>
                  <Rule>
                    <code className="font-mono text-xs">null</code> means the exchange did not
                    supply the field, and always renders as an em dash. It never renders as zero.
                  </Rule>
                  <Rule>
                    Colour is never the sole carrier of meaning: every tone ships a glyph, and every
                    bar ships its number.
                  </Rule>
                  <Rule>A score never renders without the factors that produced it.</Rule>
                  <Rule>
                    Vocabulary is descriptive, never instructional. "Bullish setup", "Potential
                    entry level", "Watch" — never BUY, SELL, ORDER or ENTRY PRICE.
                  </Rule>
                </ul>
              </CardContent>
            </Card>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section>
            <SectionHeader>
              <SectionTitle>Colour</SectionTitle>
              <SectionDescription>Semantic tokens, not palette steps</SectionDescription>
            </SectionHeader>

            <Card>
              <CardHeader>
                <CardHeading>
                  <CardTitle>Surfaces and text</CardTitle>
                  <CardDescription>Depth comes from contrast and borders</CardDescription>
                </CardHeading>
              </CardHeader>
              <CardContent>
                <SwatchGrid>
                  <Swatch token="bg-background" />
                  <Swatch token="bg-surface" />
                  <Swatch token="bg-surface-raised" />
                  <Swatch token="bg-surface-sunken" />
                  <Swatch token="bg-muted" />
                  <Swatch token="bg-accent" />
                </SwatchGrid>
                <div className="mt-4 space-y-1">
                  <p className="text-sm text-foreground">text-foreground — primary reading text</p>
                  <p className="text-sm text-muted-foreground">
                    text-muted-foreground — labels and secondary detail
                  </p>
                  <p className="text-sm text-subtle-foreground">
                    text-subtle-foreground — timestamps, units, missing values
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardHeading>
                  <CardTitle>Financial semantics</CardTitle>
                  <CardDescription>
                    Four slots per direction: accent, strong text, soft surface, line
                  </CardDescription>
                </CardHeading>
              </CardHeader>
              <CardContent className="space-y-4">
                <SwatchGrid>
                  <Swatch token="bg-bullish" />
                  <Swatch token="bg-bullish-soft" />
                  <Swatch token="bg-bearish" />
                  <Swatch token="bg-bearish-soft" />
                  <Swatch token="bg-neutral" />
                  <Swatch token="bg-neutral-soft" />
                </SwatchGrid>
                <SwatchGrid>
                  <Swatch token="bg-primary" />
                  <Swatch token="bg-destructive" />
                  <Swatch token="bg-warning" />
                  <Swatch token="bg-success" />
                  <Swatch token="bg-info" />
                  <Swatch token="bg-market-unknown" />
                </SwatchGrid>
                <SwatchGrid>
                  <Swatch token="bg-chart-1" />
                  <Swatch token="bg-chart-2" />
                  <Swatch token="bg-chart-3" />
                  <Swatch token="bg-chart-4" />
                  <Swatch token="bg-chart-5" />
                  <Swatch token="bg-chart-grid" />
                </SwatchGrid>
              </CardContent>
              <CardFooter>
                <span>
                  Signed numbers use <code className="font-mono">positive</code> /{' '}
                  <code className="font-mono">negative</code>, which alias bullish / bearish but can
                  diverge for inverted metrics such as INDIA VIX.
                </span>
              </CardFooter>
            </Card>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section>
            <SectionHeader>
              <SectionTitle>Typography</SectionTitle>
              <SectionDescription>Eleven roles; nothing else picks a size</SectionDescription>
            </SectionHeader>
            <Card>
              <CardContent className="space-y-2">
                <Text variant="page-title" as="p">
                  Page title
                </Text>
                <Text variant="section-title" as="p">
                  Section title
                </Text>
                <Text variant="card-title" as="p">
                  Card title
                </Text>
                <Text variant="body" as="p">
                  Body — the default reading size for prose inside a panel.
                </Text>
                <Text variant="secondary" as="p">
                  Secondary — supporting explanation.
                </Text>
                <Text variant="caption" as="p">
                  Caption — timestamps, counts, footnotes.
                </Text>
                <Text variant="label" as="p">
                  Label — form and metric labels.
                </Text>
                <Text variant="overline" as="p">
                  Overline — metric card headings
                </Text>
                <Separator className="my-2" />
                <Text variant="display" as="p">
                  ₹2,845.50
                </Text>
                <Text variant="metric" as="p">
                  24,318.55
                </Text>
                <Text variant="value" as="p">
                  1,245.50
                </Text>
                <Text variant="indicator" as="p">
                  RSI 62.4 · ATR 18.20
                </Text>
              </CardContent>
              <CardFooter>
                <span>
                  Every numeric role carries <code className="font-mono">figure</code> — tabular
                  lining figures with ligatures off, so columns align digit for digit.
                </span>
              </CardFooter>
            </Card>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section>
            <SectionHeader>
              <SectionTitle>Radius, elevation and spacing</SectionTitle>
            </SectionHeader>
            <ContentGrid columns="split">
              <Specimen name="radius" note="four steps, derived from --radius">
                <div className="grid size-16 place-items-center rounded-sm border border-border bg-muted text-xs">
                  sm
                </div>
                <div className="grid size-16 place-items-center rounded-md border border-border bg-muted text-xs">
                  md
                </div>
                <div className="grid size-16 place-items-center rounded-lg border border-border bg-muted text-xs">
                  lg
                </div>
                <div className="grid size-16 place-items-center rounded-xl border border-border bg-muted text-xs">
                  xl
                </div>
                <div className="grid size-16 place-items-center rounded-full border border-border bg-muted text-xs">
                  full
                </div>
              </Specimen>
              <Specimen name="shadow" note="borders first, shadow only for floating layers">
                <div className="grid size-16 place-items-center rounded-lg bg-surface text-xs shadow-subtle">
                  subtle
                </div>
                <div className="grid size-16 place-items-center rounded-lg bg-surface text-xs shadow-elevated">
                  elevated
                </div>
                <div className="grid size-16 place-items-center rounded-lg bg-surface text-xs shadow-overlay">
                  overlay
                </div>
              </Specimen>
            </ContentGrid>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section>
            <SectionHeader>
              <SectionTitle>Controls</SectionTitle>
            </SectionHeader>

            <Specimen name="Button" note="six variants, five sizes">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
              <Button size="sm">Small</Button>
              <Button size="lg">Large</Button>
              <Button disabled>Disabled</Button>
            </Specimen>

            <Specimen name="Badge">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="bullish">Bullish</Badge>
              <Badge variant="bearish">Bearish</Badge>
              <Badge variant="neutral">Neutral</Badge>
              <Badge variant="warning">Stale</Badge>
              <Badge variant="destructive">Error</Badge>
            </Specimen>

            <Specimen name="Input · Select · Checkbox · Switch">
              <Input placeholder="Symbol" className="w-40" />
              <SearchInput value={query} onValueChange={setQuery} className="w-48" />
              <Select defaultValue="1d">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1d">Daily</SelectItem>
                  <SelectItem value="1w">Weekly</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 text-sm">
                <Checkbox id="ds-checkbox" defaultChecked />
                <Label htmlFor="ds-checkbox">Only signals</Label>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Switch id="ds-switch" defaultChecked />
                <Label htmlFor="ds-switch">Auto-refresh</Label>
              </div>
            </Specimen>

            <Specimen name="FormField" note="owns id, aria-describedby and aria-invalid">
              <FormField invalid className="w-64">
                <FormLabel>Alert threshold</FormLabel>
                <Input placeholder="e.g. 2850.00" defaultValue="abc" />
                <FormDescription>Price level in rupees.</FormDescription>
                <FormMessage>Enter a numeric price.</FormMessage>
              </FormField>
            </Specimen>

            <Specimen name="Overlays">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline">Tooltip</Button>
                </TooltipTrigger>
                <TooltipContent>
                  <span className="font-medium">RSI</span>
                  <span className="block text-muted-foreground">
                    Relative Strength Index — momentum on a 0–100 scale.
                  </span>
                </TooltipContent>
              </Tooltip>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">Dropdown</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem>Add to watchlist</DropdownMenuItem>
                  <DropdownMenuItem>Open detail</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">Dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Dialog</DialogTitle>
                    <DialogDescription>
                      Focus is trapped, Escape closes, focus returns to the trigger.
                    </DialogDescription>
                  </DialogHeader>
                </DialogContent>
              </Dialog>

              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline">Sheet</Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <div>
                      <SheetTitle>Sheet</SheetTitle>
                      <SheetDescription>The detail drawer shell</SheetDescription>
                    </div>
                  </SheetHeader>
                  <SheetBody>
                    <Text variant="secondary">
                      Anchored to an edge; the same primitive backs the stock detail drawer and the
                      mobile navigation.
                    </Text>
                  </SheetBody>
                </SheetContent>
              </Sheet>
            </Specimen>

            <Specimen name="Tabs">
              <Tabs defaultValue="overview" className="w-full">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="technicals">Technicals</TabsTrigger>
                </TabsList>
                <TabsContent value="overview">
                  <Text variant="caption">Overview panel</Text>
                </TabsContent>
                <TabsContent value="technicals">
                  <Text variant="caption">Technicals panel</Text>
                </TabsContent>
              </Tabs>
            </Specimen>

            <Specimen name="FilterBar">
              <FilterBar className="w-full">
                <SearchInput value={query} onValueChange={setQuery} className="w-48" />
                <FilterGroup label="Direction">
                  <Badge variant="bullish">Bullish</Badge>
                  <Badge variant="bearish">Bearish</Badge>
                </FilterGroup>
                <ActiveFilters
                  filters={[
                    { id: 'rsi', label: 'RSI < 30' },
                    { id: 'vol', label: 'Rel vol > 1.5×' },
                  ]}
                  onRemove={() => undefined}
                  onClear={() => undefined}
                />
              </FilterBar>
            </Specimen>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section>
            <SectionHeader>
              <SectionTitle>Financial values</SectionTitle>
              <SectionDescription>
                Three states each: loading, not supplied, value
              </SectionDescription>
            </SectionHeader>

            <Specimen name="Price · IndexLevel · Currency">
              <Price paise={284550} />
              <Price paise={284550} bare />
              <IndexLevel paise={2431855} />
              <Currency paise={124_500_000_000} />
              <Price paise={null} />
              <Price paise={284550} loading />
            </Specimen>

            <Specimen name="PriceChange · PercentChange">
              <PriceChange paise={4250} percent={1.52} />
              <PriceChange paise={-3175} percent={-0.84} />
              <PriceChange paise={0} percent={0} />
              <PercentChange value={2.41} />
              <PercentChange value={-1.08} />
              <PercentChange value={null} />
            </Specimen>

            <Specimen name="Volume · Turnover · MarketCap · Quantity · Ratio · Percent">
              <Volume shares={18_200_000} />
              <Turnover paise={124_500_000_000} />
              <MarketCap paise={1_845_000_000_000} />
              <Quantity units={1_250_000} />
              <Ratio value={1.82} />
              <Percent value={64.2} />
              <IndicatorValue value={62.4} />
            </Specimen>

            <Specimen name="Sizes" note="xs · sm · md · lg · xl · display">
              <Price paise={284550} size="xs" />
              <Price paise={284550} size="sm" />
              <Price paise={284550} size="md" />
              <Price paise={284550} size="lg" />
              <Price paise={284550} size="xl" />
              <Price paise={284550} size="display" />
            </Specimen>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section>
            <SectionHeader>
              <SectionTitle>Market components</SectionTitle>
            </SectionHeader>

            <Specimen name="StockIdentity · StockAvatar">
              <StockAvatar symbol="RELIANCE" />
              <StockIdentity symbol="RELIANCE" name="Reliance Industries" />
              <StockIdentity symbol="TCS" name="Tata Consultancy Services" size="lg" />
              <StockIdentity symbol="INFY" name="Infosys">
                <SignalBadge direction="bullish" compact />
              </StockIdentity>
            </Specimen>

            <Specimen name="SignalBadge">
              {DIRECTIONS.map((direction) => (
                <SignalBadge key={direction} direction={direction} />
              ))}
            </Specimen>

            <Specimen name="SignalStrength · TrendIndicator · VolumeIndicator · SetupTag">
              <div className="w-40">
                <SignalStrength strength={82} direction="strong_bullish" />
              </div>
              <div className="w-40">
                <SignalStrength strength={24} direction="bearish" />
              </div>
              <TrendIndicator tone="bullish" />
              <TrendIndicator tone="neutral" />
              <TrendIndicator tone="bearish" />
              <VolumeIndicator relativeVolume={2.4} />
              <VolumeIndicator relativeVolume={0.8} />
              <SetupTag>Golden cross</SetupTag>
              <SetupTag>52W breakout</SetupTag>
            </Specimen>

            <Specimen name="MarketStatus · LiveIndicator · DataFreshness">
              <MarketStatus phase="open" isOpen />
              <MarketStatus phase="pre_open" isOpen={false} />
              <MarketStatus phase="closed" isOpen={false} />
              <MarketStatus phase="unknown" isOpen={false} />
              <LiveIndicator live />
              <LiveIndicator live={false} />
              <DataFreshness state="live" at={null} />
              <DataFreshness state="stale" at={null} />
              <DataFreshness state="error" at={null} />
            </Specimen>

            <Specimen name="Sparkline">
              <Sparkline values={[100, 104, 102, 110, 118, 116, 124]} />
              <Sparkline values={[124, 118, 120, 110, 104, 100]} />
              <Sparkline values={[100, 104, 102, 110, 118]} fill />
            </Specimen>

            <Card>
              <CardHeader>
                <CardHeading>
                  <CardTitle>SignalScore</CardTitle>
                  <CardDescription>Never renders without its breakdown</CardDescription>
                </CardHeading>
              </CardHeader>
              <CardContent>
                <SignalScore score={78} direction="strong_bullish">
                  <ul className="space-y-1">
                    <SignalReason label="Price above 20/50/200 EMA" detail="stacked" score={2} />
                    <SignalReason label="RSI in momentum band" detail="62.4" score={1} />
                    <SignalReason label="Relative volume" detail="2.4×" score={1} />
                    <SignalReason label="MACD histogram" detail="flat" score={0} />
                    <SignalReason label="Near 52-week high" detail="−4.2%" score={-1} />
                  </ul>
                </SignalScore>
              </CardContent>
            </Card>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section>
            <SectionHeader>
              <SectionTitle>Cards</SectionTitle>
            </SectionHeader>
            <ContentGrid columns="metrics">
              <MetricCard
                label="NIFTY 50"
                value={<IndexLevel paise={2431855} size="xl" />}
                change={<PriceChange paise={18240} percent={0.76} />}
                aside={<Sparkline values={[100, 102, 101, 106, 110, 108, 114]} />}
              />
              <MetricCard
                label="INDIA VIX"
                hint="Implied 30-day volatility. A rise is risk-off, so the tone is inverted."
                value={<IndexLevel paise={138200} size="xl" />}
                change={<PriceChange paise={4200} percent={3.14} tone="bearish" />}
              />
              <Card>
                <CardHeader>
                  <CardHeading>
                    <CardTitle>DataCard</CardTitle>
                    <CardDescription>Header, toolbar, flush body, footer</CardDescription>
                  </CardHeading>
                  <CardToolbar>
                    <Button variant="ghost" size="sm">
                      View all
                    </Button>
                  </CardToolbar>
                </CardHeader>
                <CardContent>
                  <DefinitionGrid columns={1}>
                    <DefinitionRow label="Open" value={<Price paise={281200} size="sm" />} />
                    <DefinitionRow label="High" value={<Price paise={286400} size="sm" />} />
                    <DefinitionRow label="Low" value={<Price paise={279900} size="sm" />} />
                  </DefinitionGrid>
                </CardContent>
                <CardFooter>
                  <span>Footer slot</span>
                </CardFooter>
              </Card>
              <Card>
                <CardContent className="flex flex-col items-start gap-2">
                  <Text variant="card-title">ActionCard</Text>
                  <Text variant="caption">Create an alert on this level.</Text>
                  <Button size="sm">Create alert</Button>
                </CardContent>
              </Card>
            </ContentGrid>

            <ContentGrid columns="stats">
              <StatTile label="Total volume" value={<Volume shares={182_400_000} />} />
              <StatTile label="Turnover" value={<Turnover paise={984_000_000_000} />} />
              <StatTile
                label="Advancing"
                value={<span className="figure text-bullish-strong">32</span>}
              />
              <StatTile
                label="Declining"
                value={<span className="figure text-bearish-strong">17</span>}
              />
              <StatTile label="Unchanged" value={<span className="figure">1</span>} />
              <StatTile
                label="Near 52W high"
                hint="Within 2% of the 52-week high."
                value={<span className="figure">6</span>}
              />
            </ContentGrid>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section>
            <SectionHeader>
              <SectionTitle>Table</SectionTitle>
              <SectionDescription>
                One implementation — sorting, column visibility, responsive columns, states
              </SectionDescription>
            </SectionHeader>
            <Card>
              <CardContent flush>
                <DataTable
                  data={DEMO_ROWS}
                  columns={columns}
                  getRowId={(row) => row.symbol}
                  initialSort={{ columnId: 'change', direction: 'desc' }}
                  columnVisibility
                  stickyHeader
                  caption="Design system table example"
                />
              </CardContent>
            </Card>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section>
            <SectionHeader>
              <SectionTitle>Charts</SectionTitle>
            </SectionHeader>
            <ChartContainer
              title="Chart chrome"
              subtitle="Header, timeframe control, legend"
              toolbar={
                <ChartToolbar
                  options={['1D', '5D', '1M'] as const}
                  value={timeframe}
                  onChange={setTimeframe}
                />
              }
            >
              <div className="grid h-40 place-items-center rounded-md bg-surface-sunken">
                <Text variant="caption">Chart body — inline SVG, tokens only</Text>
              </div>
            </ChartContainer>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section>
            <SectionHeader>
              <SectionTitle>States</SectionTitle>
              <SectionDescription>
                Loading holds the layout; errors say which situation you are in
              </SectionDescription>
            </SectionHeader>

            <ContentGrid columns="split">
              <Card>
                <CardHeader>
                  <CardHeading>
                    <CardTitle>Empty</CardTitle>
                  </CardHeading>
                </CardHeader>
                <CardContent flush>
                  <EmptyState
                    title="No signals available"
                    description="Every constituent is reading neutral on the current indicator set."
                    action={
                      <Button size="sm" variant="outline">
                        Adjust filters
                      </Button>
                    }
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardHeading>
                    <CardTitle>Error</CardTitle>
                  </CardHeading>
                </CardHeader>
                <CardContent flush>
                  <ErrorState
                    title="Could not load signals"
                    description="The indicator pass failed for this index."
                    detail="ECONNRESET after 3 retries"
                    onRetry={() => undefined}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardHeading>
                    <CardTitle>Connection lost</CardTitle>
                  </CardHeading>
                </CardHeader>
                <CardContent flush>
                  <ConnectionError
                    onRetry={() => undefined}
                    detail="Re-authorise the data source"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardHeading>
                    <CardTitle>Data unavailable</CardTitle>
                  </CardHeading>
                </CardHeader>
                <CardContent flush>
                  <DataUnavailable
                    what="52-week range"
                    reason="Daily history has not been backfilled for this instrument."
                  />
                </CardContent>
              </Card>
            </ContentGrid>

            <Specimen name="Alert">
              <div className="flex w-full flex-col gap-2">
                <Alert>
                  <AlertTitle>Neutral notice</AlertTitle>
                  <AlertDescription>Nothing is wrong; this is context.</AlertDescription>
                </Alert>
                <Alert variant="warning">
                  <AlertTitle>Showing a cached snapshot</AlertTitle>
                  <AlertDescription>
                    The market data source is unreachable. These figures are not current.
                  </AlertDescription>
                </Alert>
                <Alert variant="destructive">
                  <AlertTitle>Market data unavailable</AlertTitle>
                  <AlertDescription>Nothing is shown rather than something wrong.</AlertDescription>
                </Alert>
                <InlineError>Symbol not in the current universe</InlineError>
              </div>
            </Specimen>

            <ContentGrid columns="split">
              <Specimen name="Skeletons">
                <div className="w-full space-y-3">
                  <CardSkeleton className="h-20" />
                  <SkeletonRows rows={3} />
                </div>
              </Specimen>
              <Specimen name="TableSkeleton">
                <TableSkeleton rows={4} columns={4} className="w-full" />
              </Specimen>
            </ContentGrid>
          </Section>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
