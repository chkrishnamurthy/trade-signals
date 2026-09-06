/**
 * Centralized API route definitions for EquityWise.
 *
 * All API paths, query parameter builders, and dynamic segment resolvers
 * are defined here to prevent hardcoded URL strings across components,
 * hooks, and route handlers.
 */

export interface HistoryQueryOptions {
  /** Candle timeframe resolution: '1m' | '5m' | '15m' | '30m' | '1h' | '1D' | '1W' */
  readonly tf?: string;
  /** Number of days of candle history to return */
  readonly days?: number;
}

export interface SignOutOptions {
  /** If true, revokes all active sessions across all devices for this user */
  readonly all?: boolean;
}

export const API_ROUTES = {
  // ---------------------------------------------------------------------------
  // Authentication & Session (/api/auth/*)
  // ---------------------------------------------------------------------------

  /**
   * POST /api/auth/sign-up
   * Register a new user account with email, password, and display name,
   * creating an active authenticated session.
   */
  authSignUp: '/api/auth/sign-up',

  /**
   * POST /api/auth/sign-in
   * Authenticate user credentials (email + password) and establish a session cookie.
   */
  authSignIn: '/api/auth/sign-in',

  /**
   * POST /api/auth/sign-out
   * Invalidate current user session. Pass `{ all: true }` to revoke all active sessions.
   */
  authSignOut: (options?: SignOutOptions): string =>
    options?.all ? '/api/auth/sign-out?all=true' : '/api/auth/sign-out',

  /**
   * GET /api/auth/session
   * Retrieve current authenticated user profile, role ('user' | 'admin'), and verification status.
   * Returns null if unauthenticated.
   */
  authSession: '/api/auth/session',

  /**
   * POST /api/auth/verify
   * Consume an email-verification token to confirm user's email address.
   */
  authVerify: '/api/auth/verify',

  /**
   * POST /api/auth/reset/request
   * Initiate password reset flow by sending a reset link to the given email address.
   */
  authResetRequest: '/api/auth/reset/request',

  /**
   * POST /api/auth/reset/confirm
   * Set a new password using a valid password reset token.
   */
  authResetConfirm: '/api/auth/reset/confirm',

  // ---------------------------------------------------------------------------
  // Market Data & Stock Search (/api/*)
  // ---------------------------------------------------------------------------

  /**
   * GET /api/search?q={query}
   * Search instruments in the symbol master database by ticker or company name.
   */
  search: (query: string): string => `/api/search?q=${encodeURIComponent(query)}`,

  /**
   * GET /api/history/{symbol}?tf={tf}&days={days}
   * Retrieve historical closed candle data for charting.
   */
  history: (symbol: string, options?: HistoryQueryOptions): string => {
    const sp = new URLSearchParams();
    if (options?.tf) sp.set('tf', options.tf);
    if (options?.days !== undefined) sp.set('days', String(options.days));
    const qs = sp.toString();
    return `/api/history/${encodeURIComponent(symbol)}${qs ? `?${qs}` : ''}`;
  },

  // ---------------------------------------------------------------------------
  // Watchlists (/api/watchlists/*)
  // ---------------------------------------------------------------------------

  /**
   * GET /api/watchlists — List all watchlists owned by current user.
   * POST /api/watchlists — Create a new watchlist.
   */
  watchlists: '/api/watchlists',

  /**
   * GET /api/watchlists/default
   * Retrieve or initialize the user's default watchlist.
   */
  watchlistDefault: '/api/watchlists/default',

  /**
   * POST /api/watchlists/reorder
   * Update the sidebar display order of watchlists.
   */
  watchlistReorder: '/api/watchlists/reorder',

  /**
   * GET /api/watchlists/{id} — Fetch watchlist detail with quotes and indicators.
   * PATCH /api/watchlists/{id} — Update watchlist metadata (e.g. name, description).
   * DELETE /api/watchlists/{id} — Delete watchlist.
   */
  watchlist: (id: number | string): string => `/api/watchlists/${id}`,

  /**
   * POST /api/watchlists/{id}/items — Add symbols to watchlist.
   * PUT /api/watchlists/{id}/items — Reorder symbols inside watchlist.
   * DELETE /api/watchlists/{id}/items — Remove symbol by instrument id.
   */
  watchlistItems: (id: number | string): string => `/api/watchlists/${id}/items`,

  /**
   * PUT /api/watchlists/{id}/layout
   * Persist user's column configuration, widths, and visible fields for the watchlist table.
   */
  watchlistLayout: (id: number | string): string => `/api/watchlists/${id}/layout`,

  /**
   * POST /api/watchlists/{id}/views
   * Save current filter, sort, and layout settings as a named view.
   */
  watchlistViews: (id: number | string): string => `/api/watchlists/${id}/views`,

  /**
   * DELETE /api/watchlists/{id}/views/{viewId}
   * Delete a saved custom view from a watchlist.
   */
  watchlistView: (id: number | string, viewId: number | string): string =>
    `/api/watchlists/${id}/views/${viewId}`,

  // ---------------------------------------------------------------------------
  // Admin Management (/api/admin/*)
  // ---------------------------------------------------------------------------

  /**
   * GET /api/admin/users
   * List all user accounts in the system (Admin only).
   */
  adminUsers: '/api/admin/users',

  /**
   * PATCH /api/admin/users/{id}
   * Update user status ('active' | 'disabled') or role ('user' | 'admin') (Admin only).
   */
  adminUser: (id: number | string): string => `/api/admin/users/${id}`,

  // ---------------------------------------------------------------------------
  // Market Data Provider Handshake (Fyers OAuth)
  // ---------------------------------------------------------------------------

  /**
   * GET /api/fyers/connect
   * Initiates provider OAuth authorization flow by setting CSRF cookie and redirecting to Fyers.
   */
  fyersConnect: '/api/fyers/connect',

  /**
   * GET /callback
   * OAuth landing target: receives provider auth_code, validates state, and persists credentials.
   */
  callback: '/callback',
} as const;
