/**
 * Reading sections out of a Red Herring Prospectus (docs/planning/ipos-plan.md
 * Phase 11). Pure: page texts in, extracts out.
 *
 * Everything extracted is the COMPANY'S OWN STATEMENT, quoted with the pages it
 * came from — never an opinion of the issue (SEBI Research Analyst rules). The
 * extractors are deliberately conservative: a section whose shape is not
 * clearly recognised is skipped, and the page points at the document instead
 * of guessing.
 *
 * Financial figures stay the document's own TEXT ("33,867.73", unit "₹ lakh"):
 * they are quotations, never money EquityWise computes with, so they never
 * become floats (hard rule 3).
 */

/** Bumped whenever an extractor changes, so stored extracts can be redone. */
export const RHP_EXTRACTOR_VERSION = 1;

export const RHP_SECTIONS = [
  'overview',
  'objects',
  'promoters',
  'financials',
  'strengths',
  'risks',
] as const;
export type RhpSection = (typeof RHP_SECTIONS)[number];

export interface RhpTable {
  /** e.g. `₹ lakh` — as the document states it. */
  readonly unit: string;
  readonly columns: readonly string[];
  readonly rows: readonly { readonly label: string; readonly values: readonly (string | null)[] }[];
}

export interface RhpExtract {
  readonly section: RhpSection;
  readonly title: string;
  readonly text: string | null;
  readonly items: readonly string[];
  readonly table: RhpTable | null;
  /** 1-based PDF page numbers. */
  readonly pageFrom: number;
  readonly pageTo: number;
}

/** One table-of-contents entry: a title and its PRINTED page number. */
export interface TocEntry {
  readonly title: string;
  readonly printedPage: number;
}

interface Line {
  readonly text: string;
  /** 1-based PDF page. */
  readonly page: number;
}

/** The lines of one TOC section, each tagged with its PDF page. */
export interface RhpSpan {
  readonly from: number;
  readonly to: number;
  readonly lines: readonly Line[];
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const fold = (s: string) => clean(s.toUpperCase().replace(/[’']/g, "'").replace(/[–—]/g, '-'));
/** A printed page number on its own line — page furniture, not prose. */
const isFolio = (s: string) => /^\s*\d{1,4}\s*$/.test(s);

/**
 * Table-of-contents entries from the first pages: `TITLE ........ 122`.
 * Titles are upper-case section names; a `SECTION II –` prefix is dropped.
 */
export function readToc(pages: readonly string[]): TocEntry[] {
  const tocPage = pages
    .slice(0, 15)
    .findIndex((p) => /TABLE OF CONTENTS|^\s*CONTENTS\s*$/m.test(p));
  if (tocPage === -1) return [];
  const text = pages.slice(tocPage, tocPage + 3).join('\n');
  const out: TocEntry[] = [];
  for (const m of text.matchAll(/([A-Z][A-Z0-9 ,&'’()/:–-]{3,120}?)\s*\.{2,}\s*(\d{1,4})\b/g)) {
    const title = clean(m[1] ?? '').replace(/^SECTION\s+[IVXL]+\s*[:–-]\s*/, '');
    if (title.length < 4) continue;
    out.push({ title, printedPage: Number(m[2]) });
  }
  return out;
}

/**
 * The PDF page (1-based) where a TOC title starts: its printed page plus the
 * front-matter offset, found by looking for the title near the top of a page.
 */
export function locate(pages: readonly string[], entry: TocEntry): number | null {
  const title = fold(entry.title);
  for (let offset = 0; offset <= 40; offset += 1) {
    const index = entry.printedPage + offset - 1;
    const page = pages[index];
    if (page === undefined) return null;
    if (fold(page.slice(0, 400)).includes(title)) return index + 1;
  }
  return null;
}

/** The pages of the first TOC section whose title matches, up to the next section. */
export function sectionSpan(
  pages: readonly string[],
  toc: readonly TocEntry[],
  title: RegExp,
  maxPages = 40,
): RhpSpan | null {
  const i = toc.findIndex((e) => title.test(e.title));
  const entry = toc[i];
  if (entry === undefined) return null;
  const from = locate(pages, entry);
  if (from === null) return null;
  const next = toc.slice(i + 1).find((e) => e.printedPage > entry.printedPage);
  const nextFrom = next === undefined ? null : locate(pages, next);
  const end = nextFrom === null ? from + maxPages : Math.max(from, nextFrom - 1);
  const to = Math.min(end, from + maxPages, pages.length);
  const lines: Line[] = [];
  for (let page = from; page <= to; page += 1) {
    for (const text of (pages[page - 1] ?? '').split('\n')) lines.push({ text, page });
  }
  return { from, to, lines };
}

// ---------------------------------------------------------------------------
// Section extractors
// ---------------------------------------------------------------------------

/** The opening of the business "Overview", up to `max` characters, cut at a sentence end. */
export function extractOverview(s: RhpSpan, max = 900): RhpExtract | null {
  const at = s.lines.findIndex((l) => /^\s*(Business )?Overview\s*$/i.test(l.text));
  const heading = s.lines[at];
  if (heading === undefined) return null;
  let text = '';
  let pageTo = heading.page;
  for (const line of s.lines.slice(at + 1)) {
    if (isFolio(line.text)) continue;
    text += ` ${line.text}`;
    pageTo = line.page;
    if (text.length > max * 1.5) break;
  }
  const cut = clean(text).slice(0, max);
  const end = cut.lastIndexOf('. ');
  const quote = clean(text).length <= max ? clean(text) : end === -1 ? null : cut.slice(0, end + 1);
  if (quote === null || quote.length < 200) return null;
  return {
    section: 'overview',
    title: 'Overview',
    text: quote,
    items: [],
    table: null,
    pageFrom: heading.page,
    pageTo,
  };
}

/** The promoters' names, from "The Promoters of our Company are:" and a numbered list. */
export function extractPromoters(s: RhpSpan): RhpExtract | null {
  const at = s.lines.findIndex((l) =>
    /Promoters? of (our|the) Company (are|is)\s*:?\s*$/i.test(l.text),
  );
  const lead = s.lines[at];
  if (lead === undefined) return null;
  const items: string[] = [];
  let expected = 1;
  for (const line of s.lines.slice(at + 1, at + 26)) {
    const m = /^\s*(\d{1,2})[.)]\s+(.{3,90})$/.exec(line.text);
    if (m === null || Number(m[1]) !== expected) break;
    const name = clean(m[2] ?? '').replace(/[;,.]$/, '');
    if (/\d{3,}|%/.test(name)) return null;
    items.push(name);
    expected += 1;
  }
  if (items.length === 0) return null;
  return {
    section: 'promoters',
    title: 'Promoters',
    text: null,
    items,
    table: null,
    pageFrom: lead.page,
    pageTo: lead.page,
  };
}

const UNIT = /\((?:Amount\s+)?in\s+(?:₹|Rs\.?|INR)\s*(lakhs?|crores?|millions?)/i;
const unitName = (word: string) => `₹ ${word.toLowerCase().replace(/s$/, '')}`;
const CELL = String.raw`[\d,]+\.\d{1,2}|\[●\]`;
const ITEM_START = /^\s*\(([A-Za-z]|[ivx]{1,4}|\d{1,2})\)\s+(.+)$/;
const TOTAL = /^\s*(Sub-?\s?total|Total)\b/i;
/** A label followed by one or more amount cells: `… Company; 7,500.00 7,500.00`. */
const LABEL_THEN_CELLS = new RegExp(String.raw`^(.*?)\s*(${CELL})(?:\s+(?:${CELL}))*\s*$`);

/**
 * The objects of the issue from the first "utilisation of Net Proceeds"
 * table: lettered items with the amount the document puts against each. Only
 * items carrying an amount (or `[●]`) are taken, so lettered prose elsewhere
 * in the section is never mistaken for an object.
 */
export function extractObjects(s: RhpSpan): RhpExtract | null {
  const lines = s.lines;
  const items: string[] = [];
  let unit: string | null = null;
  let pageFrom: number | null = null;
  let pageTo = s.from;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    const u = UNIT.exec(line.text);
    if (u !== null) unit = unitName(u[1] ?? '');
    if (items.length > 0 && /^\s*Total\b/i.test(line.text)) break;
    if (unit === null) continue;
    const general = /^\s*General Corporate Purposes\*?\s+(.*)$/i.exec(line.text);
    if (general !== null && items.length > 0) {
      const amount = LABEL_THEN_CELLS.exec(general[1] ?? '')?.[2];
      const known = amount !== undefined && amount !== '[●]';
      items.push(
        known ? `General corporate purposes — ${amount} (${unit})` : 'General corporate purposes',
      );
      pageTo = line.page;
      continue;
    }
    const start = ITEM_START.exec(line.text);
    if (start === null) continue;
    // The label may wrap; the amount is at the end of the item's last line.
    let body = start[2] ?? '';
    let amount: string | null = null;
    let last = i;
    for (let j = i; j < Math.min(lines.length, i + 5); j += 1) {
      if (j > i) {
        const next = lines[j]?.text ?? '';
        if (ITEM_START.test(next) || TOTAL.test(next)) break;
        body += ` ${next}`;
      }
      last = j;
      const tail = LABEL_THEN_CELLS.exec(clean(body));
      if (tail !== null) {
        body = tail[1] ?? '';
        amount = tail[2] ?? null;
        break;
      }
    }
    if (amount === null) continue;
    const label = clean(body).replace(/[;:,]$/, '');
    if (label.length < 6 || label.length > 240) continue;
    items.push(amount === '[●]' ? label : `${label} — ${amount} (${unit})`);
    pageFrom ??= line.page;
    pageTo = lines[last]?.page ?? pageTo;
    i = last;
  }
  if (items.length === 0 || pageFrom === null) return null;
  return {
    section: 'objects',
    title: 'Objects of the issue',
    text: null,
    items,
    table: null,
    pageFrom,
    pageTo,
  };
}

/**
 * The first `max` risk-factor headings, numbered 1, 2, 3 … in order. A heading
 * runs from `N.` to the first line ending in a full stop; one that does not
 * end within a few lines is skipped rather than cut mid-sentence.
 */
export function extractRisks(s: RhpSpan, max = 10): RhpExtract | null {
  const lines = s.lines;
  const items: string[] = [];
  let expected = 1;
  let pageFrom: number | null = null;
  let pageTo = s.from;
  for (let i = 0; i < lines.length && items.length < max; i += 1) {
    const m = /^\s*(\d{1,3})\.\s+(\S.*)$/.exec(lines[i]?.text ?? '');
    if (m === null || Number(m[1]) !== expected) continue;
    expected += 1;
    let heading = m[2] ?? '';
    let j = i;
    while (!/[.?]\s*$/.test(heading) && j - i < 15 && j + 1 < lines.length) {
      j += 1;
      const next = lines[j]?.text ?? '';
      if (!isFolio(next)) heading += ` ${next}`;
    }
    const text = clean(heading);
    if (!/[.?]$/.test(text) || text.length < 20 || text.length > 1500) continue;
    items.push(text);
    pageFrom ??= lines[i]?.page ?? s.from;
    pageTo = lines[j]?.page ?? pageTo;
    i = j;
  }
  if (items.length < 3 || pageFrom === null) return null;
  return {
    section: 'risks',
    title: 'Risk factors',
    text: null,
    items,
    table: null,
    pageFrom,
    pageTo,
  };
}

const NUMBERED = /^\s*(\d{1,2})[.)]\s+(.{8,180})$/;
const BULLETED = /^\s*[•●▪➢]\s+(.{8,180})$/;
const STRATEGIES = /^\s*(Our )?(Business |Key )?Strateg(y|ies)\s*$/i;

/**
 * Strengths ONLY when the document lists them right under an "Our
 * (Competitive) Strengths" heading: either numbered 1, 2, 3 … in order
 * (descriptions may sit between), or bulleted on consecutive lines. The list
 * must start within a lead-in line or two of the heading. Un-numbered bold
 * headings cannot be told from prose in plain text, so they are not guessed
 * at — and a bulleted list further down is some other list.
 */
export function extractStrengths(s: RhpSpan, max = 10): RhpExtract | null {
  const lines = s.lines;
  const at = lines.findIndex((l) => /^\s*(Our )?(Key |Competitive )?Strengths\s*$/i.test(l.text));
  const heading = lines[at];
  if (heading === undefined) return null;
  const first = lines
    .slice(at + 1, at + 4)
    .findIndex((l) => NUMBERED.exec(l.text)?.[1] === '1' || BULLETED.test(l.text));
  if (first === -1) return null;
  const start = at + 1 + first;
  const bulleted = BULLETED.test(lines[start]?.text ?? '');
  const items: string[] = [];
  let pageTo = heading.page;
  let expected = 1;
  for (let i = start; i < Math.min(lines.length, start + 400) && items.length < max; i += 1) {
    const line = lines[i];
    if (line === undefined || STRATEGIES.test(line.text)) break;
    const numbered = NUMBERED.exec(line.text);
    const text = bulleted
      ? BULLETED.exec(line.text)?.[1]
      : numbered?.[1] === String(expected)
        ? numbered[2]
        : undefined;
    if (text === undefined) {
      if (!bulleted) continue;
      // A bulleted list ends at its first line that is neither a bullet nor
      // the lower-case continuation of a wrapped one.
      const last = items.at(-1);
      if (last === undefined || !/^\s*[a-z(]/.test(line.text)) break;
      items[items.length - 1] = clean(`${last} ${line.text}`).replace(/[;:]$/, '');
      continue;
    }
    const item = clean(text).replace(/[;:]$/, '');
    // A long full sentence is prose, not a strength's heading.
    if (/\.$/.test(item) && item.length > 140) return null;
    items.push(item);
    expected += 1;
    pageTo = line.page;
  }
  if (items.length < 2) return null;
  return {
    section: 'strengths',
    title: 'Strengths',
    text: null,
    items,
    table: null,
    pageFrom: heading.page,
    pageTo,
  };
}

const FINANCIAL_ROWS: readonly { readonly label: string; readonly match: RegExp }[] = [
  { label: 'Revenue from operations', match: /^(?:[IVX]+\s+)?Revenue from operations\b/i },
  { label: 'Total income', match: /^(?:[IVX]+\s+)?Total income\b/i },
  {
    label: 'Profit after tax',
    match:
      /^(?:[IVX]+\s+)?(?:Restated\s+)?(?:Net\s+)?Profit(?:\s*\/\s*\(loss\))?\s+(?:after tax|for the (?:year|period))\b/i,
  },
  { label: 'Total equity (net worth)', match: /^(?:[IVX]+\s+)?(?:Total equity|Net worth)\b/i },
  { label: 'Total assets', match: /^(?:[IVX]+\s+)?Total assets\b/i },
];

const FIGURE = String.raw`(\(?-?[\d,]+\.\d{1,2}\)?|-)`;
const ROW_VALUES = new RegExp(String.raw`\s+${FIGURE}\s+${FIGURE}(?:\s+${FIGURE})?\s*$`);
const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*';
const PERIOD = new RegExp(
  String.raw`(\d{1,2}(?:st|nd|rd|th)?\s+${MONTH},?\s+\d{4}|${MONTH}\s+\d{1,2},\s+\d{4}|Fiscal\s+\d{4})`,
  'gi',
);

/**
 * Selected rows of the restated statements, verbatim, with the period columns
 * and the unit the document states. Skipped unless at least two rows parse
 * with as many figures as there are period headings above them.
 */
export function extractFinancials(s: RhpSpan): RhpExtract | null {
  const lines = s.lines;
  const unitLine = lines.find((l) => UNIT.test(l.text));
  const unit = unitLine === undefined ? null : UNIT.exec(unitLine.text);
  if (unit === null || unitLine === undefined) return null;
  const rows: { label: string; values: (string | null)[] }[] = [];
  let columns: string[] = [];
  let pageTo = unitLine.page;
  for (const wanted of FINANCIAL_ROWS) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = clean(lines[i]?.text ?? '');
      if (!wanted.match.test(line)) continue;
      const values = ROW_VALUES.exec(line);
      if (values === null) continue;
      const cells = [values[1], values[2], values[3]].filter((v): v is string => v !== undefined);
      const above = lines
        .slice(Math.max(0, i - 40), i)
        .map((l) => l.text)
        .join(' ');
      const periods = [...new Set([...above.matchAll(PERIOD)].map((m) => clean(m[1] ?? '')))].slice(
        -cells.length,
      );
      if (periods.length !== cells.length) continue;
      if (columns.length === 0) columns = periods;
      if (periods.join('|') !== columns.join('|')) continue;
      rows.push({ label: wanted.label, values: cells.map((c) => (c === '-' ? null : c)) });
      pageTo = Math.max(pageTo, lines[i]?.page ?? pageTo);
      break;
    }
  }
  if (rows.length < 2) return null;
  return {
    section: 'financials',
    title: 'Restated financial summary',
    text: null,
    items: [],
    table: { unit: unitName(unit[1] ?? ''), columns, rows },
    pageFrom: unitLine.page,
    pageTo,
  };
}

/**
 * Every section that can be read with confidence, in display order. `pages`
 * are the PDF's page texts, `pages[0]` being PDF page 1.
 */
export function extractRhpSections(pages: readonly string[]): RhpExtract[] {
  const toc = readToc(pages);
  if (toc.length === 0) return [];
  const found = new Map<RhpSection, RhpExtract>();
  const add = (extract: RhpExtract | null) => {
    if (extract !== null) found.set(extract.section, extract);
  };
  const business = sectionSpan(pages, toc, /^OUR BUSINESS$/i, 30);
  if (business !== null) {
    add(extractOverview(business));
    add(extractStrengths(business));
  }
  const objects = sectionSpan(pages, toc, /^OBJECTS? OF THE (OFFER|ISSUE)/i, 15);
  if (objects !== null) add(extractObjects(objects));
  const promoters = sectionSpan(pages, toc, /^OUR PROMOTERS?\b/i, 10);
  if (promoters !== null) add(extractPromoters(promoters));
  const financials =
    sectionSpan(pages, toc, /^SUMMARY OF (RESTATED )?FINANCIAL (STATEMENTS|INFORMATION)/i, 12) ??
    sectionSpan(pages, toc, /^RESTATED FINANCIAL (STATEMENTS|INFORMATION)/i, 12);
  if (financials !== null) add(extractFinancials(financials));
  const risks = sectionSpan(pages, toc, /^RISK FACTORS$/i, 45);
  if (risks !== null) add(extractRisks(risks));
  return RHP_SECTIONS.flatMap((section) => {
    const extract = found.get(section);
    return extract === undefined ? [] : [extract];
  });
}
