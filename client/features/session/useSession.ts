import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiEnvelope, SessionDto } from '@shared/api-types';
import { apiRequest } from '../../api/client';

export const SESSION_QUERY_KEY = ['session'] as const;

export const EMPTY_SESSION: SessionDto = {
  authenticated: false,
  csrfToken: null,
  workspaceEpoch: null,
  today: null,
  now: null,
  timezone: 'Asia/Hong_Kong'
};

export function useSessionQuery() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => apiRequest<ApiEnvelope<SessionDto>>('/auth/session'),
    staleTime: 60_000,
    retry: false
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (password: string) =>
      apiRequest<ApiEnvelope<SessionDto>>('/auth/login', {
        method: 'POST',
        body: { password }
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(SESSION_QUERY_KEY, response);
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['areas'] });
    }
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  const session = queryClient.getQueryData<ApiEnvelope<SessionDto>>(SESSION_QUERY_KEY);

  return useMutation({
    mutationFn: () =>
      apiRequest<ApiEnvelope<{ ok: boolean }>>('/auth/logout', {
        method: 'POST',
        csrfToken: session?.data.csrfToken ?? null
      }),
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(SESSION_QUERY_KEY, { data: EMPTY_SESSION });
    }
  });
}
