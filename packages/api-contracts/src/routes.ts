/**
 * The API paths the mobile app calls — one place, so a path can never drift
 * between a screen and the client. Relative to the API base URL.
 */
export const MOBILE_ROUTES = {
  appConfig: '/api/app-config',

  signIn: '/api/auth/sign-in',
  signUp: '/api/auth/sign-up',
  signOut: '/api/auth/sign-out',
  session: '/api/auth/session',
  rotate: '/api/auth/session/rotate',
  mfaVerify: '/api/auth/mfa/verify',
  googleNonce: '/api/auth/google/native/nonce',
  googleNative: '/api/auth/google/native',
  resetRequest: '/api/auth/reset/request',

  profile: '/api/profile',
  accountPassword: '/api/account/password',
  accountSessions: '/api/account/sessions',
  accountIdentities: '/api/account/identities',
  accountIdentity: (id: number): string => `/api/account/identities/${id}`,
  accountVerify: '/api/account/verify',
  account: '/api/account',

  marketIndices: '/api/market/indices',
  search: (q: string): string => `/api/search?q=${encodeURIComponent(q)}`,
  history: (symbol: string, tf: string): string =>
    `/api/history/${encodeURIComponent(symbol)}?tf=${encodeURIComponent(tf)}`,
  stock: (symbol: string): string => `/api/stocks/${encodeURIComponent(symbol)}`,

  watchlists: '/api/watchlists',
  watchlist: (id: number): string => `/api/watchlists/${id}`,
  watchlistItems: (id: number): string => `/api/watchlists/${id}/items`,
  watchlistTemplates: '/api/watchlists/templates',
  watchlistFromTemplate: '/api/watchlists/from-template',

  adminUsers: '/api/admin/users',
  adminUser: (id: number): string => `/api/admin/users/${id}`,
} as const;
