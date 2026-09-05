import { isWeekend, sessionClose, sessionOpen } from '@equitywise/shared';

/**
 * Deciding whether a dead feed means "closed" or "broken".
 *
 * Outside trading hours the live market-data token is deliberately expired and
 * no quotes flow, so a provider call fails exactly as it would in a real outage.
 * The dashboard uses these to tell the two apart: a feed-level failure while the
 * market is closed is the honest "market closed" state, not an alarm.
 */

/**
 * Error codes that mean the live feed is not serving, as opposed to a client
 * network drop (NETWORK) or an unexpected fault (UNKNOWN). Only these are
 * reinterpreted as "market closed" when the market is in fact closed — a genuine
 * fault is never hidden behind a reassuring message.
 */
const FEED_DOWN_CODES = new Set(['AUTH', 'UPSTREAM', 'NOT_CONFIGURED', 'RATE_LIMIT']);

/** True when the error code is a feed-unavailable code (never NETWORK/UNKNOWN). */
export function isFeedDownCode(code: string | undefined): boolean {
  return code !== undefined && FEED_DOWN_CODES.has(code);
}

/**
 * A reassuring message when the market is closed, or null when it is open.
 *
 * Returns null during the weekday session (09:15–15:30 IST) so that a failure
 * WHILE the market is open still surfaces as a real error. Weekday exchange
 * holidays are not covered — there is no client-side trading calendar — so a
 * holiday still surfaces as the connection error, which is acceptable.
 */
export function closedMarketMessage(now: Date): string | null {
  if (isWeekend(now)) {
    return 'Markets are closed for the weekend. Live data resumes when trading reopens on Monday.';
  }
  if (now.getTime() < sessionOpen(now).getTime()) {
    return 'Trading has not opened yet. Live data begins at 9:15 AM IST.';
  }
  if (now.getTime() > sessionClose(now).getTime()) {
    return 'Trading has closed for the day. Live data resumes at 9:15 AM IST on the next trading day.';
  }
  return null;
}
