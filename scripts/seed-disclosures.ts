/**
 * Seeds representative DISCLOSURE fixtures so `/announcements` and `/flows` are
 * fully viewable before (or without) live BSE/NSE ingestion.
 *
 *   pnpm data:seed-disclosures
 *
 * Idempotent: every row upserts on its natural key, so re-running refreshes the
 * sample rather than duplicating it. Reads the repo-root .env for DATABASE_URL —
 * point it at a dev database, never production, if you would rather not seed live.
 */
import {
  createDatabase,
  resolveInstrumentIds,
  upsertAnnouncements,
  upsertDeals,
  upsertFiiDiiFlows,
  upsertShareholding,
} from '@equitywise/db';
import { istDateKey, rupeesToPaise } from '@equitywise/shared';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: new URL('../.env', import.meta.url).pathname });

const SYMBOLS = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN'] as const;

/** The last `count` weekday IST date keys, most recent first. */
function recentWeekdayKeys(count: number, now = new Date()): string[] {
  const keys: string[] = [];
  const cursor = new Date(now);
  while (keys.length < count) {
    const key = istDateKey(cursor);
    const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) keys.push(key);
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return keys;
}

function croreToPaise(crore: number): number {
  return rupeesToPaise(crore * 10_000_000);
}

async function main(): Promise<void> {
  const handle = createDatabase({});
  const db = handle.db;
  try {
    const ids = await resolveInstrumentIds(db, [...SYMBOLS]);
    const idOf = (symbol: string): number | null => ids.get(symbol) ?? null;
    const days = recentWeekdayKeys(6);
    const latest = days[0] ?? istDateKey(new Date());
    const now = new Date();

    // --- Announcements -----------------------------------------------------
    const announcements = [
      {
        symbol: 'RELIANCE',
        name: 'Reliance Industries',
        category: 'Financial Results',
        headline: 'Q2 FY27 results: consolidated net profit up 11% YoY',
        detail: 'Board approved unaudited standalone and consolidated results for the quarter.',
      },
      {
        symbol: 'TCS',
        name: 'Tata Consultancy Services',
        category: 'Dividend',
        headline: 'Second interim dividend of ₹10 per share declared',
        detail: 'Record date set; payment to follow per the filing.',
      },
      {
        symbol: 'INFY',
        name: 'Infosys',
        category: 'Board Meeting',
        headline: 'Board meeting scheduled to consider buyback',
        detail: 'Intimation of board meeting under Regulation 29.',
      },
      {
        symbol: 'HDFCBANK',
        name: 'HDFC Bank',
        category: 'Investor Presentation',
        headline: 'Updated investor presentation uploaded',
        detail: 'Quarterly business update and key ratios.',
      },
      {
        symbol: 'ICICIBANK',
        name: 'ICICI Bank',
        category: 'Financial Results',
        headline: 'Q2 FY27 net interest income rises',
        detail: 'Results and segment information filed with the exchange.',
      },
      {
        symbol: 'SBIN',
        name: 'State Bank of India',
        category: 'Credit Rating',
        headline: 'Rating agency reaffirms long-term rating',
        detail: 'Outlook maintained as stable.',
      },
    ].map((a, index) => ({
      instrumentId: idOf(a.symbol),
      symbol: a.symbol,
      companyName: a.name,
      source: 'seed',
      externalId: `seed-ann-${a.symbol}-${latest}`,
      category: a.category,
      headline: a.headline,
      detail: a.detail,
      attachmentUrl: 'https://www.bseindia.com/',
      announcedAt: new Date(now.getTime() - index * 3_600_000),
    }));
    const annWritten = await upsertAnnouncements(db, announcements);

    // --- FII / DII flows ---------------------------------------------------
    const flows = days.flatMap((tradingDate, index) => {
      const sign = index % 2 === 0 ? 1 : -1;
      const fiiNet = sign * (1200 + index * 150);
      const diiNet = -sign * (800 + index * 90);
      return [
        {
          tradingDate,
          participant: 'fii',
          segment: 'cash',
          buyValue: croreToPaise(9000 + index * 100),
          sellValue: croreToPaise(9000 + index * 100 - fiiNet),
          netValue: croreToPaise(fiiNet),
          source: 'seed',
        },
        {
          tradingDate,
          participant: 'dii',
          segment: 'cash',
          buyValue: croreToPaise(8000 + index * 80),
          sellValue: croreToPaise(8000 + index * 80 - diiNet),
          netValue: croreToPaise(diiNet),
          source: 'seed',
        },
      ];
    });
    const flowWritten = await upsertFiiDiiFlows(db, flows);

    // --- Bulk & block deals ------------------------------------------------
    const deals = [
      {
        symbol: 'SBIN',
        name: 'State Bank of India',
        client: 'Government Pension Fund Global',
        side: 'buy',
        qty: 2_500_000,
        price: 812.5,
        type: 'bulk',
      },
      {
        symbol: 'INFY',
        name: 'Infosys',
        client: 'Morgan Stanley Asia (Singapore)',
        side: 'sell',
        qty: 1_100_000,
        price: 1_540.25,
        type: 'block',
      },
      {
        symbol: 'RELIANCE',
        name: 'Reliance Industries',
        client: 'Life Insurance Corporation of India',
        side: 'buy',
        qty: 750_000,
        price: 2_945.0,
        type: 'block',
      },
      {
        symbol: 'ICICIBANK',
        name: 'ICICI Bank',
        client: 'Nippon India Mutual Fund',
        side: 'buy',
        qty: 1_800_000,
        price: 1_205.75,
        type: 'bulk',
      },
    ].map((d) => ({
      dealType: d.type,
      tradingDate: latest,
      instrumentId: idOf(d.symbol),
      symbol: d.symbol,
      companyName: d.name,
      clientName: d.client,
      side: d.side,
      quantity: d.qty,
      price: rupeesToPaise(d.price),
      exchange: 'NSE',
      source: 'seed',
      dedupeKey: `seed-${d.type}-${d.symbol}-${d.client}-${latest}`,
    }));
    const dealWritten = await upsertDeals(db, deals);

    // --- Shareholding ------------------------------------------------------
    const quarterEnd = `${new Date(`${latest}T12:00:00Z`).getUTCFullYear()}-06-30`;
    const shareholding = SYMBOLS.map((symbol) => idOf(symbol))
      .map((instrumentId, index) =>
        instrumentId === null
          ? null
          : {
              instrumentId,
              asOfDate: quarterEnd,
              promoterPercent: 45 + index,
              fiiPercent: 22 - index * 0.5,
              diiPercent: 18 + index * 0.3,
              publicPercent: 15 - index * 0.4,
              source: 'seed',
            },
      )
      .filter((row): row is NonNullable<typeof row> => row !== null);
    const shareWritten = await upsertShareholding(db, shareholding);

    console.log(
      `Seeded: ${annWritten} announcements, ${flowWritten} flow rows, ${dealWritten} deals, ${shareWritten} shareholding rows.`,
    );
    const unresolved = SYMBOLS.filter((s) => idOf(s) === null);
    if (unresolved.length > 0) {
      console.log(
        `Note: no instrument row for ${unresolved.join(', ')} — those seeded with a null instrument id (announcements/deals still show; shareholding skipped). Run the worker's ingest-daily once to create instruments.`,
      );
    }
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
