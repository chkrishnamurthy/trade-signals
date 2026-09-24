import { BREAKPOINTS } from '@equitywise/design-tokens';

/**
 * Window-size classes (docs/mobile/01-discovery.md S18). Pure, unit-tested.
 *   compact  < 600dp — phones in portrait
 *   medium   600–839 — large phones in landscape, foldables open, small tablets
 *   expanded ≥ 840   — tablets, landscape foldables
 */
export type SizeClass = 'compact' | 'medium' | 'expanded';

export function sizeClass(widthDp: number): SizeClass {
  if (widthDp >= BREAKPOINTS.expanded) return 'expanded';
  if (widthDp >= BREAKPOINTS.medium) return 'medium';
  return 'compact';
}

/** Readable line length: content never stretches edge to edge on a tablet. */
export function contentMaxWidth(size: SizeClass): number | undefined {
  return size === 'compact' ? undefined : size === 'medium' ? 720 : 1080;
}

/** Card grid columns for lists of cards (watchlists, indices). */
export function gridColumns(size: SizeClass): number {
  return size === 'compact' ? 1 : size === 'medium' ? 2 : 3;
}

/** Horizontal page gutter in dp. */
export function gutter(size: SizeClass): number {
  return size === 'compact' ? 16 : 24;
}
