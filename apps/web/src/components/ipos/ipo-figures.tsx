import { formatPaise } from '@equitywise/shared';
import { largeCurrency } from '@/lib/format';
import type { IpoListItemDto, PriceBandDto } from '@/lib/ipo-types';

/** `₹220`, `₹14.50`: a share price, whole rupees without their decimals. */
export function sharePrice(paise: number | null): string {
  if (paise === null) return '—';
  return formatPaise(paise, { decimals: paise % 100 === 0 ? 0 : 2 });
}

/** `₹208 – ₹220`, a fixed price, or a dash. Whole rupees drop their decimals. */
export function bandText(band: PriceBandDto | null): string {
  if (band === null) return '—';
  return band.lowPaise === band.highPaise
    ? sharePrice(band.highPaise)
    : `${sharePrice(band.lowPaise)} – ${sharePrice(band.highPaise)}`;
}

export function PriceBandText({ band }: { band: PriceBandDto | null }) {
  return <span className="figure">{bandText(band)}</span>;
}

/** Issue size in crore, marked when part of it was priced at the upper band. */
export function IssueSizeText({
  item,
}: {
  item: Pick<IpoListItemDto, 'issueSizePaise' | 'issueSizeBasis'>;
}) {
  if (item.issueSizePaise === null) return <span className="text-subtle-foreground">—</span>;
  return (
    <span className="figure">
      {largeCurrency(item.issueSizePaise)}
      {item.issueSizeBasis === 'derived_at_upper_band' && (
        <span
          className="text-2xs text-subtle-foreground"
          title="Part of this is priced at the upper end of the band"
        >
          †
        </span>
      )}
    </span>
  );
}
