import { type ApiClient, ApiError, createApiClient } from '@equitywise/api-client';
import { API_URL, CLIENT_LABEL } from './env';

/**
 * The app's single API client. The token lives in memory (loaded from the
 * Keystore by the auth provider) and is handed to the client through
 * `setAuthToken`; a terminal 401 calls the registered `onSessionEnded`.
 */

let token: string | null = null;
let sessionEndedListener: ((error: ApiError) => void) | null = null;

export function setAuthToken(value: string | null): void {
  token = value;
}

export function onSessionEnded(listener: ((error: ApiError) => void) | null): void {
  sessionEndedListener = listener;
}

export const api: ApiClient = createApiClient({
  baseUrl: API_URL,
  clientLabel: CLIENT_LABEL,
  getToken: () => token,
  onSessionEnded: (error) => sessionEndedListener?.(error),
});

/** A message fit for the screen, from anything a request can throw. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.remedy ? `${error.message} ${error.remedy}` : error.message;
  }
  return 'Something went wrong. Please try again.';
}

export { ApiError };
