import { z } from 'zod';
import { isoInstant } from './common.js';

/** GET /api/admin/users — admin only (403 for everyone else). */
export const adminUserSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  displayName: z.string(),
  role: z.enum(['user', 'admin']),
  status: z.enum(['active', 'disabled']),
  emailVerified: z.boolean(),
  createdAt: isoInstant,
});
export type AdminUser = z.infer<typeof adminUserSchema>;
export const adminUsersResponseSchema = z.object({ users: z.array(adminUserSchema) });
