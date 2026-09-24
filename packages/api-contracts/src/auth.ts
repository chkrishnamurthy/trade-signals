import { z } from 'zod';
import { isoInstant } from './common.js';

/**
 * Authentication contracts (docs/mobile/01-discovery.md §7).
 *
 * The app sends `X-EquityWise-Client: android/<version> (build <n>)` on every
 * request; the server then returns sessions in the body (`session.token`)
 * instead of as a cookie, and the app sends `Authorization: Bearer <token>`.
 */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export const deviceInfoSchema = z.object({
  name: z.string().trim().min(1).max(80),
  platform: z.enum(['android', 'ios']),
  appVersion: z.string().trim().min(1).max(32),
});
export type DeviceInfo = z.infer<typeof deviceInfoSchema>;

/** A bearer session issued to the app. */
export const issuedSessionSchema = z.object({
  token: z.string().min(40),
  expiresAt: isoInstant,
});
export type IssuedSession = z.infer<typeof issuedSessionSchema>;

// ── Requests ───────────────────────────────────────────────────────────────

export interface SignInRequest {
  readonly email: string;
  readonly password: string;
  readonly device: DeviceInfo;
}

export interface SignUpRequest {
  readonly email: string;
  readonly password: string;
  readonly displayName?: string;
  readonly acceptTerms: true;
  readonly termsVersion: string;
  readonly device: DeviceInfo;
}

export type MfaVerifyRequest = {
  readonly challengeId: string;
  readonly binding: string;
  readonly device: DeviceInfo;
} & ({ readonly code: string } | { readonly recoveryCode: string });

export type GoogleNativeRequest =
  | { readonly idToken: string; readonly nonceId: string; readonly device: DeviceInfo }
  | {
      readonly pendingSignupId: string;
      readonly acceptTerms: true;
      readonly termsVersion: string;
      readonly device: DeviceInfo;
    };

// ── Responses ──────────────────────────────────────────────────────────────

const mfaRequired = z.object({
  ok: z.literal(true),
  status: z.literal('mfa_required'),
  challengeId: z.string(),
  binding: z.string(),
});

/** POST /api/auth/sign-in — a session, or a 2FA challenge to answer. */
export const signInResponseSchema = z.union([
  mfaRequired,
  z.object({ ok: z.literal(true), session: issuedSessionSchema }),
]);
export type SignInResponse = z.infer<typeof signInResponseSchema>;

/** POST /api/auth/sign-up — `signedIn: false` means "created; now sign in". */
export const signUpResponseSchema = z.object({
  ok: z.literal(true),
  signedIn: z.boolean(),
  session: issuedSessionSchema.optional(),
});

/** POST /api/auth/mfa/verify */
export const mfaVerifyResponseSchema = z.object({
  redirectTo: z.string(),
  session: issuedSessionSchema,
});

/** POST /api/auth/google/native/nonce */
export const googleNonceResponseSchema = z.object({
  nonceId: z.string(),
  nonce: z.string(),
});

/** POST /api/auth/google/native */
export const googleNativeResponseSchema = z.discriminatedUnion('status', [
  z.object({ ok: z.literal(true), status: z.literal('signed_in'), session: issuedSessionSchema }),
  mfaRequired,
  z.object({ ok: z.literal(true), status: z.literal('linked') }),
  z.object({
    ok: z.literal(true),
    status: z.literal('terms_required'),
    pendingSignupId: z.string(),
    termsVersion: z.string(),
  }),
]);
export type GoogleNativeResponse = z.infer<typeof googleNativeResponseSchema>;

/** POST /api/auth/session/rotate */
export const rotateResponseSchema = z.object({
  ok: z.literal(true),
  session: issuedSessionSchema,
});

/** Responses that may re-issue this device's session (password change, 2FA toggle). */
export const maybeSessionResponseSchema = z.object({
  ok: z.literal(true),
  session: issuedSessionSchema.optional(),
});

export const userProfileSchema = z.object({
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  bio: z.string().nullable(),
  timezone: z.string(),
  locale: z.string(),
  preferences: z.record(z.unknown()),
});

export const sessionUserSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  role: z.enum(['user', 'admin']),
  emailVerified: z.boolean(),
  /** Whether two-factor sign-in is on (managed on the website in v1.0). */
  mfaEnabled: z.boolean().default(false),
  profile: userProfileSchema,
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

/** GET /api/auth/session */
export const sessionResponseSchema = z.object({ user: sessionUserSchema.nullable() });

/** GET /api/account/sessions */
export const accountSessionSchema = z.object({
  id: z.number().int(),
  createdAt: isoInstant,
  lastUsedAt: isoInstant,
  expiresAt: isoInstant,
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  client: z.enum(['web', 'mobile']).default('web'),
  deviceName: z.string().nullable().default(null),
  authenticationMethod: z.enum(['password', 'google']).default('password'),
  isCurrent: z.boolean(),
});
export type AccountSession = z.infer<typeof accountSessionSchema>;
export const accountSessionsResponseSchema = z.object({
  sessions: z.array(accountSessionSchema),
});

/** GET /api/account/identities */
export const accountIdentitySchema = z.object({
  id: z.number().int(),
  provider: z.literal('google'),
  email: z.string().nullable(),
  connectedAt: isoInstant,
  lastUsedAt: isoInstant.nullable(),
});
export const accountMethodsResponseSchema = z.object({
  hasPassword: z.boolean(),
  identities: z.array(accountIdentitySchema),
});
export type AccountMethods = z.infer<typeof accountMethodsResponseSchema>;

/** PATCH /api/profile */
export const profileResponseSchema = z.object({ profile: userProfileSchema });
