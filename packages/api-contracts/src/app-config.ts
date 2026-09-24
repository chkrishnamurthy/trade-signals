import { z } from 'zod';

const semver = z.string().regex(/^\d+\.\d+\.\d+$/u);

/** GET /api/app-config — public runtime config for the app (docs/mobile G8). */
export const appConfigSchema = z.object({
  android: z.object({
    minSupportedVersion: semver,
    latestVersion: semver,
    storeUrl: z.string().url(),
  }),
  maintenanceMessage: z.string().nullable(),
  auth: z.object({
    signupOpen: z.boolean(),
    googleSignIn: z.boolean(),
    googleWebClientId: z.string().nullable(),
  }),
  termsVersion: z.string(),
});
export type AppConfig = z.infer<typeof appConfigSchema>;

/** Numeric comparison of `a.b.c` versions: negative when `a < b`. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
