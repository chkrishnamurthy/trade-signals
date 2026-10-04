import type { IpoBoard } from '@equitywise/shared';
import type { Route } from 'next';

/**
 * The IPO section's addresses (plan §10.0). One section, one header: the
 * Overview at `/ipos`, the master table at `/ipos/all`, and each issue at
 * `/ipos/[slug]`. The board scope is one `?board=` value every IPO page reads
 * and every tab carries, so moving between tabs never resets it. "All boards"
 * is the default and stays out of the URL.
 */

export const IPO_SCOPES = ['all', 'mainboard', 'sme'] as const;
/** Which boards a page covers: both, or one. */
export type IpoScope = (typeof IPO_SCOPES)[number];

export const BOARD_SCOPE_LABEL: Readonly<Record<IpoScope, string>> = {
  all: 'All boards',
  mainboard: 'Mainboard',
  sme: 'SME',
};

/** The scope inside a sentence: "every issue", "every mainboard issue". */
export const BOARD_SCOPE_WORD: Readonly<Record<IpoScope, string>> = {
  all: '',
  mainboard: 'mainboard',
  sme: 'SME',
};

/** The board a query should filter by; `undefined` reads both. */
export const boardOf = (scope: IpoScope): IpoBoard | undefined =>
  scope === 'all' ? undefined : scope;

/** Path segments under `/ipos` that are sections, never an issue's slug. */
export const IPO_SECTION_SEGMENTS = ['all', 'calendar', 'listings', 'gmp', 'pipeline'] as const;

export type IpoSectionId = 'overview' | 'all' | 'calendar' | 'listings' | 'gmp' | 'pipeline';

export interface IpoSection {
  readonly id: IpoSectionId;
  readonly label: string;
  readonly path: string;
}

/**
 * The section tabs, in order: the front page, the master table, then each
 * view of the section — when (calendar), how they listed, the unofficial grey
 * market, and what is on its way (pipeline).
 */
export const IPO_SECTIONS: readonly IpoSection[] = [
  { id: 'overview', label: 'Overview', path: '/ipos' },
  { id: 'all', label: 'All IPOs', path: '/ipos/all' },
  { id: 'calendar', label: 'Calendar', path: '/ipos/calendar' },
  { id: 'listings', label: 'Listings', path: '/ipos/listings' },
  { id: 'gmp', label: 'Grey market', path: '/ipos/gmp' },
  { id: 'pipeline', label: 'Pipeline', path: '/ipos/pipeline' },
];

/** Where each section lives, with the board scope. */
export const sectionHref = (
  id: IpoSectionId,
  scope: IpoScope,
  params: Readonly<Record<string, string | null | undefined>> = {},
) => ipoHref(IPO_SECTIONS.find((s) => s.id === id)?.path ?? '/ipos', scope, params);

/** `path` with `params`, adding `board` unless the scope is the default. */
export function ipoHref(
  path: string,
  scope: IpoScope,
  params: Readonly<Record<string, string | null | undefined>> = {},
): Route {
  const qs = new URLSearchParams();
  if (scope !== 'all') qs.set('board', scope);
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined) qs.set(k, v);
  const s = qs.toString();
  return `${path}${s === '' ? '' : `?${s}`}` as Route;
}

export const overviewHref = (scope: IpoScope) => ipoHref('/ipos', scope);

/** The master table, optionally filtered: `tableHref('sme', { status: 'open' })`. */
export const tableHref = (
  scope: IpoScope,
  params: Readonly<Record<string, string | null | undefined>> = {},
) => ipoHref('/ipos/all', scope, params);

export const issueHref = (slug: string) => `/ipos/${slug}` as Route;
