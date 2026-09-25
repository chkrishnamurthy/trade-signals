/**
 * Exchange facts about Indian securities that every provider and source needs
 * — which ISINs are equity shares and which BSE groups are the main board.
 * Exchange knowledge, not provider knowledge, so it lives here once.
 */

/**
 * True for an Indian equity-share ISIN: `INE` (a company issuer) and
 * security-type `01` in positions 8–9 (`INE002A01018`). Debt, G-secs and fund
 * units carry other type codes or an `INF`/`IN0` prefix.
 */
export function isEquityIsin(isin: string): boolean {
  return /^INE[A-Z0-9]{4}01[A-Z0-9]{3}$/.test(isin);
}

/**
 * BSE main-board equity groups (verified against both providers' masters and
 * the BSE bhavcopy, 2026-09-25).
 *
 * `A`/`B` rolling settlement; `T`/`XT`/`Z`/`ZP` trade-for-trade or
 * surveillance; `X` smaller listed names; `P` permitted-to-trade. The SME
 * groups (`M`, `MT`, `MS`, `TS`) are left out, as NSE's `SM`/`ST` series are —
 * both boards arrive together (multi-exchange plan, Phase 7).
 */
export const BSE_EQUITY_GROUPS: ReadonlySet<string> = new Set([
  'A',
  'B',
  'T',
  'X',
  'XT',
  'Z',
  'ZP',
  'P',
]);

/**
 * BSE groups traded trade-for-trade or under surveillance: thin, often
 * illiquid, so a signal on one carries a low-liquidity warning (plan D4).
 */
export const BSE_TRADE_FOR_TRADE_GROUPS: ReadonlySet<string> = new Set(['T', 'XT', 'Z', 'ZP']);

/**
 * True when a listing trades trade-for-trade or under surveillance — thin and
 * often illiquid, so any signal on it carries a low-liquidity warning (plan
 * D4). NSE's `BE`/`BZ` series are the NSE counterpart of BSE's T-groups.
 */
export function isTradeForTrade(exchange: string, series: string | null): boolean {
  if (series === null) return false;
  return exchange === 'BSE'
    ? BSE_TRADE_FOR_TRADE_GROUPS.has(series)
    : series === 'BE' || series === 'BZ';
}

/**
 * A BSE row is a main-board equity when its ISIN says equity share AND its
 * group is a main-board group. Group `B` alone is not enough: it also holds
 * MF units.
 */
export function isBseEquityRow(isin: string, group: string): boolean {
  return isEquityIsin(isin) && BSE_EQUITY_GROUPS.has(group);
}
