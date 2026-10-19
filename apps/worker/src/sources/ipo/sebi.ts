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
    /^(.*?)\s+[-–—]\s+((?:(?:First|Second|Third)\s+)?(?:Addendum(?:-cum-Corrigendum)?|Corrigendum)(?:\s+[IVX]+)?\s+to\s+(?:the\s+)?(?:U?DRHP|Addendum)\.?|UDRHP(?:\s*-\s*(?:[IVX]+|\d+))?|DRHP|RHP|Draft (?:Red Herring|Letter of Offer|Offer Document)[\w\s]*)\s*$/i.exec(
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
    // The first page quotes the link with ", the paged list (POST) with '.
    const link = /<a\s+href=(["'])([^"']+)\1[^>]*?\btitle="([^"]*)"/.exec(body);
    if (date === undefined || link === null) continue;
    const filedDate = parseSebiDate(date);
    const pageUrl = link[2] ?? '';
    const titleHtml = link[3] ?? '';
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

/**
 * Older pages of the same list. SEBI pages it with a form POST to this
 * endpoint (robots.txt allows `/sebiweb/`), and answers only a session that
 * opened the list page first — a GET is "Invalid Method", a cookieless POST a
 * 530. `doDirect` is the zero-based page; 25 filings a page, newest first.
 */
export const SEBI_FILINGS_PAGE_URL =
  'https://www.sebi.gov.in/sebiweb/ajax/home/getnewslistinfo.jsp';

export function sebiPageForm(page: number): Record<string, string> {
  return {
    nextValue: '1',
    next: 'n',
    search: '',
    fromDate: '',
    toDate: '',
    fromYear: '',
    toYear: '',
    deptId: '-1',
    sid: '3',
    ssid: '15',
    smid: '10',
    ssidhidden: '15',
    intmid: '-1',
    sText: 'Filings',
    ssText: 'Public Issues',
    smText: 'Draft Offer Documents filed with SEBI',
    doDirect: String(page),
  };
}

export function createSebiFilingSource(client: PoliteHttpClient): FilingSource {
  let opened = false;
  const fetchFilings = async () => {
    const html = await client.getText(SEBI_FILINGS_URL, { accept: 'text/html' });
    opened = true;
    return parseSebiFilings(html);
  };
  return {
    id: SEBI_SOURCE_ID,
    fetchFilings,
    fetchFilingsPage: async (page: number) => {
      if (page <= 0) return fetchFilings();
      // The session cookie comes from the list page itself.
      if (!opened) await fetchFilings();
      return parseSebiFilings(
        await client.postFormText(SEBI_FILINGS_PAGE_URL, sebiPageForm(page), {
          accept: 'text/html,*/*;q=0.8',
          referer: SEBI_FILINGS_URL,
        }),
      );
    },
  };
}
