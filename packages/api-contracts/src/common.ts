import { z } from 'zod';

/**
 * Building blocks shared by every contract.
 *
 * The wire rules (CLAUDE.md): prices are INTEGER PAISE, instants are ISO-8601
 * UTC strings, and `null` means "not supplied" — never zero. A float where paise
 * belong fails the parse, so a contract drift surfaces as an error, not as a
 * price that is wrong by a factor of a hundred.
 */

/** An integer number of paise. Rejects floats, NaN and unsafe integers. */
export const paise = z.number().int().safe();

/** A nullable paise amount. */
export const paiseOrNull = paise.nullable();

/** An ISO-8601 instant as sent by the server. */
export const isoInstant = z.string().min(10);

/** Every error response: `{ error, code?, remedy?, retryAfterSeconds? }`. */
export const apiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  remedy: z.string().optional(),
  retryAfterSeconds: z.number().optional(),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export const okSchema = z.object({ ok: z.literal(true) });
