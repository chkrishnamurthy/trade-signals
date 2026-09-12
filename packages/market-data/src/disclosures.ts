/**
 * The DISCLOSURE boundary.
 *
 * Exchange/regulator disclosures (corporate announcements, FII/DII flows, bulk
 * & block deals, shareholding) are a different domain from market-data quotes,
 * so they have their own provider-neutral interface rather than being bolted
 * onto `MarketDataProvider`. Business/ingestion code depends on these shapes;
 * the concrete source (BSE, NSE, or a future vendor) is chosen at the edge, and
 * its raw response types never cross this boundary — the same discipline the
 * Fyers adapter follows.
 *
 * Money is INTEGER PAISE here too (CLAUDE.md rule 3); dates are `YYYY-MM-DD` IST
 * keys or UTC `Date` instants, never naive local times.
 */

export type DealType = 'bulk' | 'block';
export type DealSide = 'buy' | 'sell';
export type InstitutionParticipant = 'fii' | 'dii';

export interface RawAnnouncement {
  readonly source: string;
  /** The source's stable id for this filing — the dedup key with `source`. */
  readonly externalId: string;
  /** Exchange symbol as published, e.g. `RELIANCE`. */
  readonly symbol: string;
  readonly companyName: string;
  readonly category: string | null;
  readonly headline: string;
  /** A short factual summary — never the full copyrighted document. */
  readonly detail: string | null;
  readonly attachmentUrl: string | null;
  /** When the exchange disseminated it, UTC. */
  readonly announcedAt: Date;
}

export interface RawFiiDiiFlow {
  readonly source: string;
  /** IST trading date, `YYYY-MM-DD`. */
  readonly tradingDate: string;
  readonly participant: InstitutionParticipant;
  readonly segment: string;
  readonly buyPaise: number;
  readonly sellPaise: number;
  readonly netPaise: number;
}

export interface RawDeal {
  readonly source: string;
  readonly externalId: string;
  readonly dealType: DealType;
  readonly tradingDate: string;
  readonly symbol: string;
  readonly companyName: string;
  readonly clientName: string;
  readonly side: DealSide;
  readonly quantity: number;
  readonly pricePaise: number;
  readonly exchange: string;
}

export interface RawShareholding {
  readonly source: string;
  readonly symbol: string;
  readonly companyName: string;
  /** Quarter-end date, `YYYY-MM-DD`. */
  readonly asOf: string;
  readonly promoterPercent: number | null;
  readonly fiiPercent: number | null;
  readonly diiPercent: number | null;
  readonly publicPercent: number | null;
}

/**
 * A source of exchange/regulator disclosures.
 *
 * Every method returns provider-neutral shapes; a source that cannot supply a
 * feed returns an empty array rather than throwing, so one weak feed never
 * takes a whole ingestion pass down.
 */
export interface DisclosureSource {
  readonly id: string;
  fetchAnnouncements(options: { since: Date }): Promise<readonly RawAnnouncement[]>;
  fetchFiiDii(options: { from: Date; to: Date }): Promise<readonly RawFiiDiiFlow[]>;
  fetchDeals(options: { date: Date }): Promise<readonly RawDeal[]>;
  fetchShareholding(options: { symbols: readonly string[] }): Promise<readonly RawShareholding[]>;
}
