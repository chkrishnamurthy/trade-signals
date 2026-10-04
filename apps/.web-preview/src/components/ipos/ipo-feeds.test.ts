import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { IpoFeedStatusDto } from '@/lib/ipo-types';
import { IpoFeeds } from './ipo-feeds';

const feed = (id: string, label: string, status: IpoFeedStatusDto['status']): IpoFeedStatusDto => ({
  id,
  label,
  status,
  lastSuccessAt: '2026-10-03T05:50:00.000Z',
  lastAttemptAt: '2026-10-03T12:50:00.000Z',
  error: status === 'failed' ? 'Error: 1 of 1 RHP(s) could not be read' : null,
});

const render = (feeds: IpoFeedStatusDto[]) =>
  renderToStaticMarkup(createElement(IpoFeeds, { feeds, showAsOf: false }));

describe('IpoFeeds', () => {
  it('does not warn readers about a failed RHP or DRHP-filings run', () => {
    const html = render([
      feed('ipo-nse-calendar', 'NSE issue calendar', 'fresh'),
      feed('ipo-nse-rhp', 'NSE RHP extracts', 'failed'),
      feed('ipo-sebi-filings', 'SEBI DRHP filings', 'stale'),
    ]);
    expect(html).toBe('');
  });

  it('still warns when a feed behind the shown figures fails', () => {
    const html = render([
      feed('ipo-nse-calendar', 'NSE issue calendar', 'failed'),
      feed('ipo-nse-rhp', 'NSE RHP extracts', 'failed'),
    ]);
    expect(html).toContain('Some IPO data may be out of date');
    expect(html).toContain('NSE issue calendar');
    expect(html).not.toContain('RHP extracts');
  });
});
