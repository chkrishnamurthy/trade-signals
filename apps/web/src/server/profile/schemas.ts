import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/server/auth/password-policy';

/**
 * Zod schemas at the profile / account boundary. Mirrors `server/auth/schemas.ts`
 * but for a signed-in user editing their own account, so the shapes are the ones
 * the profile page submits.
 */

const email = z.string().trim().toLowerCase().pipe(z.string().email().max(254));
const strongPassword = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH);

/** Longest a display name / bio may be — matched by the client counter. */
export const MAX_DISPLAY_NAME = 50;
export const MAX_BIO = 280;

/**
 * A profile patch. Every field optional; only the ones present are written.
 * `bio` accepts an empty string, which is normalised to `null` (cleared).
 * `preferences` is a shallow bag the route merges into the stored object.
 */
export const profilePatchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(MAX_DISPLAY_NAME),
    bio: z.string().max(MAX_BIO),
    timezone: z.string().trim().min(1).max(64),
    preferences: z
      .object({
        defaultWatchlistId: z.number().int().positive().nullable(),
      })
      .partial(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update.' });

export type ProfilePatchInput = z.infer<typeof profilePatchSchema>;

/** Change password: the current one (to re-authenticate) plus a strong new one. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  newPassword: strongPassword,
});

/** Request an email change: the new address plus the current password to confirm intent. */
export const changeEmailSchema = z.object({
  newEmail: email,
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

/** Confirm an email change from the signed link. */
export const confirmEmailSchema = z.object({ token: z.string().min(1).max(2048) });

/** Delete the account: re-authenticate, and require typing the exact confirmation. */
export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  confirm: z.literal('DELETE'),
});

/** Revoke sessions: one by id, or every device except the current one. */
export const sessionActionSchema = z.union([
  z.object({ sessionId: z.number().int().positive() }),
  z.object({ scope: z.literal('others') }),
]);
