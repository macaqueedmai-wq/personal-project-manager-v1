import type {
  DashboardDto,
  DashboardTaskItem,
  DashboardUpcomingItem,
  DashboardWaitingItem,
  EventDto,
  HabitDto,
  TaskDto
} from '../../shared/api-types.js';
import {
  PROJECT_KIND_LABELS,
  APPLICATION_STAGE_LABELS,
  type ApplicationStage,
  type ProjectKind
} from '../../shared/enums.js';
import {
  addDays,
  endOfHongKongWeek,
  startOfHongKongWeek,
  toHongKongDate
} from '../../shared/dates.js';
import type { DbPool } from '../db/pool.js';
import { selectWaitingTasks, selectTasksDueBetween, selectTasksInRange } from '../repositories/tasks.js';
import { getFocusDay } from './focus.js';

interface DueProjectRow {
  id: string;
  title: string;
  kind: ProjectKind;
  dueOn: string | null;
  dueAt: string | null;
  organizationName: string | null;
  roleOrProgram: string | null;
}

interface WaitingApplicationRow {
  id: string;
  title: string;
  organizationName: string;
  roleOrProgram: string;
  stage: ApplicationStage;
  nextFollowUpOn: string | null;
}

interface WaitingContactRow {
  id: string;
  name: string;
  organization: string;
  nextContactOn: string | null;
}

function reasonsFor(task: TaskDto, date: string): DashboardTaskItem['reasons'] {
  const reasons: DashboardTaskItem['reasons'] = [];
  if (task.plannedOn === date) {
    reasons.push('planned');
  }
  if (
    task.dueOn === date ||
    (task.dueAt !== null && toHongKongDate(task.dueAt) === date)
  ) {
    reasons.push('due');
  }
  return reasons;
}

function mergeReasons(tasks: TaskDto[], date: string): DashboardTaskItem[] {
  const merged = new Map<string, DashboardTaskItem>();

  for (const task of tasks) {
    const reasons = reasonsFor(task, date);
    if (reasons.length === 0) {
      continue;
    }
    const existing = merged.get(task.id);
    if (existing) {
      for (const reason of reasons) {
        if (!existing.reasons.includes(reason)) {
          existing.reasons.push(reason);
        }
      }
    } else {
      merged.set(task.id, { task, reasons });
    }
  }

  return [...merged.values()];
}

function weekReasons(tasks: TaskDto[], weekStart: string, weekEnd: string): DashboardTaskItem[] {
  const items: DashboardTaskItem[] = [];

  for (const task of tasks) {
    const reasons: DashboardTaskItem['reasons'] = [];
    if (task.plannedOn !== null && task.plannedOn >= weekStart && task.plannedOn <= weekEnd) {
      reasons.push('planned');
    }
    const dueDate =
      task.dueOn ?? (task.dueAt !== null ? toHongKongDate(task.dueAt) : null);
    if (dueDate !== null && dueDate >= weekStart && dueDate <= weekEnd) {
      reasons.push('due');
    }
    if (reasons.length > 0) {
      items.push({ task, reasons });
    }
  }

  return items;
}

function dueDateOfProject(project: DueProjectRow): string | null {
  if (project.dueOn) {
    return project.dueOn;
  }
  return project.dueAt ? toHongKongDate(project.dueAt) : null;
}

function upcomingItems(
  tasks: TaskDto[],
  projects: DueProjectRow[],
  events: EventDto[],
  today: string,
  end: string
): DashboardUpcomingItem[] {
  const items: DashboardUpcomingItem[] = [];

  for (const task of tasks) {
    const date = task.dueOn ?? (task.dueAt ? toHongKongDate(task.dueAt) : null);
    if (date && date >= today && date <= end) {
      items.push({
        type: 'task',
        id: task.id,
        title: task.title,
        date,
        dateTime: task.dueAt,
        meta: '任務截止'
      });
    }
  }

  for (const project of projects) {
    const date = dueDateOfProject(project);
    if (date && date >= today && date <= end) {
      const isApplication = project.kind === 'degree_application' || project.kind === 'job_application';
      items.push({
        type: 'project',
        id: project.id,
        title: project.organizationName
          ? `${project.organizationName} — ${project.roleOrProgram ?? project.title}`
          : project.title,
        date,
        dateTime: project.dueAt,
        meta: isApplication ? '申請截止' : `${PROJECT_KIND_LABELS[project.kind]}截止`
      });
    }
  }

  for (const event of events) {
    const date = event.allDay
      ? event.startOn
      : event.startsAt
        ? toHongKongDate(event.startsAt)
        : null;
    if (date && date >= today && date <= end) {
      items.push({
        type: 'event',
        id: event.id,
        title: event.title,
        date,
        dateTime: event.allDay ? null : event.startsAt,
        meta: '活動'
      });
    }
  }

  return items.sort((left, right) => {
    const leftDate = left.date ?? '9999-12-31';
    const rightDate = right.date ?? '9999-12-31';
    return leftDate.localeCompare(rightDate) || left.title.localeCompare(right.title);
  });
}

export async function getDashboard(pool: DbPool): Promise<DashboardDto> {
  const today = toHongKongDate();
  const weekStart = startOfHongKongWeek(today);
  const weekEnd = endOfHongKongWeek(today);
  const upcomingEnd = addDays(today, 6);

  const [
    focus,
    todayTasks,
    weekTasks,
    upcomingTasks,
    waitingTasks,
    dueProjects,
    upcomingEvents,
    activeHabits,
    waitingApplications,
    waitingContacts
  ] = await Promise.all([
    getFocusDay(pool, today),
    selectTasksInRange(pool, today, today),
    selectTasksInRange(pool, weekStart, weekEnd),
    selectTasksDueBetween(pool, today, upcomingEnd),
    selectWaitingTasks(pool),
    pool.query<DueProjectRow>(
      `select p.id, p.title, p.kind, p.due_on as "dueOn", p.due_at as "dueAt",
              a.organization_name as "organizationName", a.role_or_program as "roleOrProgram"
         from projects p
         left join applications a on a.project_id = p.id
        where p.archived_at is null
          and p.status in ('active', 'paused')
          and (
            p.due_on between $1 and $2
            or (p.due_at at time zone 'Asia/Hong_Kong')::date between $1 and $2
          )
        order by coalesce(p.due_on, (p.due_at at time zone 'Asia/Hong_Kong')::date) asc`,
      [today, upcomingEnd]
    ),
    pool.query<EventDto>(
      `select id, title, description, primary_area_id as "primaryAreaId",
              project_id as "projectId", kind, location, url,
              all_day as "allDay", start_on as "startOn", end_on as "endOn",
              starts_at as "startsAt", ends_at as "endsAt", timezone,
              registration_status as "registrationStatus",
              registration_due_on as "registrationDueOn",
              registration_due_at as "registrationDueAt",
              registration_due_timezone as "registrationDueTimezone",
              attendance_status as "attendanceStatus", notes, tags, version,
              created_at as "createdAt", updated_at as "updatedAt", archived_at as "archivedAt"
         from events
        where archived_at is null
          and (
            (all_day and start_on <= $2 and end_on >= $1)
            or
            (not all_day
              and starts_at < (($2::date + 1)::timestamp at time zone 'Asia/Hong_Kong')
              and ends_at > ($1::date::timestamp at time zone 'Asia/Hong_Kong'))
          )
        order by coalesce(start_on, (starts_at at time zone 'Asia/Hong_Kong')::date) asc`,
      [today, upcomingEnd]
    ),
    pool.query<HabitDto>(
      `select id, title, description, schedule_type as "scheduleType", weekdays,
              start_on as "startOn", end_on as "endOn", version,
              created_at as "createdAt", updated_at as "updatedAt", archived_at as "archivedAt"
         from habits
        where archived_at is null
          and start_on <= $1
          and (end_on is null or end_on >= $1)
          and (
            schedule_type = 'daily'
            or extract(isodow from $1::date)::integer = any(weekdays)
          )
        order by created_at asc`,
      [today]
    ),
    pool.query<WaitingApplicationRow>(
      `select p.id, p.title, a.organization_name as "organizationName",
              a.role_or_program as "roleOrProgram", a.stage,
              a.next_follow_up_on as "nextFollowUpOn"
         from projects p
         join applications a on a.project_id = p.id
        where p.archived_at is null
          and a.stage in ('submitted', 'assessment', 'interview', 'decision')
        order by a.next_follow_up_on asc nulls last, p.updated_at desc`,
      []
    ),
    pool.query<WaitingContactRow>(
      `select id, name, organization, next_contact_on as "nextContactOn"
         from contacts
        where archived_at is null and next_contact_on is not null
        order by next_contact_on asc`,
      []
    )
  ]);
  const waiting: DashboardWaitingItem[] = [
    ...waitingTasks.map((task) => ({
      type: 'task' as const,
      id: task.id,
      title: task.title,
      followUpOn: task.followUpOn,
      overdue: task.followUpOn !== null && task.followUpOn < today,
      meta: '等待中的任務'
    })),
    ...waitingApplications.rows.map((application) => ({
      type: 'application' as const,
      id: application.id,
      title: `${application.organizationName} — ${application.roleOrProgram}`,
      followUpOn: application.nextFollowUpOn,
      overdue: application.nextFollowUpOn !== null && application.nextFollowUpOn < today,
      meta: APPLICATION_STAGE_LABELS[application.stage]
    })),
    ...waitingContacts.rows.map((contact) => ({
      type: 'contact' as const,
      id: contact.id,
      title: contact.name,
      followUpOn: contact.nextContactOn,
      overdue: contact.nextContactOn !== null && contact.nextContactOn < today,
      meta: contact.organization || '聯絡提醒'
    }))
  ].sort((left, right) => {
    if (left.followUpOn === null && right.followUpOn !== null) {
      return 1;
    }
    if (left.followUpOn !== null && right.followUpOn === null) {
      return -1;
    }
    if (left.followUpOn !== right.followUpOn) {
      return (left.followUpOn ?? '').localeCompare(right.followUpOn ?? '');
    }
    return left.title.localeCompare(right.title);
  });

  const eventsToday = upcomingEvents.rows.filter((event) => {
    if (event.allDay) {
      return (
        event.startOn !== null &&
        event.endOn !== null &&
        event.startOn <= today &&
        event.endOn >= today
      );
    }
    const start = event.startsAt ? toHongKongDate(event.startsAt) : null;
    const end = event.endsAt ? toHongKongDate(event.endsAt) : null;
    return start !== null && end !== null && start <= today && end >= today;
  });

  return {
    today,
    weekStart,
    weekEnd,
    now: new Date().toISOString(),
    focus: focus.tasks,
    focusVersion: focus.version,
    todayTasks: mergeReasons(todayTasks, today),
    weekTasks: weekReasons(weekTasks, weekStart, weekEnd),
    upcoming: upcomingItems(upcomingTasks, dueProjects.rows, upcomingEvents.rows, today, upcomingEnd),
    waiting,
    events: eventsToday,
    habits: activeHabits.rows
  };
}