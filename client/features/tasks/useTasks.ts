import { useQuery } from '@tanstack/react-query';
import type { ApiEnvelope, AreaDto, TaskDto } from '@shared/api-types';
import { apiRequest } from '../../api/client';

export function useAreasQuery() {
  return useQuery({
    queryKey: ['areas'],
    queryFn: () => apiRequest<ApiEnvelope<AreaDto[]>>('/areas')
  });
}

export function useTasksQuery() {
  return useQuery({
    queryKey: ['tasks', 'all'],
    queryFn: () => apiRequest<ApiEnvelope<TaskDto[]>>('/tasks?limit=50')
  });
}
