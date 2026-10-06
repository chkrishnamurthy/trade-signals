/**
 * Small display preferences the portfolio page keeps in a cookie, so the server
 * can render them in the first paint (a note neither pops in nor out as the page
 * loads). They hold no portfolio data: only that a note was dismissed.
 */

/** The one-time "average cost uses oldest purchases first (FIFO)" note was dismissed. */
export const FIFO_NOTE_COOKIE = 'ew_pf_fifo_note';
