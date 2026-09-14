import { describe, expect, it } from 'vitest';
import { aggregateTo5m, istMinuteOfDay, parseIstTimestamp, toPaise } from './fno-normalize.js';
import type { NativeRawBar } from './native-feather.js';

const bar = (
  date: string,
  o: number,
  h: number,
  l: number,
  c: number,
  v: number,
  oi: number,
): NativeRawBar => ({
  date,
  open: o,
  high: h,
  low: l,
  close: c,
  volume: v,
  oi,
});

describe('toPaise', () => {
  it('converts rupee floats to integer paise', () => {
    expect(toPaise(77823.5)).toBe(7782350);
    expect(toPaise(77798.95)).toBe(7779895);
    expect(toPaise(150)).toBe(15000);
  });
});

describe('istMinuteOfDay', () => {
  it('returns IST minute-of-day for a UTC instant', () => {
    // 09:15 IST == 03:45 UTC.
    const ms = Date.parse('2026-08-28T09:15:00+05:30');
    expect(istMinuteOfDay(ms)).toBe(9 * 60 + 15);
    expect(istMinuteOfDay(Date.parse('2026-08-28T15:20:00+05:30'))).toBe(920);
  });
});

describe('aggregateTo5m', () => {
  it('buckets 1-minute bars into 5-minute candles aligned to 09:15 IST', () => {
    const raw: NativeRawBar[] = [
      bar('2026-08-28 09:15:00+05:30', 100, 105, 99, 102, 10, 500),
      bar('2026-08-28 09:16:00+05:30', 102, 108, 101, 107, 5, 520),
      bar('2026-08-28 09:19:00+05:30', 107, 107, 104, 106, 8, 530),
      bar('2026-08-28 09:20:00+05:30', 106, 110, 106, 109, 3, 540),
    ];
    const candles = aggregateTo5m(raw);
    expect(candles).toHaveLength(2);

    const first = candles[0];
    expect(first?.timestamp).toBe(parseIstTimestamp('2026-08-28 09:15:00+05:30'));
    expect(first?.open).toBe(toPaise(100)); // first open
    expect(first?.high).toBe(toPaise(108)); // max high
    expect(first?.low).toBe(toPaise(99)); // min low
    expect(first?.close).toBe(toPaise(106)); // last close in bucket
    expect(first?.volume).toBe(23); // 10 + 5 + 8
    expect(first?.oi).toBe(530); // last OI in bucket

    const second = candles[1];
    expect(second?.open).toBe(toPaise(106));
    expect(second?.close).toBe(toPaise(109));
    expect(second?.volume).toBe(3);
  });

  it('sorts unordered input before bucketing', () => {
    const raw: NativeRawBar[] = [
      bar('2026-08-28 09:20:00+05:30', 106, 110, 106, 109, 3, 540),
      bar('2026-08-28 09:15:00+05:30', 100, 105, 99, 102, 10, 500),
    ];
    const candles = aggregateTo5m(raw);
    expect(candles[0]?.open).toBe(toPaise(100));
    expect(candles[1]?.open).toBe(toPaise(106));
  });
});
