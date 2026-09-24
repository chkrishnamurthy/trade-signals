import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * Server-state hooks. Live prices are polled on the server's terms
 * (`refreshAfterSeconds`, docs/mobile G5a) and only while the screen is focused
 * and the app is in the foreground — never a tight loop into a rate limit.
 */

export const keys = {
  watchlists: ['watchlists'] as const,
  watchlist: (id: number) => ['watchlist', id] as const,
  indices: ['indices'] as const,
  stock: (symbol: string) => ['stock', symbol] as const,
  history: (symbol: string, tf: string) => ['history', symbol, tf] as const,
  search: (q: string) => ['search', q] as const,
  templates: ['templates'] as const,
  sessions: ['sessions'] as const,
  methods: ['account-methods'] as const,
  adminUsers: ['admin-users'] as const,
};

export function useWatchlists() {
  return useQuery({ queryKey: keys.watchlists, queryFn: () => api.watchlists() });
}

export function useWatchlist(id: number) {
  const focused = useIsFocused();
  return useQuery({
    queryKey: keys.watchlist(id),
    queryFn: ({ signal }) => api.watchlist(id, signal),
    enabled: Number.isFinite(id),
    refetchInterval: (query) => {
      if (!focused) return false;
      const data = query.state.data;
      if (!data?.market.isOpen) return 60_000;
      return Math.max(3, data.refreshAfterSeconds) * 1000;
    },
  });
}

export function useIndices() {
  const focused = useIsFocused();
  return useQuery({
    queryKey: keys.indices,
    queryFn: ({ signal }) => api.marketIndices(signal),
    refetchInterval: (query) =>
      !focused ? false : query.state.data?.market.isOpen ? 15_000 : 120_000,
  });
}

export function useStock(symbol: string) {
  return useQuery({
    queryKey: keys.stock(symbol),
    queryFn: ({ signal }) => api.stock(symbol, signal),
    staleTime: 5 * 60_000,
  });
}

export function useHistory(symbol: string, timeframe: string) {
  const focused = useIsFocused();
  return useQuery({
    queryKey: keys.history(symbol, timeframe),
    queryFn: ({ signal }) => api.history(symbol, timeframe, signal),
    placeholderData: keepPreviousData,
    refetchInterval: timeframe === '1D' && focused ? 60_000 : false,
  });
}

/** Debounced symbol search (public endpoint). */
export function useSymbolSearch(query: string) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  return useQuery({
    queryKey: keys.search(debounced),
    queryFn: ({ signal }) => api.search(debounced, signal),
    enabled: debounced.length >= 1,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useAddToWatchlist() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; symbols: string[] }) =>
      api.addSymbols(input.id, input.symbols),
    onSuccess: (_result, input) => {
      void client.invalidateQueries({ queryKey: keys.watchlist(input.id) });
      void client.invalidateQueries({ queryKey: keys.watchlists });
    },
  });
}

export function useRemoveFromWatchlist(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (instrumentIds: number[]) => api.removeSymbols(id, instrumentIds),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.watchlist(id) });
      void client.invalidateQueries({ queryKey: keys.watchlists });
    },
  });
}
