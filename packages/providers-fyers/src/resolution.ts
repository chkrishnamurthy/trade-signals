import type { FyersResolution } from '@signal/fyers';
import type { Resolution } from '@signal/market-data';

/**
 * Our timeframes to Fyers' resolution codes.
 *
 * The one place the two vocabularies meet. Fyers takes minute counts as bare
 * strings ('5' is five minutes, 'D' is daily), which is exactly the kind of
 * provider detail the product must never see.
 */
const TO_FYERS: Readonly<Record<Resolution, FyersResolution>> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '1d': 'D',
  '1w': '1W',
};

export function toFyersResolution(resolution: Resolution): FyersResolution {
  return TO_FYERS[resolution];
}

/** Resolutions this provider serves. */
export const SUPPORTED_RESOLUTIONS: readonly Resolution[] = Object.keys(TO_FYERS) as Resolution[];
