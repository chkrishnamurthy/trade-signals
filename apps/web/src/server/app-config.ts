import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { googleAuthEnabled, signupEnabled } from '@/server/auth/env';
import { TERMS_VERSION } from '@/server/auth/terms';

/**
 * Mobile app runtime config (docs/mobile/01-discovery.md G8): the version gate
 * from `config/app.yaml` plus the live auth switches the app must mirror —
 * whether sign-up is open, whether Google sign-in is on, and the current Terms
 * version its popup must show. Public and free of secrets by construction.
 */

const semver = z.string().regex(/^\d+\.\d+\.\d+$/u);

const fileSchema = z.object({
  android: z.object({
    minSupportedVersion: semver,
    latestVersion: semver,
    storeUrl: z.string().url(),
  }),
  maintenanceMessage: z.string().max(280).nullable(),
});

export interface AppConfig {
  readonly android: z.infer<typeof fileSchema>['android'];
  readonly maintenanceMessage: string | null;
  readonly auth: {
    readonly signupOpen: boolean;
    readonly googleSignIn: boolean;
    /** The public (web) OAuth client id the app passes to Credential Manager. */
    readonly googleWebClientId: string | null;
  };
  readonly termsVersion: string;
}

const CONFIG_PATH = join(process.cwd(), '..', '..', 'config', 'app.yaml');

export async function loadAppConfig(): Promise<AppConfig> {
  const parsed = fileSchema.safeParse(parse(await readFile(CONFIG_PATH, 'utf8')));
  if (!parsed.success) {
    throw new Error(
      `config/app.yaml is invalid: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  const google = googleAuthEnabled();
  return {
    android: parsed.data.android,
    maintenanceMessage: parsed.data.maintenanceMessage,
    auth: {
      signupOpen: signupEnabled(),
      googleSignIn: google,
      googleWebClientId: google ? (process.env.GOOGLE_CLIENT_ID?.trim() ?? null) : null,
    },
    termsVersion: TERMS_VERSION,
  };
}
