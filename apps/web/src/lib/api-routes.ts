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
  intradayToday: '/api/intraday/today',
  intradayDay: (date: string): string => `/api/intraday/day/${date}`,
  intradayRules: '/api/intraday/rules',
  // ---------------------------------------------------------------------------
  // Paper trading (/api/paper/*) — simulation only; nothing here places an order.
  // ---------------------------------------------------------------------------
  /** GET /api/paper/overview — settings, session, feed, balances, open paper trades. */
  paperOverview: '/api/paper/overview',
  /** GET/PUT /api/paper/settings — the paper toggle and limits (audited). */
  paperSettings: '/api/paper/settings',
  /** GET/PUT /api/paper/strategies — which strategies the portfolio runs. */
  paperStrategies: '/api/paper/strategies',
  /** POST /api/paper/emergency-stop — pause or resume new entries. */
  paperEmergencyStop: '/api/paper/emergency-stop',
  /** GET /api/paper/open-trades — open paper trades with marks. */
  paperOpenTrades: '/api/paper/open-trades',
  /** GET /api/paper/activity?date= — decisions and events for a session. */
  paperActivity: (date?: string): string =>
    date ? `/api/paper/activity?date=${encodeURIComponent(date)}` : '/api/paper/activity',
  /** GET /api/paper/trades?… — closed paper trades, filtered and paged (format=csv streams). */
  paperTrades: (query?: Record<string, string | number | undefined>): string => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {}))
      if (v !== undefined && v !== '') sp.set(k, String(v));
    const qs = sp.toString();
    return `/api/paper/trades${qs ? `?${qs}` : ''}`;
  },
  /** GET /api/paper/performance?range=7d|30d|90d|all */
  paperPerformance: (range = '30d'): string => `/api/paper/performance?range=${range}`,
  /** GET /api/paper/audit — the user's own audit trail. */
  paperAudit: '/api/paper/audit',
  /** GET /api/admin/paper/health — operator view (admin). */
  adminPaperHealth: '/api/admin/paper/health',
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
  // Profile & Account self-service (/api/profile/*, /api/account/*)
  // ---------------------------------------------------------------------------

  /** PATCH /api/profile — update the signed-in user's profile (name, bio, timezone, preferences). */
  profile: '/api/profile',

  /** POST/DELETE /api/profile/avatar — upload or remove the avatar image. */
  profileAvatar: '/api/profile/avatar',

  /** POST /api/account/password — change password (requires the current password). */
  accountPassword: '/api/account/password',

  /** POST /api/account/email — request an email change (verification sent to the new address). */
  accountEmail: '/api/account/email',

  /** POST /api/account/email/confirm — finish an email change from the signed link. */
  accountEmailConfirm: '/api/account/email/confirm',

  /** GET/DELETE /api/account/sessions — list active sessions, or revoke one / all others. */
  accountSessions: '/api/account/sessions',

  /** POST /api/account/verify — resend the email-verification link. */
  accountVerify: '/api/account/verify',

  /** DELETE /api/account — permanently delete the signed-in user's account. */
  account: '/api/account',

  // ---------------------------------------------------------------------------
  // Market Data & Stock Search (/api/*)
  // ---------------------------------------------------------------------------

  /**
   * GET /api/search?q={query}
   * Search instruments in the symbol master database by ticker or company name.
   */
  search: (query: string): string => `/api/search?q=${encodeURIComponent(query)}`,

  /**
   * POST /api/search/resolve — resolve pasted/imported rows (symbol, ISIN or
   * company name) to instruments, for the import preview.
   */
  searchResolve: '/api/search/resolve',

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

  /** GET /api/watchlists/templates — starter lists (indices and sectors from config). */
  watchlistTemplates: '/api/watchlists/templates',
  /** POST /api/watchlists/from-template — create a watchlist from a starter list, filled. */
  watchlistFromTemplate: '/api/watchlists/from-template',

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
   * GET /api/watchlists/{id}/live — server-sent events of price changes,
   * one frame per second at most. See `use-watchlists.ts`.
   */
  watchlistLive: (id: number | string): string => `/api/watchlists/${id}/live`,

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
