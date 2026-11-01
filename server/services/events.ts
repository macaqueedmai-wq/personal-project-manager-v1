import type {
  ApiEnvelope,
  EventDto
} from '../../shared/api-types.js';
import type { AreaId } from '../../shared/areas.js';
import type {
  CreateEventInput,
  EventContactsInput,
  EventRelatedAreasInput,
  EventListQuery,
  UpdateEventInput
} from '../../shared/schemas.js';
import { createEventSchema } from '../../shared/schemas.js';
import type { DbPool } from '../db/pool.js';
import { withWorkspaceWrite } from '../db/system-state.js';
import { AppError, zodFieldErrors } from '../errors.js';

const EVENT_SELECT = `
  select
    e.id, e.title, e.description, e.primary_area_id as "primaryAreaId",
    e.project_id as "projectId", e.kind, e.location, e.url, e.all_day as "allDay",
    e.start_on as "startOn", e.end_on as "endOn", e.starts_at as "startsAt",
    e.ends_at as "endsAt", e.timezone, e.registration_status as "registrationStatus",
    e.registration_due_on as "registrationDueOn", e.registration_due_at as "registrationDueAt",
    e.registration_due_timezone as "registrationDueTimezone",
    e.attendance_status as "attendanceStatus", e.notes, e.tags, e.version,
    e.created_at as "createdAt", e.updated_at as "updatedAt", e.archived_at as "archivedAt"
  from events e
`;

async function loadEvent(
  db: DbPool | import('pg').PoolClient,
  id: string
): Promise<EventDto | null> {
  const { rows } = await db.query<EventDto>(`${EVENT_SELECT} where e.id = $1`, [id]);
  const event = rows[0];
  if (!event) return null;

  const [areas, contacts] = await Promise.all([
    db.query<{ areaId: AreaId }>(
      'select area_id as "areaId" from event_related_areas where event_id = $1 order by area_id',
      [id]
    ),
    db.query<{ contactId: string }>(
      'select contact_id as "contactId" from event_contacts where event_id = $1 order by contact_id',
      [id]
    )
  ]);

  return {
    ...event,
    relatedAreaIds: areas.rows.map((row) => row.areaId),
    contactIds: contacts.rows.map((row) => row.contactId)
  };
}

export async function listEvents(
  pool: DbPool,
  query: EventListQuery
): Promise<{ items: EventDto[]; total: number }> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (query.archived === 'exclude') where.push('e.archived_at is null');
  if (query.archived === 'only') where.push('e.archived_at is not null');
  if (query.q) {
    values.push(`%${query.q}%`);
    where.push(`(e.title ilike $${values.length} or e.description ilike $${values.length})`);
  }
  if (query.areaId) {
    values.push(query.areaId);
    where.push(
      `(e.primary_area_id = $${values.length} or exists (
        select 1 from event_related_areas era where era.event_id = e.id and era.area_id = $${values.length}
      ))`
    );
  }
  if (query.projectId) {
    values.push(query.projectId);
    where.push(`e.project_id = $${values.length}`);
  }
  if (query.kind) {
    values.push(query.kind);
    where.push(`e.kind = $${values.length}`);
  }
  const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';
  const itemValues = [...values, query.limit, query.offset];
  const [items, count] = await Promise.all([
    pool.query<EventDto>(
      `${EVENT_SELECT} ${whereSql} order by coalesce(e.start_on, (e.starts_at at time zone 'Asia/Hong_Kong')::date) asc, e.created_at desc
       limit $${itemValues.length - 1} offset $${itemValues.length}`,
      itemValues
    ),
    pool.query<{ count: string }>(
      `select count(*)::text as count from events e ${whereSql}`,
      values
    )
  ]);
  return { items: items.rows, total: Number(count.rows[0]?.count ?? '0') };
}

export async function getEvent(pool: DbPool, id: string): Promise<EventDto | null> {
  return loadEvent(pool, id);
}

async function assertProject(client: import('pg').PoolClient, projectId: string): Promise<void> {
  const { rowCount } = await client.query('select 1 from projects where id = $1', [projectId]);
  if (rowCount === 0) {
    throw new AppError(400, 'PROJECT_NOT_FOUND', '找不到指定項目', {
      projectId: '找不到指定項目'
    });
  }
}

export async function createEvent(
  pool: DbPool,
  input: CreateEventInput,
  workspaceEpoch: string
): Promise<{ event: EventDto; revision: string }> {
  const { value: id, revision } = await withWorkspaceWrite(pool, workspaceEpoch, async (client) => {
    if (input.projectId) await assertProject(client, input.projectId);
    const { rows } = await client.query<{ id: string }>(
      `insert into events
        (title, description, primary_area_id, project_id, kind, location, url, all_day,
         start_on, end_on, starts_at, ends_at, timezone, registration_status,
         registration_due_on, registration_due_at, registration_due_timezone,
         attendance_status, notes, tags)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       returning id`,
      [
        input.title,
        input.description,
        input.primaryAreaId,
        input.projectId ?? null,
        input.kind,
        input.location,
        input.url,
        input.allDay,
        input.startOn ?? null,
        input.endOn ?? null,
        input.startsAt ?? null,
        input.endsAt ?? null,
        input.timezone ?? null,
        input.registrationStatus,
        input.registrationDueOn ?? null,
        input.registrationDueAt ?? null,
        input.registrationDueTimezone ?? null,
        input.attendanceStatus,
        input.notes,
        input.tags ?? []
      ]
    );
    const newId = rows[0]?.id;
    if (!newId) throw new Error('insert into events returned no row');
    return newId;
  });

  const event = await getEvent(pool, id);
  if (!event) throw new Error('created event could not be read back');
  return { event, revision };
}

export async function updateEvent(
  pool: DbPool,
  eventId: string,
  input: UpdateEventInput,
  workspaceEpoch: string
): Promise<{ event: EventDto; revision: string }> {
  const { revision } = await withWorkspaceWrite(pool, workspaceEpoch, async (client) => {
    const { rows } = await client.query<EventDto>(
      `${EVENT_SELECT} where e.id = $1 for update of e`,
      [eventId]
    );
    const current = rows[0];
    if (!current) throw new AppError(404, 'EVENT_NOT_FOUND', '找不到這個活動');
    if (current.version !== input.version) {
      throw new AppError(409, 'VERSION_CONFLICT', '資料已更新，請重新載入');
    }

    const merged = {
      title: input.title ?? current.title,
      description: input.description ?? current.description,
      primaryAreaId: input.primaryAreaId ?? current.primaryAreaId,
      projectId: Object.hasOwn(input, 'projectId') ? input.projectId ?? null : current.projectId,
      kind: input.kind ?? current.kind,
      location: input.location ?? current.location,
      url: input.url ?? current.url,
      allDay: input.allDay ?? current.allDay,
      startOn: Object.hasOwn(input, 'startOn') ? input.startOn ?? null : current.startOn,
      endOn: Object.hasOwn(input, 'endOn') ? input.endOn ?? null : current.endOn,
      startsAt: Object.hasOwn(input, 'startsAt') ? input.startsAt ?? null : current.startsAt,
      endsAt: Object.hasOwn(input, 'endsAt') ? input.endsAt ?? null : current.endsAt,
      timezone: Object.hasOwn(input, 'timezone') ? input.timezone ?? null : current.timezone,
      registrationStatus: input.registrationStatus ?? current.registrationStatus,
      registrationDueOn: Object.hasOwn(input, 'registrationDueOn')
        ? input.registrationDueOn ?? null
        : current.registrationDueOn,
      registrationDueAt: Object.hasOwn(input, 'registrationDueAt')
        ? input.registrationDueAt ?? null
        : current.registrationDueAt,
      registrationDueTimezone: Object.hasOwn(input, 'registrationDueTimezone')
        ? input.registrationDueTimezone ?? null
        : current.registrationDueTimezone,
      attendanceStatus: input.attendanceStatus ?? current.attendanceStatus,
      notes: input.notes ?? current.notes,
      tags: input.tags ?? current.tags
    };

    const validation = createEventSchema.safeParse(merged);
    if (!validation.success) {
      throw new AppError(400, 'VALIDATION_ERROR', '活動日期或欄位不一致', zodFieldErrors(validation.error));
    }
    if (merged.projectId) await assertProject(client, merged.projectId);

    const patch: Record<string, unknown> = { ...merged };
    if (input.archived !== undefined) {
      patch.archivedAt = input.archived ? new Date().toISOString() : null;
    }

    const columns: Record<string, string> = {
      title: 'title',
      description: 'description',
      primaryAreaId: 'primary_area_id',
      projectId: 'project_id',
      kind: 'kind',
      location: 'location',
      url: 'url',
      allDay: 'all_day',
      startOn: 'start_on',
      endOn: 'end_on',
      startsAt: 'starts_at',
      endsAt: 'ends_at',
      timezone: 'timezone',
      registrationStatus: 'registration_status',
      registrationDueOn: 'registration_due_on',
      registrationDueAt: 'registration_due_at',
      registrationDueTimezone: 'registration_due_timezone',
      attendanceStatus: 'attendance_status',
      notes: 'notes',
      tags: 'tags',
      archivedAt: 'archived_at'
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    for (const [key, column] of Object.entries(columns)) {
      if (Object.hasOwn(patch, key)) {
        values.push(patch[key]);
        sets.push(`${column} = $${index}`);
        index += 1;
      }
    }
    sets.push('version = version + 1', 'updated_at = now()');
    values.push(eventId, input.version);
    const result = await client.query(
      `update events set ${sets.join(', ')} where id = $${index} and version = $${index + 1}`,
      values
    );
    if (result.rowCount === 0) {
      throw new AppError(409, 'VERSION_CONFLICT', '資料已更新，請重新載入');
    }
  });

  const event = await getEvent(pool, eventId);
  if (!event) throw new Error('updated event could not be read back');
  return { event, revision };
}

export async function updateEventRelatedAreas(
  pool: DbPool,
  eventId: string,
  input: EventRelatedAreasInput,
  workspaceEpoch: string
): Promise<{ areaIds: AreaId[]; revision: string }> {
  const { revision } = await withWorkspaceWrite(pool, workspaceEpoch, async (client) => {
    const { rows } = await client.query<{ version: number; primaryAreaId: AreaId }>(
      'select version, primary_area_id as "primaryAreaId" from events where id = $1 for update',
      [eventId]
    );
    const current = rows[0];
    if (!current) throw new AppError(404, 'EVENT_NOT_FOUND', '找不到這個活動');
    if (current.version !== input.version) {
      throw new AppError(409, 'VERSION_CONFLICT', '資料已更新，請重新載入');
    }
    if (input.areaIds.includes(current.primaryAreaId)) {
      throw new AppError(400, 'RELATED_PRIMARY_AREA', '相關領域不可包含主領域', {
        areaIds: '相關領域不可包含主領域'
      });
    }
    await client.query('delete from event_related_areas where event_id = $1', [eventId]);
    for (const areaId of input.areaIds) {
      await client.query('insert into event_related_areas (event_id, area_id) values ($1, $2)', [
        eventId,
        areaId
      ]);
    }
    await client.query(
      'update events set version = version + 1, updated_at = now() where id = $1',
      [eventId]
    );
  });
  const event = await getEvent(pool, eventId);
  return { areaIds: event?.relatedAreaIds ?? [], revision };
}

export async function updateEventContacts(
  pool: DbPool,
  eventId: string,
  input: EventContactsInput,
  workspaceEpoch: string
): Promise<{ contactIds: string[]; revision: string }> {
  const { revision } = await withWorkspaceWrite(pool, workspaceEpoch, async (client) => {
    const { rows } = await client.query<{ version: number }>(
      'select version from events where id = $1 for update',
      [eventId]
    );
    const current = rows[0];
    if (!current) throw new AppError(404, 'EVENT_NOT_FOUND', '找不到這個活動');
    if (current.version !== input.version) {
      throw new AppError(409, 'VERSION_CONFLICT', '資料已更新，請重新載入');
    }
    if (input.contactIds.length > 0) {
      const result = await client.query<{ count: string }>(
        'select count(*)::text as count from contacts where id = any($1::uuid[])',
        [input.contactIds]
      );
      if (Number(result.rows[0]?.count ?? '0') !== input.contactIds.length) {
        throw new AppError(400, 'CONTACT_NOT_FOUND', '有一位或多位人物不存在');
      }
    }
    await client.query('delete from event_contacts where event_id = $1', [eventId]);
    for (const contactId of input.contactIds) {
      await client.query('insert into event_contacts (event_id, contact_id) values ($1, $2)', [
        eventId,
        contactId
      ]);
    }
    await client.query('update events set version = version + 1, updated_at = now() where id = $1', [
      eventId
    ]);
  });
  const event = await getEvent(pool, eventId);
  return { contactIds: event?.contactIds ?? [], revision };
}

export type { ApiEnvelope };