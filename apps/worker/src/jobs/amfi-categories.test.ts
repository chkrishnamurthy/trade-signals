import { describe, expect, it } from 'vitest';
import { amfiCategoriesEnabled } from './amfi-categories';

describe('AMFI category source gate', () => {
  it('is fail-closed unless an operator explicitly enables it', () => {
    expect(amfiCategoriesEnabled({})).toBe(false);
    expect(amfiCategoriesEnabled({ AMFI_CATEGORIES_ENABLED: 'false' })).toBe(false);
    expect(amfiCategoriesEnabled({ AMFI_CATEGORIES_ENABLED: ' true ' })).toBe(true);
  });
});
