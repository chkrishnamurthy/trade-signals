import type { TickTransport } from './stream.js';

/**
 * The production `TickTransport`: the official `fyers-api-v3` data socket.
 *
 * The socket protocol is binary and unpublished (see `stream.ts`), so the SDK
 * is the only sane way to speak it. What this file owns is the impedance match
 * between the SDK's shape and the transport contract `streamTicks` reconnects
 * over:
 *
 *   - The SDK socket is a process-wide SINGLETON (`getInstance` always returns
 *     the first instance built), so "build a fresh transport" on reconnect
 *     really means "re-arm the same object". Its `on()` stores ONE handler per
 *     event (`onticks`, `socketonclose`, …) rather than appending, which is
 *     what makes re-arming safe: the previous connection's handlers are
 *     replaced, never stacked.
 *   - Because it is a singleton the credential is baked in at first use. The
 *     token rotates daily, so a caller that wants the new token must build a
 *     transport with a different `credential` — this module then asks the SDK
 *     for a new instance. There is no supported way to do that, so it is done
 *     by dropping the module's cached instance and letting `getInstance`
 *     construct another; the old socket is closed first.
 *   - Lite mode only. Every consumer of this stream wants price + volume; the
 *     full-mode payload is ~20 fields per tick for nothing.
 *
 * Loaded lazily, and by the CALLER (`loadFyersSdk`): the SDK is obfuscated
 * CommonJS with its own `ws`/`protobufjs`, and importing it at module scope
 * would drag it into every consumer of `@equitywise/fyers` — the worker's
 * TOTP login, the tests — that never opens a socket. It is a real `import()`
 * rather than a `createRequire` so that a bundler (Next transpiles this
 * package) sees it and externalises it; a require hidden behind
 * `createRequire` is resolved from wherever the BUNDLE ends up, which in a
 * pnpm workspace is nowhere near this package's `node_modules`.
 */

/** The subset of the SDK socket this transport touches. Typed here; the SDK ships no types. */
interface SdkDataSocket {
  connect(): void;
  close(): void;
  subscribe(symbols: string[]): void;
  unsubscribe(symbols: string[]): void;
  mode(mode: string): void;
  isConnected(): boolean;
  on(event: string, handler: (payload?: unknown) => void): void;
  readonly LiteMode: string;
}

/** The loaded SDK, as `loadFyersSdk` hands it over. Opaque to callers. */
export interface FyersSdk {
  readonly fyersDataSocket: {
    getInstance(credential: string, logPath: string, enableLog: boolean): SdkDataSocket;
  };
}

/**
 * Loads the SDK once. Rejects when it is not installed, which a caller treats
 * as "no streaming" rather than as an error.
 */
export async function loadFyersSdk(): Promise<FyersSdk> {
  const sdk = (await import('fyers-api-v3')) as unknown as
    | FyersSdk
    | { readonly default: FyersSdk };
  return 'fyersDataSocket' in sdk ? sdk : sdk.default;
}

export interface SdkTransportOptions {
  readonly sdk: FyersSdk;
  /** `APP_ID:ACCESS_TOKEN`, the same string the REST `Authorization` header carries. */
  readonly credential: string;
  /** Where the SDK writes its own log. Defaults to the OS temp dir. */
  readonly logPath?: string;
}

let cached: { credential: string; socket: SdkDataSocket } | null = null;

/**
 * The SDK socket for this credential, reusing the singleton while the
 * credential is unchanged and rebuilding it when it rotates.
 */
function socketFor(options: SdkTransportOptions): SdkDataSocket {
  if (cached !== null && cached.credential === options.credential) return cached.socket;

  if (cached !== null) {
    try {
      cached.socket.close();
    } catch {
      // Already dead; the new instance replaces it either way.
    }
  }
  const socket = options.sdk.fyersDataSocket.getInstance(
    options.credential,
    options.logPath ?? tmpDir(),
    false,
  );
  cached = { credential: options.credential, socket };
  return socket;
}

function tmpDir(): string {
  return process.env.TMPDIR ?? '/tmp';
}

/**
 * Builds a transport over the SDK socket. Cheap to call; the socket is not
 * opened until `connect()`.
 */
export function createSdkTransport(options: SdkTransportOptions): TickTransport {
  let socket: SdkDataSocket | null = null;
  const handlers: {
    connect?: () => void;
    close?: () => void;
    error?: (error: unknown) => void;
    message?: (payload: unknown) => void;
  } = {};

  return {
    connect(): void {
      socket = socketFor(options);
      socket.on('connect', () => {
        // Lite mode is set on every connect: the socket forgets it, like it
        // forgets its subscriptions.
        try {
          socket?.mode(socket.LiteMode);
        } catch (error) {
          handlers.error?.(error);
        }
        handlers.connect?.();
      });
      socket.on('message', (payload?: unknown) => handlers.message?.(payload));
      socket.on('error', (error?: unknown) => handlers.error?.(error));
      socket.on('close', () => handlers.close?.());
      socket.connect();
    },

    close(): void {
      const current = socket;
      socket = null;
      if (current === null) return;
      // Detach first so the SDK's own close event does not re-enter the
      // wrapper's reconnect cycle for a close WE asked for.
      current.on('close', () => {});
      current.on('message', () => {});
      current.on('error', () => {});
      current.on('connect', () => {});
      current.close();
    },

    subscribe(symbols: string[]): void {
      socket?.subscribe(symbols);
    },

    unsubscribe(symbols: string[]): void {
      socket?.unsubscribe(symbols);
    },

    on(event: string, handler: (payload?: unknown) => void): void {
      if (event === 'connect') handlers.connect = handler as () => void;
      else if (event === 'close') handlers.close = handler as () => void;
      else if (event === 'error') handlers.error = handler as (error: unknown) => void;
      else if (event === 'message') handlers.message = handler as (payload: unknown) => void;
    },
  };
}
