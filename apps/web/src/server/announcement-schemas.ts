import { z } from 'zod';
export const announcementStateSchema = z
  .object({
    read: z.boolean().optional(),
    saved: z.boolean().optional(),
    dismissed: z.boolean().optional(),
    issueReported: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Choose a state to update.');
export const announcementFilterSchema = z.object({
  state: z.enum(['all', 'unread', 'read', 'saved', 'dismissed']).default('all'),
  eventStatus: z.string().max(50).optional(),
  normalizedCategory: z.string().max(50).optional(),
  source: z.enum(['nse', 'bse']).optional(),
  hasFacts: z.boolean().optional(),
});
