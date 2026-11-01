import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { RequireAuth } from './RequireAuth';
import { AppShell } from '../components/AppShell';
import { AreaPage } from '../features/areas/AreaPage';
import { CalendarPage } from '../features/calendar/CalendarPage';
import { ContactDetailPage } from '../features/contacts/ContactDetailPage';
import { ContactsPage } from '../features/contacts/ContactsPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { EventDetailPage } from '../features/events/EventDetailPage';
import { EventsPage } from '../features/events/EventsPage';
import { HabitsPage } from '../features/habits/HabitsPage';
import { HealthPage } from '../features/health/HealthPage';
import { ProjectDetailPage } from '../features/projects/ProjectDetailPage';
import { ProjectNewPage } from '../features/projects/ProjectNewPage';
import { ProjectsPage } from '../features/projects/ProjectsPage';
import { ResourceDetailPage } from '../features/resources/ResourceDetailPage';
import { ResourcesPage } from '../features/resources/ResourcesPage';
import { SearchPage } from '../features/search/SearchPage';
import { LoginPage } from '../features/session/LoginPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { TaskDetailPage } from '../features/tasks/TaskDetailPage';
import { TasksPage } from '../features/tasks/TasksPage';
import { EMPTY_SESSION, SESSION_QUERY_KEY } from '../features/session/useSession';

export function App() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    const handleExpired = (): void => {
      queryClient.clear();
      queryClient.setQueryData(SESSION_QUERY_KEY, {
        data: { ...EMPTY_SESSION, reason: 'expired' }
      });
      navigate('/login?expired=1', { replace: true });
    };

    window.addEventListener('ppm:session-expired', handleExpired);
    return () => window.removeEventListener('ppm:session-expired', handleExpired);
  }, [navigate, queryClient]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="inbox" element={<DashboardPage mode="inbox" />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="tasks/:id" element={<TaskDetailPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/new" element={<ProjectNewPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="events/:id" element={<EventDetailPage />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="contacts/:id" element={<ContactDetailPage />} />
          <Route path="resources" element={<ResourcesPage />} />
          <Route path="resources/:id" element={<ResourceDetailPage />} />
          <Route path="habits" element={<HabitsPage />} />
          <Route path="health" element={<HealthPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="areas/:areaId" element={<AreaPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
