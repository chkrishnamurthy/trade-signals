import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { simulatedToday } from './fixture';
import { exitSummary, notTakenLabel, statusOf, timesRisked } from './format';
import { OverviewCard } from './overview-card';
import { RulesCard } from './rules-card';
import { SignalsCard } from './signals-card';
import { TradesCard } from './trades-card';

const today = simulatedToday();
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('intraday cards', () => {
  it('signals card shows every level numerically and the statuses in plain words', () => {
    const out = html(createElement(SignalsCard, { data: today }));
    for (const text of [
      'RELIANCE',
      '₹2,956.40',
      '₹2,934.50',
      '₹2,978.30',
      '₹3,000.20',
      'filled ₹2,957.10',
      'Target 2 hit',
    ])
      expect(out).toContain(text);
    expect(out).toContain('Stopped out');
    expect(out).toContain('Not taken — daily limit');
    expect(out).toContain('entry slipped');
    expect(out).toContain('>New<');
    expect(out).toContain('No signal today for 2 stocks');
    // Vocabulary: technical levels, never order words; never the letter R as a unit.
    expect(out).not.toMatch(/\b(order|quantity|position|entry price)\b/i);
    expect(out).not.toMatch(/\d(\.\d)?R\b/);
  });
  it('trades card lists only taken, filled trades with simulated results', () => {
    const out = html(createElement(TradesCard, { data: today }));
    expect(out).toContain('RELIANCE');
    expect(out).toContain('HDFCBANK');
    expect(out).not.toContain('>INFY<');
    expect(out).toContain('+₹5,065.31'); // the worked example, net of charges
    expect(out).toContain('Target 1 → Target 2');
    expect(out).toContain('the amount risked');
  });
  it('empty and forming states are distinct', () => {
    expect(
      html(
        createElement(SignalsCard, {
          data: simulatedToday({ phase: 'OPENING_RANGE', signals: [] }),
        }),
      ),
    ).toContain('Opening range forming');
    expect(
      html(createElement(SignalsCard, { data: simulatedToday({ phase: 'SESSION', signals: [] }) })),
    ).toContain('No signals yet today');
    expect(html(createElement(TradesCard, { data: simulatedToday({ signals: [] }) }))).toContain(
      'No paper trades yet today',
    );
  });
  it('overview and rules render from the versioned config', () => {
    const overview = html(
      createElement(OverviewCard, { rules: today.rules, capital: '₹5,00,000' }),
    );
    expect(overview).toContain('Opening Range Breakout');
    expect(overview).toContain('1% of ₹5,00,000');
    const rules = html(createElement(RulesCard, { rules: today.rules }));
    expect(rules).toContain('0.25%–1% wide');
    expect(rules).toContain('At most 5 trades a day and 3 open at once');
    expect(rules).toContain('closed at 15:15');
  });
  it('format helpers', () => {
    const [t2, stopped, , slipped, notTaken] = today.signals;
    expect(statusOf(t2!)).toEqual({ label: 'Target 2 hit', tone: 'bullish' });
    expect(statusOf(stopped!)).toEqual({ label: 'Stopped out', tone: 'bearish' });
    expect(statusOf(slipped!)).toEqual({ label: 'Skipped', tone: 'secondary' });
    expect(notTakenLabel(notTaken!)).toBe('Not taken — daily limit');
    expect(notTakenLabel(t2!)).toBeNull();
    expect(exitSummary(t2!)).toBe('Target 1 → Target 2');
    expect(timesRisked(506_531, 381_940)).toBe('1.3× the amount risked');
    expect(timesRisked(null, 381_940)).toBeNull();
  });
});
