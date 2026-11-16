import { describe, expect, it } from 'vitest';
import { nextStack } from './in-app-history';

describe('nextStack', () => {
  it('starts with the page the app opened on', () => {
    expect(nextStack([], '/stocks/TCS')).toEqual(['/stocks/TCS']);
  });

  it('pushes a step forward', () => {
    expect(nextStack(['/screener'], '/stocks/TCS')).toEqual(['/screener', '/stocks/TCS']);
  });

  it('pops when arriving at the page just below the top (a step back)', () => {
    expect(nextStack(['/screener', '/stocks/TCS'], '/screener')).toEqual(['/screener']);
  });

  it('ignores a repeat of the current page (a re-render, a query change)', () => {
    const stack = ['/screener'];
    expect(nextStack(stack, '/screener')).toBe(stack);
  });

  it('leaves a cold open with nothing to go back to after stepping back to it', () => {
    // Opened on a stock from a shortcut, went to another, came back.
    const opened = nextStack([], '/stocks/TCS');
    const forward = nextStack(opened, '/stocks/INFY');
    const back = nextStack(forward, '/stocks/TCS');
    expect(back).toEqual(['/stocks/TCS']);
  });

  it('keeps at most 50 entries', () => {
    let stack: readonly string[] = [];
    for (let i = 0; i < 80; i += 1) stack = nextStack(stack, `/stocks/S${i}`);
    expect(stack).toHaveLength(50);
    expect(stack.at(-1)).toBe('/stocks/S79');
  });
});
