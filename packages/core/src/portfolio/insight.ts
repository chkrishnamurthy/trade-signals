/**
 * Phase 2 "insight" figures for a portfolio: where the money sits, how
 * concentrated it is, and what moved the gain. Pure; every figure is a plain
 * description of the user's own numbers, never a judgement.
 */

export interface WeightedItem {
  readonly key: string;
  /** Integer paise. */
  readonly valuePaise: number;
}

export interface WeightedGroup {
  readonly key: string;
  readonly valuePaise: number;
  /** 0..1 share of the total. */
  readonly weight: number;
  readonly count: number;
}

/** Adds items up by key and returns groups largest first. Zero or negative values are ignored. */
export function groupByWeight(items: readonly WeightedItem[]): WeightedGroup[] {
  const sums = new Map<string, { value: number; count: number }>();
  let total = 0;
  for (const item of items) {
    if (item.valuePaise <= 0) continue;
    const cur = sums.get(item.key) ?? { value: 0, count: 0 };
    cur.value += item.valuePaise;
    cur.count += 1;
    sums.set(item.key, cur);
    total += item.valuePaise;
  }
  return [...sums]
    .map(([key, s]) => ({
      key,
      valuePaise: s.value,
      weight: total > 0 ? s.value / total : 0,
      count: s.count,
    }))
    .sort((a, b) => b.valuePaise - a.valuePaise || a.key.localeCompare(b.key));
}

export interface Concentration {
  readonly holdings: number;
  /** Share of value in the largest one, three and five holdings. */
  readonly largest: number;
  readonly top3: number;
  readonly top5: number;
  /**
   * 1 ÷ Σ weight²: how many equal-sized holdings would spread the money the same
   * way. Equal to `holdings` when every holding is the same size.
   */
  readonly effectiveHoldings: number;
}

export function concentration(valuesPaise: readonly number[]): Concentration | null {
  const values = valuesPaise.filter((v) => v > 0).sort((a, b) => b - a);
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const share = (n: number) => values.slice(0, n).reduce((a, b) => a + b, 0) / total;
  const sumSquares = values.reduce((a, v) => a + (v / total) ** 2, 0);
  return {
    holdings: values.length,
    largest: share(1),
    top3: share(3),
    top5: share(5),
    effectiveHoldings: 1 / sumSquares,
  };
}

export type CompanySize = 'large' | 'mid' | 'small' | 'micro' | 'other';

/**
 * Company size from NSE index membership, as a stand-in for the SEBI/AMFI list:
 * NIFTY 100 is large, Midcap 150 mid, Smallcap 250 small, Microcap 250 micro.
 * Anything outside those indices is "other". Labelled "by index" wherever shown.
 */
export function companySizeByIndex(indexKeys: readonly string[]): CompanySize {
  const keys = new Set(indexKeys.map((k) => k.toLowerCase()));
  if (keys.has('nifty100') || keys.has('nifty50') || keys.has('niftynext50')) return 'large';
  if (keys.has('niftymidcap150')) return 'mid';
  if (keys.has('niftysmallcap250')) return 'small';
  if (keys.has('niftymicrocap250')) return 'micro';
  return 'other';
}

export interface Contribution {
  readonly key: string;
  readonly gainPaise: number;
}

/**
 * The holdings that added or took away the most rupees, biggest gains first and
 * biggest losses last. At most `limit` rows; when there are more holdings, the
 * largest gains and the largest losses are both kept.
 */
export function topContributors(items: readonly Contribution[], limit = 6): Contribution[] {
  const sorted = [...items]
    .filter((i) => i.gainPaise !== 0)
    .sort((a, b) => b.gainPaise - a.gainPaise);
  if (sorted.length <= limit) return sorted;
  const losers = sorted.filter((i) => i.gainPaise < 0);
  const lossSlots = Math.min(losers.length, Math.floor(limit / 2));
  const gainSlots = limit - lossSlots;
  return [...sorted.slice(0, gainSlots), ...sorted.slice(sorted.length - lossSlots)];
}

export interface TreemapInput {
  readonly key: string;
  readonly value: number;
}

export interface TreemapCell<T extends TreemapInput> {
  readonly item: T;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Lays items into a width × height box, each area proportional to its value.
 * Splits the sorted list into two halves of similar total and cuts along the
 * longer side, recursively: simple, deterministic and readable at small sizes.
 */
export function treemapLayout<T extends TreemapInput>(
  items: readonly T[],
  width: number,
  height: number,
): TreemapCell<T>[] {
  const cells: TreemapCell<T>[] = [];
  const positive = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const lay = (list: T[], x: number, y: number, w: number, h: number): void => {
    if (list.length === 0) return;
    if (list.length === 1) {
      const [only] = list;
      if (only !== undefined) cells.push({ item: only, x, y, w, h });
      return;
    }
    const total = list.reduce((a, b) => a + b.value, 0);
    let acc = 0;
    let k = 0;
    while (k < list.length - 1 && acc + (list[k]?.value ?? 0) <= total / 2) {
      acc += list[k]?.value ?? 0;
      k++;
    }
    if (k === 0) {
      acc = list[0]?.value ?? 0;
      k = 1;
    }
    const f = acc / total;
    if (w >= h) {
      lay(list.slice(0, k), x, y, w * f, h);
      lay(list.slice(k), x + w * f, y, w * (1 - f), h);
    } else {
      lay(list.slice(0, k), x, y, w, h * f);
      lay(list.slice(k), x, y + h * f, w, h * (1 - f));
    }
  };
  lay(positive, 0, 0, width, height);
  return cells;
}

/**
 * Keeps the largest `max - 1` groups and folds the rest into one `otherKey`
 * group, so a chart never needs more colours than it can tell apart. Returns the
 * groups unchanged when there are `max` or fewer.
 */
export function capGroups(
  groups: readonly WeightedGroup[],
  max: number,
  otherKey: string,
): { groups: WeightedGroup[]; folded: ReadonlySet<string> } {
  if (groups.length <= max) return { groups: [...groups], folded: new Set() };
  const kept = groups.slice(0, Math.max(max - 1, 1));
  const rest = groups.slice(kept.length);
  const other = rest.reduce(
    (acc, g) => ({
      key: otherKey,
      valuePaise: acc.valuePaise + g.valuePaise,
      weight: acc.weight + g.weight,
      count: acc.count + g.count,
    }),
    { key: otherKey, valuePaise: 0, weight: 0, count: 0 },
  );
  return { groups: [...kept, other], folded: new Set(rest.map((g) => g.key)) };
}
