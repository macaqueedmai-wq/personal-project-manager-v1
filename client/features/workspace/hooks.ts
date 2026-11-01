import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApiEnvelope,
  AppSettingsDto,
  AreaDto,
  CalendarOccurrence,
  ContactDto,
  DashboardDto,
  EventDto,
  FocusDayDto,
  HabitDto,
  HabitEntryDto,
  HealthEntryDto,
  InteractionDto,
  ProjectDto,
  ResourceDto,
  ResourceLinkDto,
  SearchResultDto,
  TaskDto
} from '@shared/api-types';
import { apiRequest } from '../../api/client';
import { useSessionQuery } from '../session/useSession';

export function useDashboardQuery() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiRequest<ApiEnvelope<DashboardDto>>('/dashboard')
  });
}

export function useTasksQuery(query: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      params.set(key, value);
    }
  }
  const suffix = params.toString();
  return useQuery({
    queryKey: ['tasks', suffix],
    queryFn: () => apiRequest<ApiEnvelope<TaskDto[]>>(`/tasks${suffix ? `?${suffix}` : ''}`)
  });
}

export function useTaskQuery(id: string | undefined) {
  return useQuery({
    queryKey: ['task', id],
    queryFn: () => apiRequest<ApiEnvelope<TaskDto>>(`/tasks/${id}`),
    enabled: Boolean(id)
  });
}

export function useProjectsQuery(query: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      params.set(key, value);
    }
  }
  const suffix = params.toString();
  return useQuery({
    queryKey: ['projects', suffix],
    queryFn: () => apiRequest<ApiEnvelope<ProjectDto[]>>(`/projects${suffix ? `?${suffix}` : ''}`)
  });
}

export function useProjectQuery(id: string | undefined) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => apiRequest<ApiEnvelope<ProjectDto>>(`/projects/${id}`),
    enabled: Boolean(id)
  });
}

export function useFocusQuery(date: string | undefined) {
  return useQuery({
    queryKey: ['focus', date],
    queryFn: () => apiRequest<ApiEnvelope<FocusDayDto>>(`/focus/${date}`),
    enabled: Boolean(date)
  });
}

export function useAreasQuery() {
  return useQuery({
    queryKey: ['areas'],
    queryFn: () => apiRequest<ApiEnvelope<AreaDto[]>>('/areas')
  });
}

function querySuffix(query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, value);
  }
  const suffix = params.toString();
  return suffix ? `?${suffix}` : '';
}

export function useCalendarQuery(query: Record<string, string | undefined>) {
  const suffix = querySuffix(query);
  return useQuery({
    queryKey: ['calendar', suffix],
    queryFn: () => apiRequest<ApiEnvelope<CalendarOccurrence[]>>(`/calendar${suffix}`)
  });
}

export function useEventsQuery(query: Record<string, string | undefined> = {}) {
  const suffix = querySuffix(query);
  return useQuery({
    queryKey: ['events', suffix],
    queryFn: () => apiRequest<ApiEnvelope<EventDto[]>>(`/events${suffix}`)
  });
}

export function useEventQuery(id: string | undefined) {
  return useQuery({
    queryKey: ['event', id],
    queryFn: () => apiRequest<ApiEnvelope<EventDto>>(`/events/${id}`),
    enabled: Boolean(id)
  });
}

export function useContactsQuery(query: Record<string, string | undefined> = {}) {
  const suffix = querySuffix(query);
  return useQuery({
    queryKey: ['contacts', suffix],
    queryFn: () => apiRequest<ApiEnvelope<ContactDto[]>>(`/contacts${suffix}`)
  });
}

export function useContactQuery(id: string | undefined) {
  return useQuery({
    queryKey: ['contact', id],
    queryFn: () => apiRequest<ApiEnvelope<ContactDto>>(`/contacts/${id}`),
    enabled: Boolean(id)
  });
}

export function useInteractionsQuery(contactId: string | undefined) {
  return useQuery({
    queryKey: ['interactions', contactId],
    queryFn: () => apiRequest<ApiEnvelope<InteractionDto[]>>(`/contacts/${contactId}/interactions`),
    enabled: Boolean(contactId)
  });
}

export function useResourcesQuery(query: Record<string, string | undefined> = {}) {
  const suffix = querySuffix(query);
  return useQuery({
    queryKey: ['resources', suffix],
    queryFn: () => apiRequest<ApiEnvelope<ResourceDto[]>>(`/resources${suffix}`)
  });
}

export function useResourceQuery(id: string | undefined) {
  return useQuery({
    queryKey: ['resource', id],
    queryFn: () => apiRequest<ApiEnvelope<ResourceDto>>(`/resources/${id}`),
    enabled: Boolean(id)
  });
}

export function useResourceLinksQuery(id: string | undefined) {
  return useQuery({
    queryKey: ['resource-links', id],
    queryFn: () => apiRequest<ApiEnvelope<ResourceLinkDto[]>>(`/resources/${id}/links`),
    enabled: Boolean(id)
  });
}

export function useHabitsQuery(query: Record<string, string | undefined> = {}) {
  const suffix = querySuffix(query);
  return useQuery({
    queryKey: ['habits', suffix],
    queryFn: () => apiRequest<ApiEnvelope<HabitDto[]>>(`/habits${suffix}`)
  });
}

export function useHabitEntriesQuery(id: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: ['habit-entries', id, from, to],
    queryFn: () =>
      apiRequest<ApiEnvelope<HabitEntryDto[]>>(`/habits/${id}/entries?from=${from}&to=${to}`),
    enabled: Boolean(id)
  });
}

export function useHealthQuery(query: Record<string, string | undefined> = {}) {
  const suffix = querySuffix(query);
  return useQuery({
    queryKey: ['health', suffix],
    queryFn: () => apiRequest<ApiEnvelope<HealthEntryDto[]>>(`/health-entries${suffix}`)
  });
}

export function useSearchQuery(q: string, archived: 'exclude' | 'include' = 'exclude') {
  return useQuery({
    queryKey: ['search', q, archived],
    queryFn: () =>
      apiRequest<ApiEnvelope<SearchResultDto[]>>(
        `/search?q=${encodeURIComponent(q)}&archived=${archived}&limit=50`
      ),
    enabled: q.trim().length > 0
  });
}

export function useSettingsQuery() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiRequest<ApiEnvelope<AppSettingsDto>>('/settings')
  });
}

export function useWorkspaceInvalidate() {
  const queryClient = useQueryClient();

  return async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['task'] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
      queryClient.invalidateQueries({ queryKey: ['project'] }),
      queryClient.invalidateQueries({ queryKey: ['focus'] }),
      queryClient.invalidateQueries({ queryKey: ['areas'] }),
      queryClient.invalidateQueries({ queryKey: ['calendar'] }),
      queryClient.invalidateQueries({ queryKey: ['events'] }),
      queryClient.invalidateQueries({ queryKey: ['event'] }),
      queryClient.invalidateQueries({ queryKey: ['contacts'] }),
      queryClient.invalidateQueries({ queryKey: ['contact'] }),
      queryClient.invalidateQueries({ queryKey: ['interactions'] }),
      queryClient.invalidateQueries({ queryKey: ['resources'] }),
      queryClient.invalidateQueries({ queryKey: ['resource'] }),
      queryClient.invalidateQueries({ queryKey: ['resource-links'] }),
      queryClient.invalidateQueries({ queryKey: ['habits'] }),
      queryClient.invalidateQueries({ queryKey: ['habit-entries'] }),
      queryClient.invalidateQueries({ queryKey: ['health'] }),
      queryClient.invalidateQueries({ queryKey: ['search'] }),
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    ]);
  };
}

export function useWriteContext() {
  const session = useSessionQuery();
  return {
    csrfToken: session.data?.data.csrfToken ?? null,
    workspaceEpoch: session.data?.data.workspaceEpoch ?? null
  };
}