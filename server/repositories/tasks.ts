import type { PoolClient } from 'pg';
import type { AreaId } from '../../shared/areas.js';
import type { TaskDto } from '../../shared/api-types.js';
import type { TaskStatus } from '../../shared/enums.js';
import type { DbPool } from '../db/pool.js';
import { AppError } from '../errors.js';

export interface TaskListFilters {
  q?: string;
  areaId?: AreaId;
  projectId?: string;
  status?: TaskStatus;
  tag?: string;
  from?: string;
  to?: string;
  undated?: boolean;
  archived: 'exclude' | 'only' | 'all';
  sort: 'updated' | 'created' | 'due' | 'planned';
  limit: number;
  offset: number;
}

type TaskRecord = TaskDto;

export const TASK_SELECT = `
  select
    t.id,
    t.title,
    t.description,
    t.project_id as "projectId",
    t.area_id as "areaId",
    coalesce(t.area_id, p.primary_area_id) as "effectiveAreaId",
    p.title as "projectTitle",
    p.archived_at as "projectArchivedAt",
    t.status,
    t.priority,
    t.planned_on as "plannedOn",
    t.due_on as "dueOn",
    t.due_at as "dueAt",
    t.due_timezone as "dueTimezone",
    t.follow_up_on as "followUpOn",
    t.estimated_minutes as "estimatedMinutes",
    t.completed_at as "completedAt",
    t.contact_id as "contactId",
    t.event_id as "eventId",
    t.tags,
    t.version,
    t.created_at as "createdAt",
    t.updated_at as "updatedAt",
    t.archived_at as "archivedAt"
  from tasks t
  left join projects p on p.id = t.project_id
`;

export interface InsertTaskInput {
  title: string;
  description: string;
  projectId: string | null;
  areaId: AreaId | null;
  priority: TaskDto['priority'];
  plannedOn: string | null;
  dueOn: string | null;
  dueAt: string | null;
  dueTimezone: string | null;
  followUpOn: string | null;
  estimatedMinutes: number | null;
  tags: string[];
  contactId: string | null;
  eventId: string | null;
}

export async function insertTask(client: PoolClient, input: InsertTaskInput): Promise<TaskDto> {
  const { rows } = await client.query<{ id: string }>(
    `insert into tasks
      (title, description, project_id, area_id, priority, planned_on, due_on, due_at,
       due_timezone, follow_up_on, estimated_minutes, tags, contact_id, event_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     returning id`,
    [
      input.title,
      input.description,
      input.projectId,
      input.areaId,
      input.priority,
      input.plannedOn,
      input.dueOn,
      input.dueAt,
      input.dueTimezone,
      input.followUpOn,
      input.estimatedMinutes,
      input.tags,
      input.contactId,
      input.eventId
    ]
  );

  const id = rows[0]?.id;
  if (!id) {
    throw new Error('insert into tasks returned no row');
  }

  const task = await selectTaskById(client, id);
  if (!task) {
    throw new Error('inserted task could not be read back');
  }
  return task;
}

export async function selectTaskById(
  db: DbPool | PoolClient,
  taskId: string
): Promise<TaskDto | null> {
  const { rows } = await db.query<TaskRecord>(`${TASK_SELECT} where t.id = $1`, [taskId]);
  return rows[0] ?? null;
}

export async function selectTaskForUpdate(
  client: PoolClient,
  taskId: string
): Promise<TaskDto | null> {
  const { rows } = await client.query<TaskRecord>(`${TASK_SELECT} where t.id = $1 for update of t`, [
    taskId
  ]);
  return rows[0] ?? null;
}

function buildTaskWhere(filters: Omit<TaskListFilters, 'limit' | 'offset' | 'sort'>): {
  whereSql: string;
  values: unknown[];
} {
  const where: string[] = [];
  const values: unknown[] = [];

  if (filters.archived === 'exclude') {
    where.push('t.archived_at is null');
    where.push('(t.project_id is null or p.archived_at is null)');
  } else if (filters.archived === 'only') {
    where.push(
      '(t.archived_at is not null or (t.project_id is not null and p.archived_at is not null))'
    );
  }

  if (filters.q) {
    values.push(`%${filters.q}%`);
    where.push(`(t.title ilike $${values.length} or t.description ilike $${values.length})`);
  }
  if (filters.areaId) {
    values.push(filters.areaId);
    where.push(`coalesce(t.area_id, p.primary_area_id) = $${values.length}`);
  }
  if (filters.projectId) {
    values.push(filters.projectId);
    where.push(`t.project_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    where.push(`t.status = $${values.length}`);
  }
  if (filters.tag) {
    values.push(filters.tag);
    where.push(`$${values.length} = any(t.tags)`);
  }
  if (filters.from) {
    values.push(filters.from);
    where.push(
      `(t.planned_on >= $${values.length} or t.due_on >= $${values.length} or
        (t.due_at at time zone 'Asia/Hong_Kong')::date >= $${values.length})`
    );
  }
  if (filters.to) {
    values.push(filters.to);
    where.push(
      `(t.planned_on <= $${values.length} or t.due_on <= $${values.length} or
        (t.due_at at time zone 'Asia/Hong_Kong')::date <= $${values.length})`
    );
  }
  if (filters.undated) {
    where.push(
      't.planned_on is null and t.due_on is null and t.due_at is null and t.follow_up_on is null'
    );
  }

  return {
    whereSql: where.length > 0 ? `where ${where.join(' and ')}` : '',
    values
  };
}

export async function selectTasks(
  pool: DbPool,
  filters: TaskListFilters
): Promise<{ items: TaskDto[]; total: number }> {
  const { whereSql, values } = buildTaskWhere(filters);
  const sortSql: Record<TaskListFilters['sort'], string> = {
    updated: 't.updated_at desc, t.id desc',
    created: 't.created_at desc, t.id desc',
    due: `coalesce(t.due_on, (t.due_at at time zone 'Asia/Hong_Kong')::date) asc nulls last, t.created_at desc`,
    planned: 't.planned_on asc nulls last, t.created_at desc'
  };
  const itemValues = [...values, filters.limit, filters.offset];

  const [itemsResult, countResult] = await Promise.all([
    pool.query<TaskRecord>(
      `${TASK_SELECT} ${whereSql} order by ${sortSql[filters.sort]}
        limit $${itemValues.length - 1} offset $${itemValues.length}`,
      itemValues
    ),
    pool.query<{ count: string }>(
      `select count(*)::text as count from tasks t left join projects p on p.id = t.project_id ${whereSql}`,
      values
    )
  ]);

  return {
    items: itemsResult.rows,
    total: Number(countResult.rows[0]?.count ?? '0')
  };
}

export async function updateTaskColumns(
  client: PoolClient,
  taskId: string,
  expectedVersion: number,
  patch: Record<string, unknown>
): Promise<void> {
  const columns: Record<string, string> = {
    title: 'title',
    description: 'description',
    projectId: 'project_id',
    areaId: 'area_id',
    status: 'status',
    priority: 'priority',
    plannedOn: 'planned_on',
    dueOn: 'due_on',
    dueAt: 'due_at',
    dueTimezone: 'due_timezone',
    followUpOn: 'follow_up_on',
    estimatedMinutes: 'estimated_minutes',
    tags: 'tags',
    contactId: 'contact_id',
    eventId: 'event_id',
    completedAt: 'completed_at',
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

  if (sets.length === 0) {
    throw new AppError(400, 'EMPTY_UPDATE', '沒有可更新的欄位');
  }

  sets.push('version = version + 1', 'updated_at = now()');
  values.push(taskId, expectedVersion);
  const { rowCount } = await client.query(
    `update tasks set ${sets.join(', ')}
      where id = $${index} and version = $${index + 1}`,
    values
  );

  if (rowCount === 0) {
    throw new AppError(409, 'VERSION_CONFLICT', '資料已更新，請重新載入');
  }
}

export async function selectProjectPrimaryArea(
  db: DbPool | PoolClient,
  projectId: string
): Promise<{ primaryAreaId: AreaId; archivedAt: string | null } | null> {
  const { rows } = await db.query<{ primaryAreaId: AreaId; archivedAt: string | null }>(
    'select primary_area_id as "primaryAreaId", archived_at as "archivedAt" from projects where id = $1',
    [projectId]
  );
  return rows[0] ?? null;
}

export async function selectFocusTasks(
  db: DbPool | PoolClient,
  localDate: string
): Promise<TaskDto[]> {
  const { rows } = await db.query<TaskRecord>(
    `${TASK_SELECT}
      join daily_focus df on df.task_id = t.id and df.local_date = $1
      order by df.position asc`,
    [localDate]
  );
  return rows;
}

export interface FocusTaskValidation {
  id: string;
  status: TaskStatus;
  archivedAt: string | null;
  projectArchivedAt: string | null;
}

export async function selectFocusTaskValidation(
  client: PoolClient,
  taskIds: string[]
): Promise<FocusTaskValidation[]> {
  const { rows } = await client.query<FocusTaskValidation>(
    `select t.id, t.status, t.archived_at as "archivedAt", p.archived_at as "projectArchivedAt"
       from tasks t
       left join projects p on p.id = t.project_id
      where t.id = any($1::uuid[])
      for update of t`,
    [taskIds]
  );
  return rows;
}

export async function selectTasksInRange(
  pool: DbPool,
  from: string,
  to: string
): Promise<TaskDto[]> {
  const { rows } = await pool.query<TaskRecord>(
    `${TASK_SELECT}
      where t.status not in ('done', 'cancelled')
        and t.archived_at is null
        and (t.project_id is null or p.archived_at is null)
        and (
          (t.planned_on between $1 and $2)
          or (t.due_on between $1 and $2)
          or ((t.due_at at time zone 'Asia/Hong_Kong')::date between $1 and $2)
        )
      order by t.planned_on asc nulls last, t.due_on asc nulls last, t.created_at asc`,
    [from, to]
  );
  return rows;
}

export async function selectTasksDueBetween(
  pool: DbPool,
  from: string,
  to: string
): Promise<TaskDto[]> {
  const { rows } = await pool.query<TaskRecord>(
    `${TASK_SELECT}
      where t.status not in ('done', 'cancelled')
        and t.archived_at is null
        and (t.project_id is null or p.archived_at is null)
        and (
          t.due_on between $1 and $2
          or (t.due_at at time zone 'Asia/Hong_Kong')::date between $1 and $2
        )
      order by coalesce(t.due_on, (t.due_at at time zone 'Asia/Hong_Kong')::date) asc`,
    [from, to]
  );
  return rows;
}

export async function selectWaitingTasks(pool: DbPool): Promise<TaskDto[]> {
  const { rows } = await pool.query<TaskRecord>(
    `${TASK_SELECT}
      where t.status = 'waiting'
        and t.archived_at is null
        and (t.project_id is null or p.archived_at is null)
      order by t.follow_up_on asc nulls last, t.updated_at desc`,
    []
  );
  return rows;
}

export async function selectTasksForCalendar(
  pool: DbPool,
  from: string,
  to: string
): Promise<TaskDto[]> {
  const { rows } = await pool.query<TaskRecord>(
    `${TASK_SELECT}
      where t.status <> 'cancelled'
        and t.archived_at is null
        and (t.project_id is null or p.archived_at is null)
        and (
          t.planned_on between $1 and $2
          or t.due_on between $1 and $2
          or (t.due_at at time zone 'Asia/Hong_Kong')::date between $1 and $2
          or t.follow_up_on between $1 and $2
        )
      order by t.created_at asc`,
    [from, to]
  );
  return rows;
}
