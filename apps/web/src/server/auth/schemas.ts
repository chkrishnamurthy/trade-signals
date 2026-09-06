import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './password-policy';

/** Zod schemas at the auth boundary. Email is trimmed + lower-cased here. */

const email = z.string().trim().toLowerCase().pipe(z.string().email().max(254));
const strongPassword = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH);

export const signUpSchema = z.object({
  email,
  password: strongPassword,
  displayName: z.string().trim().min(1).max(80).optional(),
  acceptTerms: z.literal(true),
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

export const resetRequestSchema = z.object({ email });

export const resetConfirmSchema = z.object({
  token: z.string().min(1).max(256),
  password: strongPassword,
});

export const tokenSchema = z.object({ token: z.string().min(1).max(256) });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
