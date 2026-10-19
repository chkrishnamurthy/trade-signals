import { describe, expect, it } from 'vitest';
import { itemsToLines } from './pdf-reader';

const at = (str: string, x: number, y: number) => ({ str, transform: [1, 0, 0, 1, x, y] });

describe('itemsToLines', () => {
  it('joins pieces at the same height left to right, top of the page first', () => {
    expect(
      itemsToLines([
        at('100.000', 300, 500),
        at('INE002A01018', 20, 501),
        at('RELIANCE', 120, 500.5),
        at('Holding statement', 20, 700),
        at('   ', 50, 600),
      ]),
    ).toEqual(['Holding statement', 'INE002A01018 RELIANCE 100.000']);
  });
});
