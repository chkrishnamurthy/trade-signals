import { formatPaise } from '@equitywise/shared';
import type { NoticeDto } from '@/lib/portfolio-types';
import { longDate } from './portfolio-client';

/**
 * The words for a holding notice, from its facts. This is where paise become
 * rupees (rule 3). Every sentence states a fact about the user's own shares;
 * none tells them what to do.
 */

const money = (p: number) => formatPaise(p, { decimals: 0 });
const signedMoney = (p: number) => `${p < 0 ? '−' : '+'}${money(Math.abs(p))}`;
const pct = (r: number) => `${Math.abs(r * 100).toFixed(1)}%`;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** "in 2 days", "tomorrow", "today". */
function when(days: number | null): string {
  if (days === null) return '';
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/** Smallest whole numbers a : b with a ÷ b close to x (for "1:1 bonus", "1 into 5"). */
function ratioOf(x: number): [number, number] {
  for (let b = 1; b <= 20; b++) {
    const a = Math.round(x * b);
    if (a > 0 && Math.abs(a / b - x) < 1e-6) return [a, b];
  }
  return [Math.round(x * 100), 100];
}

/** A split, bonus or consolidation in words, from the price multiplier. */
export function shareChangeWords(kind: string, ratio: number): string {
  if (ratio <= 0) return kind;
  if (kind === 'bonus') {
    const [a, b] = ratioOf(1 / ratio - 1);
    return `${a}:${b} bonus`;
  }
  if (kind === 'split') {
    const [a, b] = ratioOf(1 / ratio);
    return b === 1 ? `1-into-${a} split` : `${b}-into-${a} split`;
  }
  const [a, b] = ratioOf(ratio);
  return b === 1 ? `${a}-into-1 consolidation` : `${a}-into-${b} consolidation`;
}

const EVENT_NAME: Record<string, string> = {
  dividend: 'dividend ex-date',
  bonus: 'bonus ex-date',
  stock_split: 'split ex-date',
  result: 'results',
  board_meeting: 'board meeting',
  rights_issue: 'rights issue',
  buyback: 'buyback',
};

export function noticeText(n: NoticeDto): { title: string; body: string; symbol: string | null } {
  const d = n.data;
  const symbol = str(d.symbol) || null;
  switch (n.kind) {
    case 'event_soon': {
      const type = str(d.eventType);
      const date = str(d.eventDate);
      const name = EVENT_NAME[type] ?? 'event';
      const title = `${symbol}: ${name} ${when(num(d.daysAway))}, ${longDate(date)}`;
      if (type === 'dividend') {
        const each = num(d.dividendPaise);
        const shares = num(d.shares) ?? 0;
        return {
          symbol,
          title,
          body:
            each === null
              ? 'The amount is not on record yet.'
              : `${formatPaise(each)} a share. On the ${shares.toLocaleString('en-IN')} shares you hold now, about ${money(Math.round(each * shares))}, for shares held before the ex-date.`,
        };
      }
      if (type === 'bonus' || type === 'stock_split')
        return {
          symbol,
          title,
          body: `${str(d.title)}. Your share count will be restated from that day; what you paid stays the same.`,
        };
      return { symbol, title, body: str(d.title) };
    }
    case 'share_change': {
      const words = shareChangeWords(str(d.changeKind), num(d.ratio) ?? 0);
      const shares = num(d.sharesNow) ?? 0;
      return {
        symbol,
        title: `${symbol}: ${words} took effect ${longDate(str(d.exDate))}`,
        body: `Your shares now read ${shares.toLocaleString('en-IN')}. What you paid in total is unchanged.`,
      };
    }
    case 'stock_move': {
      const r = num(d.changeRatio) ?? 0;
      const close = num(d.closePaise);
      const value = num(d.valueChangePaise) ?? 0;
      return {
        symbol,
        title: `${symbol} ${r < 0 ? 'fell' : 'rose'} ${pct(r)} on ${longDate(str(d.session))}`,
        body: `${close === null ? '' : `Closed at ${formatPaise(close)}. `}On the shares you hold, a change of ${signedMoney(value)}.`,
      };
    }
    case 'portfolio_move': {
      const r = num(d.changeRatio) ?? 0;
      const value = num(d.valueChangePaise) ?? 0;
      const stocks = num(d.stocks) ?? 0;
      return {
        symbol: null,
        title: `Your holdings ${r < 0 ? 'fell' : 'rose'} ${pct(r)} on ${longDate(str(d.session))}`,
        body: `A change of ${signedMoney(value)} across the ${stocks} ${stocks === 1 ? 'stock' : 'stocks'} with a close that day.`,
      };
    }
    case 'long_term_soon': {
      const shares = num(d.shares) ?? 0;
      return {
        symbol,
        title: `${symbol}: ${shares.toLocaleString('en-IN')} shares become long term ${when(num(d.daysAway))}, ${longDate(str(d.longTermOn))}`,
        body: `${num(d.bonus) === 1 ? 'Bonus shares' : 'Shares'} acquired ${longDate(str(d.acquiredOn))}. From that day a gain on them counts as long term (held more than 12 months).`,
      };
    }
  }
}
