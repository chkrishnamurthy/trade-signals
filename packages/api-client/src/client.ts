import {
  type AccountMethods,
  type AccountSession,
  type AddSymbolsResult,
  type AdminUser,
  type AppConfig,
  accountMethodsResponseSchema,
  accountSessionsResponseSchema,
  addSymbolsResponseSchema,
  adminUsersResponseSchema,
  apiErrorSchema,
  appConfigSchema,
  createWatchlistResponseSchema,
  type DeviceInfo,
  fromTemplateResponseSchema,
  type GoogleNativeRequest,
  type GoogleNativeResponse,
  googleNativeResponseSchema,
  googleNonceResponseSchema,
  type HistoryResponse,
  historyResponseSchema,
  type IndexStrip,
  type IssuedSession,
  indexStripSchema,
  type MfaVerifyRequest,
  MOBILE_ROUTES,
  maybeSessionResponseSchema,
  mfaVerifyResponseSchema,
  okSchema,
  profileResponseSchema,
  removeSymbolsResponseSchema,
  rotateResponseSchema,
  type SearchHit,
  type SessionUser,
  type SignInRequest,
  type SignInResponse,
  type SignUpRequest,
  type StockDetail,
  searchResponseSchema,
  sessionResponseSchema,
  signInResponseSchema,
  signUpResponseSchema,
  stockDetailResponseSchema,
  type WatchlistDetail,
  type WatchlistSummary,
  type WatchlistTemplate,
  watchlistDetailSchema,
  watchlistsResponseSchema,
  watchlistTemplatesResponseSchema,
} from '@equitywise/api-contracts';
import type { z } from 'zod';
import { ApiError } from './errors.js';

/**
 * The typed API client the mobile app talks through (docs/mobile/01-discovery.md
 * §4, D4). Isomorphic: only `fetch`, `AbortController` and Zod.
 *
 * - Every request carries `X-EquityWise-Client`; authenticated ones add
 *   `Authorization: Bearer <token>` from `getToken()`.
 * - Every response body is parsed with its contract; a drift is an `ApiError`
 *   of kind `parse`, never a silently wrong price.
 * - Idempotent GETs retry once on a network failure. Nothing retries a 4xx, and
 *   a 429 is surfaced with its `retryAfterSeconds` — a retry storm is how a
 *   provider ban starts.
 * - A 401, or a 403 `ACCOUNT_DISABLED`, on an authenticated call is terminal:
 *   `onSessionEnded` fires so the app wipes its token and returns to sign-in.
 */

export interface ApiClientOptions {
  /** API origin, e.g. `https://equitywise.io` (no trailing slash needed). */
  readonly baseUrl: string;
  /** `android/1.0.0 (build 3)` */
  readonly clientLabel: string;
  readonly getToken: () => Promise<string | null> | string | null;
  readonly onSessionEnded?: (error: ApiError) => void;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions<S extends z.ZodTypeAny> {
  readonly schema: S;
  readonly body?: unknown;
  readonly auth?: boolean;
  readonly signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(options: ApiClientOptions) {
  const base = options.baseUrl.replace(/\/+$/u, '');
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function send(
    method: Method,
    path: string,
    body: unknown,
    auth: boolean,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-EquityWise-Client': options.clientLabel,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const token = await options.getToken();
      if (token !== null) headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = (): void => controller.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      return await doFetch(`${base}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } catch (error) {
      if (signal?.aborted === true) throw new ApiError('Request cancelled.', { kind: 'cancelled' });
      if (controller.signal.aborted) {
        throw new ApiError('The server took too long to answer.', { kind: 'timeout' });
      }
      throw new ApiError('Could not reach EquityWise. Check your connection.', {
        kind: 'network',
        cause: error,
      });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  async function request<S extends z.ZodTypeAny>(
    method: Method,
    path: string,
    { schema, body, auth = true, signal }: RequestOptions<S>,
  ): Promise<z.infer<S>> {
    let response: Response;
    try {
      response = await send(method, path, body, auth, signal);
    } catch (error) {
      // One retry for an idempotent read that never reached the server.
      if (method === 'GET' && error instanceof ApiError && error.kind === 'network') {
        response = await send(method, path, body, auth, signal);
      } else {
        throw error;
      }
    }

    let payload: unknown = null;
    const text = await response.text();
    if (text !== '') {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new ApiError('The server sent an unreadable response.', {
          kind: 'parse',
          status: response.status,
        });
      }
    }

    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(payload);
      const error = new ApiError(parsed.success ? parsed.data.error : `HTTP ${response.status}`, {
        kind: 'http',
        status: response.status,
        ...(parsed.success && parsed.data.code !== undefined ? { code: parsed.data.code } : {}),
        ...(parsed.success && parsed.data.remedy !== undefined
          ? { remedy: parsed.data.remedy }
          : {}),
        ...(parsed.success && parsed.data.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: parsed.data.retryAfterSeconds }
          : retryAfter(response)),
      });
      if (auth && error.endsSession) options.onSessionEnded?.(error);
      throw error;
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiError('The app and server disagree about a response. Update the app.', {
        kind: 'parse',
        status: response.status,
        cause: parsed.error,
      });
    }
    return parsed.data;
  }

  const R = MOBILE_ROUTES;

  return {
    request,

    // ── Public ──────────────────────────────────────────────────────────────
    appConfig: (): Promise<AppConfig> =>
      request('GET', R.appConfig, { schema: appConfigSchema, auth: false }),

    // ── Auth ────────────────────────────────────────────────────────────────
    signIn: (body: SignInRequest): Promise<SignInResponse> =>
      request('POST', R.signIn, { schema: signInResponseSchema, body, auth: false }),
    signUp: (body: SignUpRequest) =>
      request('POST', R.signUp, { schema: signUpResponseSchema, body, auth: false }),
    verifyMfa: (body: MfaVerifyRequest): Promise<{ session: IssuedSession }> =>
      request('POST', R.mfaVerify, { schema: mfaVerifyResponseSchema, body, auth: false }),
    googleNonce: () =>
      request('POST', R.googleNonce, { schema: googleNonceResponseSchema, auth: false }),
    /** `auth: true` so a signed-in caller links Google to the current account. */
    googleNative: (body: GoogleNativeRequest, linking = false): Promise<GoogleNativeResponse> =>
      request('POST', R.googleNative, { schema: googleNativeResponseSchema, body, auth: linking }),
    requestPasswordReset: (email: string) =>
      request('POST', R.resetRequest, { schema: okSchema, body: { email }, auth: false }),
    session: async (): Promise<SessionUser | null> =>
      (await request('GET', R.session, { schema: sessionResponseSchema })).user,
    rotateSession: async (): Promise<IssuedSession> =>
      (await request('POST', R.rotate, { schema: rotateResponseSchema })).session,
    signOut: (all = false) =>
      request('POST', all ? `${R.signOut}?all=true` : R.signOut, { schema: okSchema }),

    // ── Account ─────────────────────────────────────────────────────────────
    updateProfile: (patch: { displayName?: string; bio?: string }) =>
      request('PATCH', R.profile, { schema: profileResponseSchema, body: patch }),
    changePassword: (body: { currentPassword?: string; newPassword: string }) =>
      request('POST', R.accountPassword, { schema: maybeSessionResponseSchema, body }),
    sessions: async (): Promise<AccountSession[]> =>
      (await request('GET', R.accountSessions, { schema: accountSessionsResponseSchema })).sessions,
    revokeSession: (sessionId: number) =>
      request('DELETE', R.accountSessions, { schema: okSchema.passthrough(), body: { sessionId } }),
    revokeOtherSessions: () =>
      request('DELETE', R.accountSessions, {
        schema: okSchema.passthrough(),
        body: { scope: 'others' },
      }),
    accountMethods: (): Promise<AccountMethods> =>
      request('GET', R.accountIdentities, { schema: accountMethodsResponseSchema }),
    disconnectIdentity: (id: number, currentPassword?: string) =>
      request('DELETE', R.accountIdentity(id), {
        schema: okSchema,
        body: currentPassword === undefined ? {} : { currentPassword },
      }),
    resendVerification: () => request('POST', R.accountVerify, { schema: okSchema.passthrough() }),
    deleteAccount: (password: string) =>
      request('DELETE', R.account, { schema: okSchema, body: { password, confirm: 'DELETE' } }),

    // ── Market ──────────────────────────────────────────────────────────────
    marketIndices: (signal?: AbortSignal): Promise<IndexStrip> =>
      request('GET', R.marketIndices, { schema: indexStripSchema, ...signalOpt(signal) }),
    search: async (query: string, signal?: AbortSignal): Promise<SearchHit[]> =>
      (
        await request('GET', R.search(query), {
          schema: searchResponseSchema,
          ...signalOpt(signal),
        })
      ).results,
    history: (symbol: string, timeframe: string, signal?: AbortSignal): Promise<HistoryResponse> =>
      request('GET', R.history(symbol, timeframe), {
        schema: historyResponseSchema,
        ...signalOpt(signal),
      }),
    stock: async (symbol: string, signal?: AbortSignal): Promise<StockDetail> =>
      (
        await request('GET', R.stock(symbol), {
          schema: stockDetailResponseSchema,
          ...signalOpt(signal),
        })
      ).stock,

    // ── Watchlists ──────────────────────────────────────────────────────────
    watchlists: async (): Promise<WatchlistSummary[]> =>
      (await request('GET', R.watchlists, { schema: watchlistsResponseSchema })).watchlists,
    watchlist: (id: number, signal?: AbortSignal): Promise<WatchlistDetail> =>
      request('GET', R.watchlist(id), { schema: watchlistDetailSchema, ...signalOpt(signal) }),
    createWatchlist: async (name: string): Promise<WatchlistSummary> =>
      (
        await request('POST', R.watchlists, {
          schema: createWatchlistResponseSchema,
          body: { name },
        })
      ).watchlist,
    updateWatchlist: (id: number, patch: { name?: string; isDefault?: true }) =>
      request('PATCH', R.watchlist(id), { schema: okLike, body: patch }),
    deleteWatchlist: (id: number) => request('DELETE', R.watchlist(id), { schema: okLike }),
    addSymbols: (id: number, symbols: readonly string[]): Promise<AddSymbolsResult> =>
      request('POST', R.watchlistItems(id), {
        schema: addSymbolsResponseSchema,
        body: { symbols },
      }),
    removeSymbols: (id: number, instrumentIds: readonly number[]) =>
      request('DELETE', R.watchlistItems(id), {
        schema: removeSymbolsResponseSchema,
        body: { instrumentIds },
      }),
    templates: async (): Promise<WatchlistTemplate[]> =>
      (await request('GET', R.watchlistTemplates, { schema: watchlistTemplatesResponseSchema }))
        .templates,
    createFromTemplate: (templateId: string) =>
      request('POST', R.watchlistFromTemplate, {
        schema: fromTemplateResponseSchema,
        body: { templateId },
      }),

    // ── Admin (the server answers 403 to non-admins) ────────────────────────
    adminUsers: async (): Promise<AdminUser[]> =>
      (await request('GET', R.adminUsers, { schema: adminUsersResponseSchema })).users,
    adminSetStatus: (id: number, status: 'active' | 'disabled') =>
      request('PATCH', R.adminUser(id), { schema: okSchema, body: { status } }),
  };
}

/** Watchlist mutations answer `{ updated: true }` / `{ deleted: true }`; accept any object. */
const okLike = apiErrorSchema.partial().passthrough();

function signalOpt(signal: AbortSignal | undefined): { signal?: AbortSignal } {
  return signal === undefined ? {} : { signal };
}

function retryAfter(response: Response): { retryAfterSeconds?: number } {
  const value = Number(response.headers.get('retry-after'));
  return Number.isFinite(value) && value > 0 ? { retryAfterSeconds: value } : {};
}

export type { DeviceInfo };
