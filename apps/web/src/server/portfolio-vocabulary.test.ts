import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CLAUDE.md "Portfolio vocabulary": the portfolio page says "Added shares",
 * "Removed shares", "Number of shares", "Holding", "Average cost" and never the
 * words of an order ticket or of advice. This scans the words a person can read
 * (string literals and JSX text) in the portfolio code for the banned ones.
 *
 * A floor, not a proof: it cannot judge a sentence, only catch the vocabulary.
 */

const SRC = resolve(import.meta.dirname, '..');
const CORE = resolve(SRC, '../../../packages/core/src/portfolio');
const FILES = [
  join(SRC, 'components/portfolio/portfolio-view.tsx'),
  join(SRC, 'server/portfolio.ts'),
  join(SRC, 'app/portfolio/page.tsx'),
  join(CORE, 'files.ts'),
];

const BANNED =
  /\b(buy|buys|bought|sell|sells|sold|position|positions|quantity|orders?|execute|rebalance|recommended|recommend|underweight|overweight)\b/i;

/** Negations that say what the page is NOT are the one honest use of these words. */
const ALLOWED_PHRASES = [/places an order/i];

function readableText(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) out.push(m[2] ?? '');
  for (const m of source.matchAll(/>([^<>{}\n]*[A-Za-z][^<>{}\n]*)</g)) out.push(m[1] ?? '');
  return out.filter((t) => /\s/.test(t.trim()) || BANNED.test(t));
}

describe('portfolio vocabulary', () => {
  for (const file of FILES) {
    it(`uses no order or advice words in ${file.split('/').slice(-2).join('/')}`, () => {
      const offenders = readableText(readFileSync(file, 'utf8')).filter(
        (text) => BANNED.test(text) && !ALLOWED_PHRASES.some((ok) => ok.test(text)),
      );
      expect(offenders).toEqual([]);
    });
  }
});
