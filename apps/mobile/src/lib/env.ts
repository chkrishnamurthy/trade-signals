import type { DeviceInfo } from '@equitywise/api-contracts';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

/**
 * Build-time facts about this install. Nothing here is secret: the API URL is
 * public and everything else is read from the device.
 */

const DEFAULT_API_URL = 'https://equitywise.io';

export const API_URL: string = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(
  /\/+$/u,
  '',
);

export const APP_VERSION: string =
  Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0';

export const BUILD_NUMBER: string = Application.nativeBuildVersion ?? '0';

export const VARIANT: string =
  (Constants.expoConfig?.extra as { variant?: string } | undefined)?.variant ?? 'production';

/** Sent as `X-EquityWise-Client` on every request (G9). */
export const CLIENT_LABEL = `${Platform.OS === 'ios' ? 'ios' : 'android'}/${APP_VERSION} (build ${BUILD_NUMBER})`;

/** What the sessions list on the website shows for this phone. */
export function deviceInfo(): DeviceInfo {
  const name = Device.deviceName ?? Device.modelName ?? 'Android phone';
  return {
    name: name.slice(0, 80),
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    appVersion: APP_VERSION,
  };
}

export const WEBSITE_URL = 'https://equitywise.io';
