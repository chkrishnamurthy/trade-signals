import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * App config per build variant (docs/mobile/01-discovery.md §9).
 *
 *   development — the dev client; talks to the web app on your Mac through
 *                 `adb reverse tcp:3000 tcp:3000` (http://localhost:3000), so it
 *                 alone may use cleartext HTTP. Separate id so it can sit beside
 *                 the store build on the same phone.
 *   preview     — installable APK for testers; production API.
 *   production  — the Play Store build (AAB); production API.
 *
 * Only EXPO_PUBLIC_* values reach the phone, and none of them is secret.
 */

type Variant = 'development' | 'preview' | 'production';

const variant: Variant =
  process.env.APP_VARIANT === 'development' || process.env.APP_VARIANT === 'preview'
    ? process.env.APP_VARIANT
    : 'production';

const IS_DEV = variant === 'development';

/** Bump for every Play upload; EAS can auto-increment it remotely (eas.json). */
const VERSION = '1.0.0';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? 'EquityWise (Dev)' : 'EquityWise',
  slug: 'equitywise',
  owner: process.env.EXPO_OWNER,
  scheme: IS_DEV ? 'equitywise-dev' : 'equitywise',
  version: VERSION,
  // S18: every screen size and orientation, including tablets and foldables.
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  runtimeVersion: { policy: 'appVersion' },
  android: {
    package: IS_DEV ? 'io.equitywise.app.dev' : 'io.equitywise.app',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    // The session token lives in the Keystore; never let Android back it up.
    allowBackup: false,
    predictiveBackGestureEnabled: true,
    // App Links (G4) are deliberately not claimed yet: the app has no screens for
    // /verify or /reset, so those email links must keep opening the website.
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        backgroundColor: '#ffffff',
        dark: { image: './assets/splash-icon.png', backgroundColor: '#05070c' },
      },
    ],
    ['expo-local-authentication', { faceIDPermission: 'Unlock EquityWise with Face ID.' }],
    [
      'expo-build-properties',
      {
        android: {
          // HTTPS only, except the development client talking to your Mac.
          usesCleartextTraffic: IS_DEV,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    variant,
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
});
