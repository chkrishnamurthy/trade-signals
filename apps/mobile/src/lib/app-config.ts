import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/** Public runtime config: version gate, auth switches, current terms version. */
export function useAppConfig() {
  return useQuery({
    queryKey: ['app-config'],
    queryFn: () => api.appConfig(),
    staleTime: 5 * 60_000,
    retry: 2,
  });
}
