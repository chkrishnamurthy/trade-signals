import { cva, type VariantProps } from 'class-variance-authority';
import { Skeleton } from '@/components/ui/skeleton';
import * as fmt from '@/lib/format';
import { TONE_GLYPH, type Tone, toneOf, toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';

/**
 * Financial number components.
 *
 * Every number the user reads in this product comes through here. That is what
 * guarantees one decimal policy, one Indian-numbering policy, one em dash for
 * missing data, one loading treatment and tabular figures everywhere — without
 * any page having to remember.
 *
 * Three states, always:
 *   loading   -> a skeleton sized like the value it will become
 *   null      -> an em dash, announced as "not available"
 *   otherwise -> the value
 *
 * `null` means the exchange did not supply the field. It is never rendered as
 * zero, because "no data" and "no change" are different facts and conflating
 * them is how a screen starts lying.
 */

const figureVariants = cva('figure whitespace-nowrap', {
  variants: {
    size: {
      xs: 'text-[0.6875rem]',
      sm: 'text-xs',
      md: 'text-sm',
      lg: 'text-base font-medium',
      xl: 'text-2xl font-semibold tracking-tight',
      display: 'text-3xl font-semibold tracking-tight',
    },
    weight: {
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
    },
    mono: { true: 'font-mono', false: '' },
  },
  defaultVariants: { size: 'md', mono: false },
});

type FigureVariants = VariantProps<typeof figureVariants>;

const SKELETON_WIDTH: Record<NonNullable<FigureVariants['size']> & string, string> = {
  xs: 'h-3 w-10',
  sm: 'h-3.5 w-12',
  md: 'h-4 w-16',
  lg: 'h-5 w-20',
  xl: 'h-7 w-28',
  display: 'h-9 w-36',
};

interface FigureProps extends FigureVariants {
  /** Rendered text, or `null` when the field was not supplied. */
  text: string | null;
  loading?: boolean | undefined;
  className?: string | undefined;
  /** Announced instead of the raw glyphs when the two differ. */
  label?: string | undefined;
  title?: string | undefined;
}

/** The shared shell. Not exported — use one of the named components below. */
function Figure({ text, loading, size, weight, mono, className, label, title }: FigureProps) {
  if (loading === true) {
    return (
      <Skeleton
        className={cn('inline-block align-middle', SKELETON_WIDTH[size ?? 'md'], className)}
        aria-hidden
      />
    );
  }

  if (text === null) {
    return (
      <span
        className={cn(figureVariants({ size, weight, mono }), 'text-subtle-foreground', className)}
      >
        <span aria-hidden>—</span>
        <span className="sr-only">Not available</span>
      </span>
    );
  }

  return (
    <span
      className={cn(figureVariants({ size, weight, mono }), className)}
      title={title}
      {...(label === undefined ? {} : { 'aria-label': label })}
    >
      {text}
    </span>
  );
}

interface ValueProps extends FigureVariants {
  loading?: boolean | undefined;
  className?: string | undefined;
}

/** A traded price in paise. `bare` drops the ₹ for dense columns. */
export function Price({
  paise,
  bare = false,
  ...rest
}: ValueProps & { paise: number | null | undefined; bare?: boolean }) {
  const value = paise ?? null;
  return <Figure text={bare ? fmt.priceCompact(value) : fmt.price(value)} {...rest} />;
}

/** An index level — a number, not a currency, so never carries ₹. */
export function IndexLevel({ paise, ...rest }: ValueProps & { paise: number | null | undefined }) {
  return <Figure text={fmt.indexLevel(paise ?? null)} {...rest} />;
}

/** Arbitrary money in paise, abbreviated to Cr / L when large. */
export function Currency({ paise, ...rest }: ValueProps & { paise: number | null | undefined }) {
  return <Figure text={fmt.largeCurrency(paise ?? null)} {...rest} />;
}

export function Turnover({ paise, ...rest }: ValueProps & { paise: number | null | undefined }) {
  return <Figure text={fmt.turnover(paise ?? null)} {...rest} />;
}

export function MarketCap({ paise, ...rest }: ValueProps & { paise: number | null | undefined }) {
  return <Figure text={fmt.marketCap(paise ?? null)} {...rest} />;
}

/** Traded volume, abbreviated. */
export function Volume({ shares, ...rest }: ValueProps & { shares: number | null | undefined }) {
  return <Figure text={fmt.volume(shares ?? null)} {...rest} />;
}

/** An exact share count — never abbreviated, because it is a countable thing. */
export function Quantity({ units, ...rest }: ValueProps & { units: number | null | undefined }) {
  return <Figure text={fmt.quantity(units ?? null)} {...rest} />;
}

/** A multiple: relative volume, P/E, beta. */
export function Ratio({
  value,
  suffix = '×',
  ...rest
}: ValueProps & { value: number | null | undefined; suffix?: string }) {
  return <Figure text={fmt.ratio(value ?? null, suffix)} {...rest} />;
}

/** A technical reading — RSI, ADX, a stochastic. Monospace by default. */
export function IndicatorValue({
  value,
  decimals = 1,
  mono = true,
  size = 'sm',
  ...rest
}: ValueProps & { value: number | null | undefined; decimals?: number }) {
  return <Figure text={fmt.indicator(value ?? null, decimals)} mono={mono} size={size} {...rest} />;
}

/** Unsigned percentage — participation, percent-of-total. */
export function Percent({
  value,
  decimals = 1,
  ...rest
}: ValueProps & { value: number | null | undefined; decimals?: number }) {
  return <Figure text={fmt.percentPoint(value ?? null, decimals)} {...rest} />;
}

interface SignedProps extends ValueProps {
  /**
   * Overrides the tone derived from the sign. The one legitimate use is a
   * value whose sign inverts in meaning — a rise in INDIA VIX is risk-off.
   */
  tone?: Tone | undefined;
  /** The ▲ / ▼ / → that keeps colour from being the only signal. */
  showGlyph?: boolean | undefined;
}

/** A signed percentage change, toned and glyphed. */
export function PercentChange({
  value,
  tone,
  showGlyph = true,
  className,
  ...rest
}: SignedProps & { value: number | null | undefined }) {
  const resolved = tone ?? toneOf(value);
  const text = fmt.signedPercent(value ?? null);
  return (
    <span
      className={cn('inline-flex items-baseline gap-1', toneText({ tone: resolved }), className)}
    >
      {showGlyph && value !== null && value !== undefined && (
        <span aria-hidden className="text-[0.75em]">
          {TONE_GLYPH[resolved]}
        </span>
      )}
      <Figure text={text} {...rest} />
    </span>
  );
}

/**
 * The canonical "price moved" block: absolute change, then percent in
 * parentheses. Nine hand-rolled copies of this existed before it did.
 */
export function PriceChange({
  paise,
  percent,
  tone,
  showGlyph = true,
  className,
  size,
  ...rest
}: SignedProps & {
  paise: number | null | undefined;
  percent?: number | null | undefined;
}) {
  const resolved = tone ?? toneOf(paise ?? percent);
  const hasPercent = percent !== undefined;
  return (
    <span
      className={cn('inline-flex items-baseline gap-1.5', toneText({ tone: resolved }), className)}
    >
      {showGlyph && (
        <span aria-hidden className="text-[0.75em]">
          {TONE_GLYPH[resolved]}
        </span>
      )}
      <Figure text={fmt.signedPrice(paise ?? null)} size={size} {...rest} />
      {hasPercent && (
        <Figure text={`(${fmt.signedPercent(percent ?? null)})`} size={size} {...rest} />
      )}
    </span>
  );
}

/** Escape hatch for a pre-formatted string that still needs figure treatment. */
export function FigureText(props: FigureProps) {
  return <Figure {...props} />;
}

export { figureVariants };
