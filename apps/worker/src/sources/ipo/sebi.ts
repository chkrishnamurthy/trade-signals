import { cleanText, isAllowedHost, parseDdMonYyyy, stripHtml } from '@equitywise/core';
import type { FilingSource, RawSebiFiling } from '@equitywise/market-data';
import type { PoliteHttpClient } from './http.js';

/**
 * SEBI's public-issue filings list (docs/planning/ipos-plan.md Phase 11): the
 * DRHPs, addenda and updated DRHPs companies file before an issue is
 * scheduled. Regulator data, fetched with the honest User-Agent (robots.txt
 * allows it; checked 2026-10-02).
 *
 * The page is server-rendered HTML, 25 filings to a page, newest first. Each
 * row is a date cell and a link whose `title` attribute carries the filing's
 * title and, when SEBI attaches one, a nested link to the draft abridged
 * prospectus. The parser reads that attribute rather than the cell, because
 * the nested anchor makes the cell itself malformed HTML. A page with no
 * readable rows throws: an unreadable page must never look like "no filings".
 */

export const SEBI_SOURCE_ID = 'sebi';
export const SEBI_FILINGS_URL =
  'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=10';
const HOSTS = ['sebi.gov.in'];

/** `Oct 01, 2026` → `2026-10-01`. */
export function parseSebiDate(value: string): string | null {
  const match = /^\s*([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})\s*$/.exec(value);
  if (match === null) return null;
  return parseDdMonYyyy(`${match[2]}-${match[1]}-${match[3]}`);
}

/**
 * `JSW One Platforms Limited  - DRHP` → name and label. Only a recognised
 * document label is split off; anything else stays part of the name.
 */
export function splitFilingTitle(title: string): {
  companyName: string;
  documentLabel: string | null;
} {
  const match =
    /^(.*?)\s+[-–—]\s+((?:(?:First|Second|Third)\s+)?Addendum(?:\s+[IVX]+)?\s+to\s+(?:the\s+)?DRHP|UDRHP(?:-[IVX]+)?|DRHP|RHP|Draft (?:Red Herring|Letter of Offer|Offer Document)[\w\s]*)\s*$/i.exec(
      title,
    );
  if (match === null) return { companyName: title, documentLabel: null };
  return { companyName: (match[1] ?? '').trim(), documentLabel: (match[2] ?? '').trim() };
}

export function parseSebiFilings(html: string): RawSebiFiling[] {
  const out: RawSebiFiling[] = [];
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const body = row[1] ?? '';
    const date = /<td[^>]*>\s*([^<]+?)\s*<\/td>/.exec(body)?.[1];
    const link = /<a\s+href="([^"]+)"[^>]*?\btitle="([^"]*)"/.exec(body);
    if (date === undefined || link === null) continue;
    const filedDate = parseSebiDate(date);
    const pageUrl = link[1] ?? '';
    const titleHtml = link[2] ?? '';
    const externalKey = /_(\d+)\.html$/.exec(pageUrl)?.[1];
    if (filedDate === null || externalKey === undefined || !isAllowedHost(pageUrl, HOSTS)) continue;
    const title = cleanText(stripHtml(titleHtml.split(/<br\s*\/?>/i)[0] ?? '')) ?? '';
    if (title === '') continue;
    const abridged = /href=\s*'([^']+\.pdf)'/i.exec(titleHtml)?.[1] ?? null;
    const { companyName, documentLabel } = splitFilingTitle(title);
    out.push({
      source: SEBI_SOURCE_ID,
      externalKey,
      companyName,
      documentLabel,
      title,
      filedDate,
      pageUrl,
      abridgedUrl: abridged !== null && isAllowedHost(abridged, HOSTS) ? abridged : null,
    });
  }
  if (out.length === 0) throw new Error('SEBI filings page: no filing rows could be read');
  return out;
}

export function createSebiFilingSource(client: PoliteHttpClient): FilingSource {
  return {
    id: SEBI_SOURCE_ID,
    fetchFilings: async () =>
      parseSebiFilings(await client.getText(SEBI_FILINGS_URL, { accept: 'text/html' })),
  };
}
