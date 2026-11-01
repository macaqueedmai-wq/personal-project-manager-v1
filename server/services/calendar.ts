import type { CalendarOccurrence } from '../../shared/api-types.js';
import type { AreaId } from '../../shared/areas.js';
import { toHongKongDate } from '../../shared/dates.js';
import type { DbPool } from '../db/pool.js';
import { selectTasksForCalendar } from '../repositories/tasks.js';

interface EventCalendarRow {
  id: string;
  title: string;
  primaryAreaId: AreaId;
  projectId: string | null;
  allDay: boolean;
  startOn: string | null;
  endOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
  registrationStatus: string;
  registrationDueOn: string | null;
  registrationDueAt: string | null;
  attendanceStatus: string;
}

interface ProjectCalendarRow {
  id: string;
  title: string;
  primaryAreaId: AreaId;
  dueOn: string | null;
  dueAt: string | null;
}

interface ApplicationCalendarRow {
  id: string;
  primaryAreaId: AreaId;
  organizationName: string;
  roleOrProgram: string;
  dueOn: string | null;
  dueAt: string | null;
}

interface ContactCalendarRow {
  id: string;
  name: string;
  nextContactOn: string;
}

function clamp(value: string, min: string, max: string): string {
  return value < min ? min : value > max ? max : value;
}

export async function getCalendar(
  pool: DbPool,
  from: string,
  to: string,
  areaId?: AreaId
): Promise<CalendarOccurrence[]> {
  const areaParam = areaId ?? null;
  const [events, tasks, projects, applications, contacts] = await Promise.all([
    pool.query<EventCalendarRow>(
      `select e.id, e.title, e.primary_area_id as "primaryAreaId", e.project_id as "projectId",
              e.all_day as "allDay", e.start_on as "startOn", e.end_on as "endOn",
              e.starts_at as "startsAt", e.ends_at as "endsAt",
              e.registration_status as "registrationStatus",
              e.registration_due_on as "registrationDueOn",
              e.registration_due_at as "registrationDueAt",
              e.attendance_status as "attendanceStatus"
         from events e
        where e.archived_at is null
          and (
            (e.all_day and e.start_on <= $2 and e.end_on >= $1)
            or
            (not e.all_day and e.starts_at < (($2::date + 1)::timestamp at time zone 'Asia/Hong_Kong')
             and e.ends_at > ($1::date::timestamp at time zone 'Asia/Hong_Kong'))
          )
          and (
            $3::text is null
            or e.primary_area_id = $3
            or exists (select 1 from event_related_areas era where era.event_id = e.id and era.area_id = $3)
          )`,
      [from, to, areaParam]
    ),
    selectTasksForCalendar(pool, from, to),
    pool.query<ProjectCalendarRow>(
      `select p.id, p.title, p.primary_area_id as "primaryAreaId",
              p.due_on as "dueOn", p.due_at as "dueAt"
         from projects p
        where p.archived_at is null
          and p.status in ('active', 'paused')
          and p.kind not in ('degree_application', 'job_application')
          and (p.due_on between $1 and $2
               or (p.due_at at time zone 'Asia/Hong_Kong')::date between $1 and $2)
          and (
            $3::text is null or p.primary_area_id = $3
            or exists (select 1 from project_related_areas pra where pra.project_id = p.id and pra.area_id = $3)
          )`,
      [from, to, areaParam]
    ),
    pool.query<ApplicationCalendarRow>(
      `select p.id, p.primary_area_id as "primaryAreaId",
              a.organization_name as "organizationName", a.role_or_program as "roleOrProgram",
              p.due_on as "dueOn", p.due_at as "dueAt"
         from applications a
         join projects p on p.id = a.project_id
        where p.archived_at is null
          and a.stage <> 'closed'
          and (p.due_on between $1 and $2
               or (p.due_at at time zone 'Asia/Hong_Kong')::date between $1 and $2)
          and (
            $3::text is null or p.primary_area_id = $3
            or exists (select 1 from project_related_areas pra where pra.project_id = p.id and pra.area_id = $3)
          )`,
      [from, to, areaParam]
    ),
    pool.query<ContactCalendarRow>(
      `select id, name, next_contact_on as "nextContactOn"
         from contacts
        where archived_at is null and next_contact_on between $1 and $2
        order by next_contact_on asc`,
      [from, to]
    )
  ]);

  const occurrences: CalendarOccurrence[] = [];

  for (const event of events.rows) {
    const startOn = event.allDay
      ? clamp(event.startOn ?? from, from, to)
      : clamp(toHongKongDate(event.startsAt ?? new Date()), from, to);
    const endOn = event.allDay
      ? clamp(event.endOn ?? to, from, to)
      : clamp(toHongKongDate(event.endsAt ?? new Date()), from, to);
    occurrences.push({
      key: `event:${event.id}`,
      sourceType: 'event',
      sourceId: event.id,
      occurrenceType: 'event',
      occurrenceTypes: ['event'],
      title: event.title,
      areaId: event.primaryAreaId,
      projectId: event.projectId,
      startOn,
      endOn,
      allDay: event.allDay,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      completed: event.attendanceStatus === 'attended'
    });

    const registrationDate =
      event.registrationDueOn ??
      (event.registrationDueAt ? toHongKongDate(event.registrationDueAt) : null);
    if (
      registrationDate &&
      registrationDate >= from &&
      registrationDate <= to &&
      event.registrationStatus === 'interested' &&
      event.attendanceStatus !== 'attended' &&
      event.attendanceStatus !== 'cancelled'
    ) {
      occurrences.push({
        key: `event:${event.id}:registration`,
        sourceType: 'event',
        sourceId: event.id,
        occurrenceType: 'registrationDue',
        occurrenceTypes: ['registrationDue'],
        title: `${event.title}（報名截止）`,
        areaId: event.primaryAreaId,
        projectId: event.projectId,
        startOn: registrationDate,
        endOn: registrationDate,
        allDay: event.registrationDueOn !== null,
        startsAt: event.registrationDueAt,
        endsAt: event.registrationDueAt,
        completed: false
      });
    }
  }

  for (const task of tasks) {
    const byDate = new Map<string, CalendarOccurrence['occurrenceTypes']>();
    const add = (date: string | null, type: CalendarOccurrence['occurrenceType']): void => {
      if (!date || date < from || date > to) return;
      const current = byDate.get(date) ?? [];
      if (!current.includes(type)) current.push(type);
      byDate.set(date, current);
    };
    add(task.plannedOn, 'planned');
    add(task.dueOn, 'due');
    if (task.dueAt) add(toHongKongDate(task.dueAt), 'due');
    add(task.followUpOn, 'followUp');

    for (const [date, types] of byDate) {
      occurrences.push({
        key: `task:${task.id}:${date}`,
        sourceType: 'task',
        sourceId: task.id,
        occurrenceType: types[0] ?? 'planned',
        occurrenceTypes: types,
        title: task.title,
        areaId: task.effectiveAreaId,
        projectId: task.projectId,
        startOn: date,
        endOn: date,
        allDay: true,
        startsAt: task.dueAt,
        endsAt: task.dueAt,
        completed: task.status === 'done'
      });
    }
  }

  for (const project of projects.rows) {
    const date = project.dueOn ?? (project.dueAt ? toHongKongDate(project.dueAt) : null);
    if (!date || date < from || date > to) continue;
    occurrences.push({
      key: `project:${project.id}`,
      sourceType: 'project',
      sourceId: project.id,
      occurrenceType: 'projectDue',
      occurrenceTypes: ['projectDue'],
      title: `${project.title}（項目截止）`,
      areaId: project.primaryAreaId,
      projectId: project.id,
      startOn: date,
      endOn: date,
      allDay: project.dueOn !== null,
      startsAt: project.dueAt,
      endsAt: project.dueAt,
      completed: false
    });
  }

  for (const application of applications.rows) {
    const date =
      application.dueOn ??
      (application.dueAt ? toHongKongDate(application.dueAt) : null);
    if (!date || date < from || date > to) continue;
    occurrences.push({
      key: `application:${application.id}`,
      sourceType: 'application',
      sourceId: application.id,
      occurrenceType: 'applicationDeadline',
      occurrenceTypes: ['applicationDeadline'],
      title: `${application.organizationName} — ${application.roleOrProgram}（申請截止）`,
      areaId: application.primaryAreaId,
      projectId: application.id,
      startOn: date,
      endOn: date,
      allDay: application.dueOn !== null,
      startsAt: application.dueAt,
      endsAt: application.dueAt,
      completed: false
    });
  }

  if (!areaId) {
    for (const contact of contacts.rows) {
      occurrences.push({
        key: `contact:${contact.id}`,
        sourceType: 'contact',
        sourceId: contact.id,
        occurrenceType: 'contactFollowUp',
        occurrenceTypes: ['contactFollowUp'],
        title: `${contact.name}（聯絡提醒）`,
        areaId: null,
        projectId: null,
        startOn: contact.nextContactOn,
        endOn: contact.nextContactOn,
        allDay: true,
        startsAt: null,
        endsAt: null,
        completed: false
      });
    }
  }

  return occurrences.sort((left, right) => {
    const date = left.startOn.localeCompare(right.startOn);
    return date !== 0 ? date : left.title.localeCompare(right.title);
  });
}