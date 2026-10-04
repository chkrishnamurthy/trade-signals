import { MarketDataProviderError } from '@equitywise/market-data';
import { describe, expect, it } from 'vitest';
import { isUserAuthenticationError, MarketDataError, toMarketError } from './errors';

describe('isUserAuthenticationError', () => {
  it('recognises a rejected EquityWise user session', () => {
    const failure = new MarketDataError('Not signed in.', {
      code: 'UNAUTHENTICATED',
      status: 401,
    });

    expect(isUserAuthenticationError(failure)).toBe(true);
  });

  it('does not confuse an upstream provider credential failure with the user session', () => {
    const failure = toMarketError(
      new MarketDataProviderError('Provider credential expired.', {
        failure: 'auth',
        providerId: 'test-provider',
      }),
    );

    expect(failure).toMatchObject({ code: 'AUTH', status: 401 });
    expect(isUserAuthenticationError(failure)).toBe(false);
  });

  it('requires both the stable code and the 401 status', () => {
    const failure = new MarketDataError('Wrong status.', {
      code: 'UNAUTHENTICATED',
      status: 500,
    });

    expect(isUserAuthenticationError(failure)).toBe(false);
  });
});
