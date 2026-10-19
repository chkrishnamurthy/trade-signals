import { istDayTime } from '@/lib/ipo-format';
import type { IpoDetailDto } from '@/lib/ipo-types';
import { ExternalLink, FactRow, ModuleCard } from '../module-card';

const FEED_LABEL: Readonly<Record<string, string>> = {
  calendar: 'issue calendar',
  past: 'past issues',
  detail: 'issue page',
  recent: 'new listings',
  subscription: 'bids',
  listing: 'listing prices',
  gmp: 'GMP (unofficial)',
  rhp: 'RHP (auto-read)',
};

/** Every source behind this page, with when each was last read (plan §10.2). */
export function IpoSources({ ipo }: { ipo: IpoDetailDto }) {
  const rhpRead = ipo.rhp
    .map((r) => r.extractedAt)
    .sort()
    .at(-1);
  return (
    <ModuleCard
      id="sources"
      title="Where this comes from"
      note={`Page last updated ${istDayTime(ipo.updatedAt)} IST.`}
    >
      {ipo.sources.length === 0 && (
        <p className="border-border border-t px-4 py-3 text-muted-foreground text-xs">
          No source has been read yet.
        </p>
      )}
      {ipo.sources.map((s) => (
        <FactRow
          key={`${s.source}-${s.feed}`}
          label={
            <ExternalLink href={s.url} className="text-sm">
              {s.sourceName} {FEED_LABEL[s.feed] ?? s.feed}
            </ExternalLink>
          }
        >
          <span className="text-muted-foreground text-xs">{istDayTime(s.lastSeenAt)}</span>
        </FactRow>
      ))}
      {rhpRead !== undefined && (
        <FactRow label="RHP (auto-read)">
          <span className="text-muted-foreground text-xs">{istDayTime(rhpRead)}</span>
        </FactRow>
      )}
      {ipo.gmpPanel.available && !ipo.sources.some((s) => s.feed === 'gmp') && (
        <FactRow
          label={
            <ExternalLink href={ipo.gmpPanel.sourceUrl} className="text-sm">
              {ipo.gmpPanel.sourceName} GMP (unofficial)
            </ExternalLink>
          }
        >
          <span className="text-muted-foreground text-xs">
            {istDayTime(ipo.gmpPanel.observedAt)}
          </span>
        </FactRow>
      )}
      {ipo.listing !== null && (
        <FactRow label={`${ipo.listing.exchange} end-of-day prices`}>
          <span className="text-muted-foreground text-xs">listing performance</span>
        </FactRow>
      )}
    </ModuleCard>
  );
}
