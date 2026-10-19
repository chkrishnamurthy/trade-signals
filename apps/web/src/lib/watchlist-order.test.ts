import { describe, expect, it } from 'vitest';
import { dropMember, moveMember } from './watchlist-order';

const ids = [10, 20, 30, 40];

describe('moveMember', () => {
  it('moves one place up or down', () => {
    expect(moveMember(ids, 30, 'up')).toEqual([10, 30, 20, 40]);
    expect(moveMember(ids, 20, 'down')).toEqual([10, 30, 20, 40]);
  });
  it('moves to either end', () => {
    expect(moveMember(ids, 30, 'top')).toEqual([30, 10, 20, 40]);
    expect(moveMember(ids, 20, 'bottom')).toEqual([10, 30, 40, 20]);
  });
  it('returns the same array when the move changes nothing', () => {
    expect(moveMember(ids, 10, 'up')).toBe(ids);
    expect(moveMember(ids, 40, 'down')).toBe(ids);
    expect(moveMember(ids, 10, 'top')).toBe(ids);
    expect(moveMember(ids, 999, 'up')).toBe(ids);
  });
  it('does not mutate its input', () => {
    moveMember(ids, 30, 'top');
    expect(ids).toEqual([10, 20, 30, 40]);
  });
});

describe('dropMember', () => {
  it('takes the target row’s place, shifting the rows between', () => {
    expect(dropMember(ids, 10, 30)).toEqual([20, 30, 10, 40]);
    expect(dropMember(ids, 40, 20)).toEqual([10, 40, 20, 30]);
  });
  it('ignores a drop on itself or on an unknown row', () => {
    expect(dropMember(ids, 20, 20)).toBe(ids);
    expect(dropMember(ids, 20, 999)).toBe(ids);
    expect(dropMember(ids, 999, 20)).toBe(ids);
  });
  it('keeps every member exactly once', () => {
    expect([...dropMember(ids, 10, 40)].sort()).toEqual([10, 20, 30, 40]);
  });
});
