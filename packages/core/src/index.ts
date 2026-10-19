/**
 * Pure signal engine.
 *
 * Every export takes data plus config and returns a result. No database, no
 * `Date.now()`, no network, no `process.env`, no module-level mutable state
 * (CLAUDE.md hard rule 1) — that is what lets the backtester and the live path
 * execute byte-identical code.
 */

export * from './alerts/index.js';
export * from './announcement-interpretation.js';
export * from './exchange-calendar.js';
export * from './flows.js';
export * from './indicators/index.js';
export * from './ipos/index.js';
export * from './portfolio/index.js';
export * from './screener/index.js';
export type { Bar, Series } from './types.js';
export { at, latest } from './types.js';
