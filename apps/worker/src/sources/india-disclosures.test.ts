import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createIndiaDisclosureSource,
  croreToPaise,
  parseBseAnnouncements,
  parseDdMonYyyy,
  parseIstTimestamp,
  parseMonDYyyy,
  parseNseBhavdata,
  parseNseDealsCsv,
  parseNseFiiDii,
  parseNseParticipantOi,
  parseNseShareholdingMaster,
  splitCsvLine,
} from './india-disclosures.js';

describe('date & money helpers', () => {
  it('parses a DD-Mon-YYYY date to an ISO key', () => {
    expect(parseDdMonYyyy('11-Sep-2026')).toBe('2026-09-11');
    expect(parseDdMonYyyy('01-Jan-2027')).toBe('2027-01-01');
  });

  it('returns null for an unparseable date', () => {
    expect(parseDdMonYyyy('not a date')).toBeNull();
  });

  it('reads an IST wall-clock timestamp as the correct UTC instant', () => {
    // 16:30 IST is 11:00 UTC.
    expect(parseIstTimestamp('2026-09-11T16:30:00')?.toISOString()).toBe(
      '2026-09-11T11:00:00.000Z',
    );
  });

  it('converts crore to integer paise', () => {
    expect(croreToPaise(1)).toBe(1_000_000_000);
    expect(croreToPaise(-1234)).toBe(-1_234_000_000_000);
  });
});

describe('parseBseAnnouncements', () => {
  it('maps a BSE announcement row into the neutral shape', () => {
    const payload = {
      Table: [
        {
          NEWSID: 'N123',
          SCRIP_CD: 500325,
          SLONGNAME: 'Reliance Industries Ltd',
          HEADLINE: 'Board Meeting Outcome',
          NEWSSUB: 'Approved quarterly results',
          CATEGORYNAME: 'Result',
          NEWS_DT: '2026-09-11T16:30:00',
          ATTACHMENTNAME: 'abc.pdf',
        },
      ],
    };
    const rows = parseBseAnnouncements(payload);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.source).toBe('bse');
    expect(row?.externalId).toBe('N123');
    expect(row?.symbol).toBe('500325');
    expect(row?.category).toBe('Result');
    expect(row?.headline).toBe('Board Meeting Outcome');
    expect(row?.attachmentUrl).toContain('abc.pdf');
    expect(row?.announcedAt.toISOString()).toBe('2026-09-11T11:00:00.000Z');
  });

  it('skips rows with no headline and tolerates a missing Table', () => {
    expect(parseBseAnnouncements({ Table: [{ NEWSID: 'x' }] })).toHaveLength(0);
    expect(parseBseAnnouncements({})).toHaveLength(0);
    expect(parseBseAnnouncements(null)).toHaveLength(0);
  });
});

describe('parseNseFiiDii', () => {
  it('classifies participants and converts crore values to paise', () => {
    const payload = [
      {
        category: 'FII/FPI **',
        date: '11-Sep-2026',
        buyValue: '12,000.50',
        sellValue: '10,000.50',
        netValue: '2,000.00',
      },
      { category: 'DII **', date: '11-Sep-2026', buyValue: 8000, sellValue: 9000, netValue: -1000 },
    ];
    const rows = parseNseFiiDii(payload);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.participant).toBe('fii');
    expect(rows[0]?.netPaise).toBe(croreToPaise(2000));
    expect(rows[0]?.tradingDate).toBe('2026-09-11');
    expect(rows[1]?.participant).toBe('dii');
    expect(rows[1]?.netPaise).toBe(croreToPaise(-1000));
  });

  it('drops rows with an unparseable date and tolerates non-arrays', () => {
    expect(
      parseNseFiiDii([{ category: 'FII', date: 'bad', buyValue: 1, sellValue: 1, netValue: 0 }]),
    ).toHaveLength(0);
    expect(parseNseFiiDii({})).toHaveLength(0);
  });
});

// Real excerpts from the NSE archive files, downloaded 2026-09-17. Expected
// values are hand-computed from the cells, never from the parser.

const BULK_CSV = `Date,Symbol,Security Name,Client Name,Buy/Sell,Quantity Traded,Trade Price / Wght. Avg. Price,Remarks
16-SEP-2026,ABH,ABH Healthcare Limited,NEO APEX SHARE BROKING SERVICES LLP,BUY,31200,47.70,-
16-SEP-2026,ABH,ABH Healthcare Limited,JAGID VANITABEN RAJENDRAPRASAD,SELL,72000,53.59,-
`;

const BLOCK_EMPTY_CSV = `Date,Symbol,Security Name,Client Name,Buy/Sell,Quantity Traded,Trade Price / Wght. Avg. Price
NO RECORDS,,,,,,
`;

const BHAV_CSV = `SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE, LAST_PRICE, CLOSE_PRICE, AVG_PRICE, TTL_TRD_QNTY, TURNOVER_LACS, NO_OF_TRADES, DELIV_QTY, DELIV_PER
20MICRONS, EQ, 16-Sep-2026, 201.29, 201.29, 206.00, 194.05, 204.00, 203.23, 198.23, 142761, 283.00, 3703, 67824, 47.51
RELIANCE, EQ, 16-Sep-2026, 1235.30, 1243.00, 1255.00, 1240.00, 1240.00, 1240.00, 1249.68, 10023997, 125268.26, 186504, 6124329, 61.10
SOMESME, SM, 16-Sep-2026, 10.00, 10.00, 10.00, 10.00, 10.00, 10.00, 10.00, 100, 0.01, 1, 100, 100.00
NODELIV, EQ, 16-Sep-2026, 50.00, 50.00, 50.00, 50.00, 50.00, 50.00, 50.00, 100, 0.05, 1, -, -
`;

const PARTICIPANT_CSV = `""Participant wise Open Interest (no. of contracts) in Equity Derivatives as on Sep 16, 2026"",,,,,,,,,,,,,,
Client Type,Future Index Long,Future Index Short,Future Stock Long,Future Stock Short       ,Option Index Call Long,Option Index Put Long,Option Index Call Short,Option Index Put Short,Option Stock Call Long,Option Stock Put Long,Option Stock Call Short,Option Stock Put Short,Total Long Contracts      ,Total Short Contracts
Client,289936,56634,3445234,228230,3011455,2259579,2713125,2870213,2876957,831918,1453842,1227293,12715079,8549336
DII,40557,28011,360574,4613178,5539,50325,1963,0,4956,45256,401796,24249,507207,5069197
FII,47446,335549,3454477,2918400,598953,1136529,887159,556367,208469,401867,463506,202412,5847742,5363394
Pro,72202,29947,899938,400415,924260,858812,937961,878666,975180,1111455,1746418,936542,4841847,4929948
TOTAL,450141,450141,8160223,8160223,4540207,4305245,4540207,4305245,4065562,2390496,4065562,2390496,23911875,23911875
`;

describe('splitCsvLine', () => {
  it('splits plain and quoted fields', () => {
    expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
    expect(splitCsvLine('"x, y",z')).toEqual(['x, y', 'z']);
    expect(splitCsvLine('"he said ""hi""",1')).toEqual(['he said "hi"', '1']);
  });
});

describe('parseNseDealsCsv', () => {
  it('maps the archive columns, side and price to paise', () => {
    const rows = parseNseDealsCsv(BULK_CSV, 'bulk');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      source: 'nse',
      dealType: 'bulk',
      tradingDate: '2026-09-16',
      symbol: 'ABH',
      companyName: 'ABH Healthcare Limited',
      clientName: 'NEO APEX SHARE BROKING SERVICES LLP',
      side: 'buy',
      quantity: 31_200,
      pricePaise: 4_770,
      exchange: 'NSE',
    });
    expect(rows[1]?.side).toBe('sell');
    expect(rows[1]?.pricePaise).toBe(5_359);
    expect(rows[0]?.externalId).not.toBe(rows[1]?.externalId);
  });

  it('reads an empty day (NO RECORDS) as no deals, not one deal', () => {
    expect(parseNseDealsCsv(BLOCK_EMPTY_CSV, 'block')).toEqual([]);
  });
});

describe('parseNseBhavdata', () => {
  it('maps a padded bhavdata row into delivery stats in paise', () => {
    const rows = parseNseBhavdata(BHAV_CSV);
    const reliance = rows.find((r) => r.symbol === 'RELIANCE');
    expect(reliance).toEqual({
      source: 'nse',
      tradingDate: '2026-09-16',
      symbol: 'RELIANCE',
      tradedQty: 10_023_997,
      deliverableQty: 6_124_329,
      deliveryPercent: 61.1,
      closePaise: 124_000,
      prevClosePaise: 123_530,
      avgPricePaise: 124_968,
      // 125268.26 lakh = ₹12,526,826,000 = 1,252,682,600,000 paise
      turnoverPaise: 1_252_682_600_000,
      trades: 186_504,
    });
  });

  it('keeps only cash-equity series and skips rows without delivery figures', () => {
    const symbols = parseNseBhavdata(BHAV_CSV).map((r) => r.symbol);
    expect(symbols).toEqual(['20MICRONS', 'RELIANCE']);
  });
});

describe('parseNseParticipantOi', () => {
  it('reads the session date from the title row', () => {
    expect(parseMonDYyyy('… as on Sep 16, 2026')).toBe('2026-09-16');
    expect(parseMonDYyyy('nothing here')).toBeNull();
  });

  it('maps every participant × bucket, ignoring TOTAL and padded headers', () => {
    const rows = parseNseParticipantOi(PARTICIPANT_CSV, '2000-01-01');
    // 4 participants × 6 buckets; TOTAL is not a participant.
    expect(rows).toHaveLength(24);
    expect(rows.every((r) => r.tradingDate === '2026-09-16')).toBe(true);
    const fiiIndexFut = rows.find((r) => r.participant === 'fii' && r.bucket === 'index_fut');
    expect(fiiIndexFut).toMatchObject({ longContracts: 47_446, shortContracts: 335_549 });
    // The padded `Future Stock Short       ` header still lands in the right cell.
    const diiStockFut = rows.find((r) => r.participant === 'dii' && r.bucket === 'stock_fut');
    expect(diiStockFut).toMatchObject({ longContracts: 360_574, shortContracts: 4_613_178 });
    const clientStockPe = rows.find((r) => r.participant === 'client' && r.bucket === 'stock_pe');
    expect(clientStockPe).toMatchObject({ longContracts: 831_918, shortContracts: 1_227_293 });
  });

  it('falls back to the caller date when there is no title row', () => {
    const untitled = PARTICIPANT_CSV.split('\n').slice(1).join('\n');
    const rows = parseNseParticipantOi(untitled, '2026-09-15');
    expect(rows).toHaveLength(24);
    expect(rows[0]?.tradingDate).toBe('2026-09-15');
  });
});

describe('parseNseShareholdingMaster', () => {
  it('maps promoter and public percentages per quarter, leaving FII/DII absent', () => {
    const rows = parseNseShareholdingMaster(
      [
        {
          date: '30-JUN-2026',
          name: 'Reliance Industries Limited',
          pr_and_prgrp: '50.48',
          public_val: '49.52',
          symbol: 'RELIANCE',
        },
        { date: '31-MAR-2026', pr_and_prgrp: '50.33', public_val: '49.67' },
        // A duplicate quarter (a revised filing) does not become a second row.
        { date: '31-MAR-2026', pr_and_prgrp: '50.33', public_val: '49.67' },
        { date: 'bad', pr_and_prgrp: '1' },
      ],
      'RELIANCE',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      source: 'nse',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries Limited',
      asOf: '2026-06-30',
      promoterPercent: 50.48,
      fiiPercent: null,
      diiPercent: null,
      publicPercent: 49.52,
    });
    expect(rows[1]?.asOf).toBe('2026-03-31');
  });

  it('tolerates a non-array payload', () => {
    expect(parseNseShareholdingMaster({ nope: true }, 'X')).toEqual([]);
  });
});

describe('announcement source integrity', () => {
  it('never fabricates a filing time for malformed metadata', () => {
    expect(parseIstTimestamp('')).toBeNull();
    expect(parseIstTimestamp('not a date')).toBeNull();
    expect(parseIstTimestamp('2026-02-30T12:00:00')).toBeNull();
    expect(
      parseBseAnnouncements({ Table: [{ NEWSID: 'x', HEADLINE: 'Dividend', NEWS_DT: 'bad' }] }),
    ).toEqual([]);
  });
  it('honours an explicit timezone instead of interpreting it again as IST', () => {
    expect(parseIstTimestamp('2026-09-14T10:00:00Z')?.toISOString()).toBe(
      '2026-09-14T10:00:00.000Z',
    );
    expect(parseIstTimestamp('2026-09-14T15:30:00+05:30')?.toISOString()).toBe(
      '2026-09-14T10:00:00.000Z',
    );
  });
});

describe('announcement transport health', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('distinguishes an empty success from HTTP and malformed-response failures', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const source = createIndiaDisclosureSource();
    const request = { since: new Date('2026-09-14T00:00:00Z') };
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ Table: [] }), { status: 200 }));
    await expect(source.fetchAnnouncements(request)).resolves.toEqual([]);
    fetcher.mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(source.fetchAnnouncements(request)).rejects.toThrow();
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'unavailable' }), { status: 200 }),
    );
    await expect(source.fetchAnnouncements(request)).rejects.toThrow();
    fetcher.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ Table: [{ NEWSID: 'x', HEADLINE: 'Dividend', NEWS_DT: 'invalid' }] }),
        { status: 200 },
      ),
    );
    await expect(source.fetchAnnouncements(request)).rejects.toThrow('invalid or undated');
  });
});

describe('flow feed transports', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests the dated archive files and throws on a missing day', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const source = createIndiaDisclosureSource();
    // 16 Sep 2026 in IST (the instant is 15 Sep 20:00 UTC).
    const date = new Date('2026-09-15T20:00:00Z');

    fetcher.mockResolvedValueOnce(new Response(BHAV_CSV, { status: 200 }));
    const delivery = await source.fetchDeliveryStats({ date });
    expect(delivery.map((d) => d.symbol)).toEqual(['20MICRONS', 'RELIANCE']);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('sec_bhavdata_full_16092026.csv');

    fetcher.mockResolvedValueOnce(new Response(PARTICIPANT_CSV, { status: 200 }));
    const oi = await source.fetchParticipantOi({ date });
    expect(oi).toHaveLength(24);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain('fao_participant_oi_16092026.csv');

    // A holiday has no file; that is a failure to record, not an empty success.
    fetcher.mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(source.fetchDeliveryStats({ date })).rejects.toThrow('404');
  });

  it('fetches bulk and block snapshots together and does not swallow a failure', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const source = createIndiaDisclosureSource();
    fetcher
      .mockResolvedValueOnce(new Response(BULK_CSV, { status: 200 }))
      .mockResolvedValueOnce(new Response(BLOCK_EMPTY_CSV, { status: 200 }));
    const deals = await source.fetchDeals({ date: new Date() });
    expect(deals).toHaveLength(2);
    expect(deals.every((d) => d.dealType === 'bulk')).toBe(true);

    fetcher
      .mockResolvedValueOnce(new Response(BULK_CSV, { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(source.fetchDeals({ date: new Date() })).rejects.toThrow('500');
  });
});
