import { dateRange, shortDate, statusParts } from '@/lib/ipo-format';
import type { IpoListSortKey } from '@/lib/ipo-list';
import type { IpoListItemDto } from '@/lib/ipo-types';

/** The board table's columns, left to right. */
export const COLUMN_IDS = [
  'company',
  'status',
  'bidding',
  'lists',
  'band',
  'min',
  'size',
  'demand',
  'retail',
  'gmp',
  'day1',
  'now',
] as const;
export type ColumnId = (typeof COLUMN_IDS)[number];

export type ColumnGroupId = 'issue' | 'schedule' | 'price' | 'demand' | 'gmp' | 'listing';

export interface ColumnDef {
  readonly id: ColumnId;
  readonly label: string;
  readonly group: ColumnGroupId;
  readonly numeric: boolean;
  /** False: always shown, absent from the Columns menu. */
  readonly hideable: boolean;
  readonly sort: IpoListSortKey | null;
}

export const COLUMNS: readonly ColumnDef[] = [
  {
    id: 'company',
    label: 'Company',
    group: 'issue',
    numeric: false,
    hideable: false,
    sort: 'company',
  },
  { id: 'status', label: 'Status', group: 'issue', numeric: false, hideable: false, sort: 'stage' },
  {
    id: 'bidding',
    label: 'Bidding',
    group: 'schedule',
    numeric: false,
    hideable: true,
    sort: 'close',
  },
  { id: 'lists', label: 'Lists', group: 'schedule', numeric: false, hideable: true, sort: null },
  { id: 'band', label: 'Band', group: 'price', numeric: true, hideable: true, sort: null },
  {
    id: 'min',
    label: 'Min. investment',
    group: 'price',
    numeric: true,
    hideable: true,
    sort: 'min',
  },
  { id: 'size', label: 'Size', group: 'price', numeric: true, hideable: true, sort: 'size' },
  { id: 'demand', label: 'Total', group: 'demand', numeric: true, hideable: false, sort: 'demand' },
  { id: 'retail', label: 'Retail', group: 'demand', numeric: true, hideable: true, sort: null },
  { id: 'gmp', label: 'GMP', group: 'gmp', numeric: true, hideable: true, sort: 'gmp' },
  { id: 'day1', label: 'Day 1', group: 'listing', numeric: true, hideable: true, sort: 'day1' },
  { id: 'now', label: 'Now', group: 'listing', numeric: true, hideable: true, sort: 'now' },
];

export const GROUP_LABEL: Readonly<Record<ColumnGroupId, string>> = {
  issue: 'Issue',
  schedule: 'Schedule',
  price: 'Price',
  demand: 'Demand',
  gmp: 'Grey market',
  listing: 'Listing',
};

/** How the Columns menu names a column — the bare header is ambiguous out of its group. */
export const MENU_LABEL: Readonly<Record<ColumnId, string>> = {
  company: 'Company',
  status: 'Status',
  bidding: 'Bidding dates',
  lists: 'Listing date',
  band: 'Price band',
  min: 'Min. investment',
  size: 'Issue size',
  demand: 'Total demand',
  retail: 'Retail demand',
  gmp: 'GMP (unofficial)',
  day1: 'Listing-day gain',
  now: 'Gain since issue',
};

/** `8 Oct`, `8 Oct*` for the T+3 expectation, or a dash. */
export function listingDay(row: IpoListItemDto): string {
  const date = row.listingDate ?? row.expectedListingDate;
  if (date === null) return '—';
  return `${shortDate(date).replace(/^[A-Za-z]{3} /, '')}${row.listingDate === null ? '*' : ''}`;
}

/** Two letters for the issuer tile: `Vishal Nirmiti` → `VN`. */
export function initials(companyName: string): string {
  const words = companyName
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w !== '' && !/^(ltd|limited|the|and|of|india)$/i.test(w));
  const letters = words.slice(0, 2).map((w) => w.charAt(0).toUpperCase());
  return letters.join('') || companyName.charAt(0).toUpperCase();
}

// ---------------------------------------------------------------------------
// CSV of the rows on screen
// ---------------------------------------------------------------------------

/** Integer paise as a plain rupee amount, `14960.00` — no float, no grouping. */
export function csvRupees(paise: number | null): string {
  if (paise === null) return '';
  const abs = Math.abs(paise);
  return `${paise < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

const fixed = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? '' : n.toFixed(2);

const CSV_FIELDS: Readonly<
  Record<ColumnId, readonly (readonly [string, (r: IpoListItemDto, today: string) => string])[]>
> = {
  company: [
    ['Company', (r) => r.companyName],
    ['Symbol', (r) => r.nseSymbol ?? r.exchanges.join(' ')],
  ],
  status: [
    [
      'Status',
      (r, today) => {
        const s = statusParts(r, today);
        return s.note === null ? s.chip : `${s.chip} (${s.note})`;
      },
    ],
  ],
  bidding: [
    ['Bidding opens', (r) => r.openDate ?? ''],
    ['Bidding closes', (r) => r.closeDate ?? ''],
  ],
  lists: [
    ['Listing date', (r) => r.listingDate ?? r.expectedListingDate ?? ''],
    [
      'Listing date basis',
      (r) =>
        r.listingDate !== null
          ? 'official'
          : r.expectedListingDate !== null
            ? 'expected (T+3)'
            : '',
    ],
  ],
  band: [
    ['Price band low (₹)', (r) => csvRupees(r.priceBand?.lowPaise ?? null)],
    ['Price band high (₹)', (r) => csvRupees(r.priceBand?.highPaise ?? null)],
  ],
  min: [
    ['Min. investment (₹)', (r) => csvRupees(r.minInvestmentPaise)],
    ['Lot size (shares)', (r) => (r.lotSize === null ? '' : String(r.lotSize))],
    ['Lots in min. application', (r) => String(r.minApplicationLots)],
  ],
  size: [
    ['Issue size (₹)', (r) => csvRupees(r.issueSizePaise)],
    [
      'Issue size basis',
      (r) =>
        r.issueSizeBasis === 'derived_at_upper_band'
          ? 'partly at upper band'
          : (r.issueSizeBasis ?? ''),
    ],
  ],
  demand: [
    ['Subscribed (times)', (r) => fixed(r.subscription?.totalTimes)],
    ['Subscription as of', (r) => r.subscription?.asOf ?? ''],
  ],
  retail: [['Retail subscribed (times)', (r) => fixed(r.subscription?.retailTimes)]],
  gmp: [
    ['GMP (₹, unofficial)', (r) => csvRupees(r.gmp?.latestPaise ?? null)],
    ['GMP % of upper band (unofficial)', (r) => fixed(r.gmp?.percentOfUpperBand)],
    ['GMP source', (r) => (r.gmp === null ? '' : r.gmp.sourceName)],
    ['GMP reported at', (r) => r.gmp?.observedAt ?? ''],
  ],
  day1: [['Listing-day gain (%)', (r) => fixed(r.listing?.listingGainPercent)]],
  now: [
    ['Gain since issue (%)', (r) => fixed(r.listing?.sinceIssuePercent)],
    ['Last close date', (r) => r.listing?.latestCloseDate ?? ''],
  ],
};

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The visible columns of `rows` as CSV text, header first. */
export function ipoListCsv(
  rows: readonly IpoListItemDto[],
  columns: readonly ColumnId[],
  today: string,
): string {
  const fields = columns.flatMap((id) => CSV_FIELDS[id]);
  const lines = [
    fields.map(([header]) => csvCell(header)).join(','),
    ...rows.map((r) => fields.map(([, read]) => csvCell(read(r, today))).join(',')),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

/** The bidding range for the table cell. */
export const biddingText = (r: IpoListItemDto) => dateRange(r.openDate, r.closeDate);
