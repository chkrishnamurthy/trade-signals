import { ApiError } from '@equitywise/api-client';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Server state lives in TanStack Query. Wired to the platform so polling stops
 * in the background (AppState) and requests pause while offline (NetInfo).
 */

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
);

AppState.addEventListener('change', (status: AppStateStatus) => {
  focusManager.setFocused(status === 'active');
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      // Retry only what is worth retrying; never a 4xx, never a rate limit.
      retry: (count, error) => error instanceof ApiError && error.retryable && count < 2,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});
