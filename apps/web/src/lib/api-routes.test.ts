import { describe, expect, it } from 'vitest';
import { API_ROUTES } from './api-routes';

describe('API_ROUTES', () => {
  describe('auth endpoints', () => {
    it('provides correct static paths', () => {
      expect(API_ROUTES.authSignUp).toBe('/api/auth/sign-up');
      expect(API_ROUTES.authSignIn).toBe('/api/auth/sign-in');
      expect(API_ROUTES.authSession).toBe('/api/auth/session');
      expect(API_ROUTES.authVerify).toBe('/api/auth/verify');
      expect(API_ROUTES.authResetRequest).toBe('/api/auth/reset/request');
      expect(API_ROUTES.authResetConfirm).toBe('/api/auth/reset/confirm');
    });

    it('builds sign-out paths with and without all=true', () => {
      expect(API_ROUTES.authSignOut()).toBe('/api/auth/sign-out');
      expect(API_ROUTES.authSignOut({ all: false })).toBe('/api/auth/sign-out');
      expect(API_ROUTES.authSignOut({ all: true })).toBe('/api/auth/sign-out?all=true');
    });
  });

  describe('market & search endpoints', () => {
    it('encodes search queries properly', () => {
      expect(API_ROUTES.search('reliance')).toBe('/api/search?q=reliance');
      expect(API_ROUTES.search('M&M')).toBe('/api/search?q=M%26M');
      expect(API_ROUTES.search('TCS & INFOSYS')).toBe('/api/search?q=TCS%20%26%20INFOSYS');
    });

    it('formats history endpoint with and without options', () => {
      expect(API_ROUTES.history('RELIANCE')).toBe('/api/history/RELIANCE');
      expect(API_ROUTES.history('M&M', { tf: '1D' })).toBe('/api/history/M%26M?tf=1D');
      expect(API_ROUTES.history('TCS', { tf: '5m', days: 10 })).toBe('/api/history/TCS?tf=5m&days=10');
      expect(API_ROUTES.history('INFY', { days: 30 })).toBe('/api/history/INFY?days=30');
    });
  });

  describe('watchlist endpoints', () => {
    it('provides correct static paths', () => {
      expect(API_ROUTES.watchlists).toBe('/api/watchlists');
      expect(API_ROUTES.watchlistDefault).toBe('/api/watchlists/default');
      expect(API_ROUTES.watchlistReorder).toBe('/api/watchlists/reorder');
    });

    it('builds parameterized watchlist paths', () => {
      expect(API_ROUTES.watchlist(42)).toBe('/api/watchlists/42');
      expect(API_ROUTES.watchlist('42')).toBe('/api/watchlists/42');
      expect(API_ROUTES.watchlistItems(42)).toBe('/api/watchlists/42/items');
      expect(API_ROUTES.watchlistLayout(42)).toBe('/api/watchlists/42/layout');
      expect(API_ROUTES.watchlistViews(42)).toBe('/api/watchlists/42/views');
      expect(API_ROUTES.watchlistView(42, 7)).toBe('/api/watchlists/42/views/7');
      expect(API_ROUTES.watchlistView('42', 'default')).toBe('/api/watchlists/42/views/default');
    });
  });

  describe('admin endpoints', () => {
    it('provides user list path and parameterized user path', () => {
      expect(API_ROUTES.adminUsers).toBe('/api/admin/users');
      expect(API_ROUTES.adminUser(15)).toBe('/api/admin/users/15');
    });
  });

  describe('provider endpoints', () => {
    it('provides correct OAuth connect and callback paths', () => {
      expect(API_ROUTES.fyersConnect).toBe('/api/fyers/connect');
      expect(API_ROUTES.callback).toBe('/callback');
    });
  });
});
