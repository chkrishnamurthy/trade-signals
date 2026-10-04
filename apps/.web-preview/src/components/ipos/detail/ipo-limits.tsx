import { quantity } from '@/lib/format';
import type { InvestmentLimitDto, IpoDetailDto } from '@/lib/ipo-types';
import { sharePrice } from '../ipo-figures';
import { ModuleCard, ModuleTable } from '../module-card';

const LABEL: Readonly<Record<InvestmentLimitDto['kind'], string>> = {
  individual: 'Individual investors',
  retail_min: 'Retail — minimum',
  retail_max: 'Retail — maximum',
  snii_min: 'Small NII (₹2–10 lakh) — minimum',
  snii_max: 'Small NII (₹2–10 lakh) — maximum',
  bnii_min: 'Big NII (above ₹10 lakh) — minimum',
};

const labelOf = (r: InvestmentLimitDto) =>
  r.kind === 'individual'
    ? `${LABEL.individual} — ${r.lots} lot${r.lots === 1 ? '' : 's'}`
    : LABEL[r.kind];

/**
 * What an application costs in each investor category: whole lots at the
 * upper end of the band, against SEBI's retail and small-NII limits. Arithmetic
 * on the published lot and price — not advice on what to bid.
 */
export function IpoLimits({ ipo }: { ipo: IpoDetailDto }) {
  if (ipo.investmentLimits.length === 0) return null;
  const upper = ipo.priceBand?.highPaise ?? ipo.issuePricePaise;
  const cap = ipo.retailMaxPaise;
  const price = upper === null ? '' : ` (${sharePrice(upper)})`;
  const lots = ipo.minApplicationLots;
  const note =
    ipo.board === 'sme'
      ? `Calculated: lot size × the upper end of the band${price}. On SME an individual applies for exactly ${lots} lot${lots === 1 ? '' : 's'}; a larger bid is non-institutional — above ₹2 lakh up to ₹10 lakh is small NII, above ₹10 lakh big NII.`
      : `Calculated: lot size × the upper end of the band${price}, against the ${cap === null ? '₹2 lakh' : sharePrice(cap)} retail limit and SEBI's ₹10 lakh small-NII limit.`;
  return (
    <ModuleCard id="limits" title="Investment limits by category" note={note}>
      <ModuleTable
        caption="Investment limits by category"
        rows={ipo.investmentLimits}
        rowKey={(r) => r.kind}
        empty=""
        columns={[
          { id: 'cat', header: 'Category', cell: (r) => labelOf(r) },
          {
            id: 'lots',
            header: 'Lots',
            width: 'w-16',
            align: 'end',
            cell: (r) => <span className="figure">{quantity(r.lots)}</span>,
          },
          {
            id: 'shares',
            header: 'Shares',
            width: 'w-24',
            align: 'end',
            cell: (r) => <span className="figure">{quantity(r.shares)}</span>,
          },
          {
            id: 'amount',
            header: 'Amount',
            width: 'w-32',
            align: 'end',
            cell: (r) => <span className="figure font-medium">{sharePrice(r.amountPaise)}</span>,
          },
        ]}
        mobile={(r) => ({
          title: labelOf(r),
          sub: `${quantity(r.lots)} lot${r.lots === 1 ? '' : 's'} · ${quantity(r.shares)} shares`,
          value: <span className="figure font-medium">{sharePrice(r.amountPaise)}</span>,
        })}
      />
    </ModuleCard>
  );
}
