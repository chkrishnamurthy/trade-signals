/**
 * Pure signal engine.
 *
 * Empty until indicators and strategies land. The constraint that makes this
 * package worth its own boundary (CLAUDE.md hard rule 1): every export takes
 * data plus config and returns a result. No database, no `Date.now()`, no
 * network, no `process.env`, no module-level mutable state. That is what lets
 * the backtester and the live path execute byte-identical code.
 */
export {};
