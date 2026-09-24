import { describe, expect, it } from 'vitest';
import { contentMaxWidth, gridColumns, sizeClass } from './layout';

describe('size classes', () => {
  it('classifies common Android widths', () => {
    expect(sizeClass(360)).toBe('compact'); // small phone
    expect(sizeClass(412)).toBe('compact'); // Galaxy S24 Ultra portrait
    expect(sizeClass(673)).toBe('medium'); // Fold inner, portrait
    expect(sizeClass(915)).toBe('expanded'); // S24 Ultra landscape
    expect(sizeClass(1280)).toBe('expanded'); // tablet landscape
  });

  it('caps line length and adds columns as space grows', () => {
    expect(contentMaxWidth('compact')).toBeUndefined();
    expect(gridColumns('compact')).toBe(1);
    expect(gridColumns('expanded')).toBe(3);
  });
});
