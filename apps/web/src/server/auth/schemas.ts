import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './password-policy';

/** Zod schemas at the auth boundary. Email is trimmed + lower-cased here. */

const email = z.string().trim().toLowerCase().pipe(z.string().email().max(254));

/** What the native app says about itself at sign-in; browsers omit it. */
export const deviceSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    platform: z.enum(['android', 'ios']),
    appVersion: z.string().trim().min(1).max(32),
  })
  .optional();

/** Version of the Terms & Privacy Policy the user agreed to (a date stamp). */
export const termsVersionSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const strongPassword = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH);

export const signUpSchema = z.object({
  email,
  password: strongPassword,
  displayName: z.string().trim().min(1).max(80).optional(),
  acceptTerms: z.literal(true),
  termsVersion: termsVersionSchema.optional(),
  device: deviceSchema,
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  device: deviceSchema,
});

export const resetRequestSchema = z.object({ email });

export const resetConfirmSchema = z.object({
  token: z.string().min(1).max(256),
  password: strongPassword,
});

export const tokenSchema = z.object({ token: z.string().min(1).max(256) });

export const mfaVerifySchema = z
  .object({
    challengeId: z.string().min(32).max(256),
    code: z
      .string()
      .regex(/^\d{6}$/u)
      .optional(),
    recoveryCode: z.string().min(8).max(32).optional(),
    /** Native app only: the challenge binding returned by sign-in. */
    binding: z.string().min(32).max(256).optional(),
    device: deviceSchema,
  })
  .refine((value) => Boolean(value.code) !== Boolean(value.recoveryCode), {
    message: 'Provide one verification method.',
  });

/** Native Google sign-in: a fresh ID token, or completing a pending sign-up after the terms popup. */
export const googleNativeSchema = z.union([
  z.object({
    idToken: z.string().min(100).max(4096),
    nonceId: z.string().min(32).max(256),
    device: deviceSchema,
  }),
  z.object({
    pendingSignupId: z.string().min(32).max(256),
    acceptTerms: z.literal(true),
    termsVersion: termsVersionSchema,
    device: deviceSchema,
  }),
]);

export const mfaCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/u) });

export const identityDisconnectSchema = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH).optional(),
});
