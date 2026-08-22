/**
 * Pure signal engine.
 *
 * Every export takes data plus config and returns a result. No database, no
 * `Date.now()`, no network, no `process.env`, no module-level mutable state
 * (CLAUDE.md hard rule 1) — that is what lets the backtester and the live path
 * execute byte-identical code.
 */
export * from './indicators/index.js';
export * from './intraday/index.js';
export * from './signals/index.js';
export type { Bar, Series } from './types.js';
export { at, latest } from './types.js';
