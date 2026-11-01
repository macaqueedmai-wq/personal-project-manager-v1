import type { PoolClient } from 'pg';
import type { HealthEntryDto } from '../../shared/api-types.js';
import { toHongKongDate } from '../../shared/dates.js';
import type { HealthEntryInput, HealthEntryUpdateInput } from '../../shared/schemas.js';
import type { DbPool } from '../db/pool.js';
import { withWorkspaceWrite } from '../db/system-state.js';
import { AppError } from '../errors.js';

const HEALTH_SELECT = `
  select id, local_date as "localDate", kind,
         activity_name as "activityName", duration_minutes as "durationMinutes",
         sleep_hours::float8 as "sleepHours", note, version,
         created_at as "createdAt", updated_at as "updatedAt"
    from health_entries
`;

interface HealthListFilters {
  from?: string;
  to?: string;
  kind?: HealthEntryDto['kind'];
  limit: number;
  offset: number;
}

function assertHealthShape(value: {
  kind: HealthEntryDto['kind'];
  durationMinutes: number | null;
  sleepHours: number | null;
  note: string;
}): void {
  if (value.kind === 'exercise' && (value.durationMinutes === null || value.durationMinutes <= 0)) {
    throw new AppError(400, 'INVALID_HEALTH_ENTRY', '運動紀錄需要正數時長');
  }
  if (
    value.kind === 'sleep' &&
    (value.sleepHours === null || value.sleepHours < 0 || value.sleepHours > 24)
  ) {
    throw new AppError(400, 'INVALID_HEALTH_ENTRY', '睡眠時數需介乎 0 至 24 小時');
  }
  if (value.kind === 'note' && value.note.trim().length === 0) {
    throw new AppError(400, 'INVALID_HEALTH_ENTRY', '備註紀錄需要內容');
  }
}

async function selectEntry(
  db: DbPool | PoolClient,
  id: string
): Promise<HealthEntryDto | null> {
  const { rows } = await db.query<HealthEntryDto>(`${HEALTH_SELECT} where id = $1`, [id]);
  return rows[0] ?? null;
}

function isUniqueSleepViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

export async function listHealthEntries(
  pool: DbPool,
  filters: HealthListFilters
): Promise<{ items: HealthEntryDto[]; total: number }> {
  if (filters.from && filters.to && filters.from > filters.to) {
    throw new AppError(400, 'INVALID_DATE_RANGE', '開始日期不可晚於結束日期');
  }
  const where: string[] = [];
  const values: unknown[] = [];
  if (filters.from) {
    values.push(filters.from);
    where.push(`local_date >= $${values.length}`);
  }
  if (filters.to) {
    values.push(filters.to);
    where.push(`local_date <= $${values.length}`);
  }
  if (filters.kind) {
    values.push(filters.kind);
    where.push(`kind = $${values.length}`);
  }
  const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';
  const itemValues = [...values, filters.limit, filters.offset];
  const [items, count] = await Promise.all([
    pool.query<HealthEntryDto>(
      `${HEALTH_SELECT} ${whereSql}
        order by local_date desc, created_at desc
        limit $${itemValues.length - 1} offset $${itemValues.length}`,
      itemValues
    ),
    pool.query<{ count: string }>(
      `select count(*)::text as count from health_entries ${whereSql}`,
      values
    )
  ]);
  return { items: items.rows, total: Number(count.rows[0]?.count ?? '0') };
}

export async function getHealthEntry(
  pool: DbPool,
  id: string
): Promise<HealthEntryDto | null> {
  return selectEntry(pool, id);
}

export async function createHealthEntry(
  pool: DbPool,
  input: HealthEntryInput,
  expectedEpoch: string
): Promise<{ entry: HealthEntryDto; revision: string }> {
  if (input.localDate > toHongKongDate()) {
    throw new AppError(400, 'FUTURE_HEALTH_ENTRY', '不可記錄未來日期');
  }
  assertHealthShape({
    kind: input.kind,
    durationMinutes: input.durationMinutes ?? null,
    sleepHours: input.sleepHours ?? null,
    note: input.note
  });

  try {
    return await withWorkspaceWrite(pool, expectedEpoch, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into health_entries
          (local_date, kind, activity_name, duration_minutes, sleep_hours, note)
         values ($1, $2, $3, $4, $5, $6)
         returning id`,
        [
          input.localDate,
          input.kind,
          input.activityName ?? null,
          input.durationMinutes ?? null,
          input.sleepHours ?? null,
          input.note
        ]
      );
      const id = rows[0]?.id;
      if (!id) throw new Error('insert into health_entries returned no row');
      const entry = await selectEntry(client, id);
      if (!entry) throw new Error('inserted health entry could not be read back');
      return { entry };
    }).then(({ value, revision }) => ({ ...value, revision }));
  } catch (error) {
    if (isUniqueSleepViolation(error)) {
      throw new AppError(409, 'SLEEP_ENTRY_EXISTS', '該日期已有睡眠紀錄，請直接修改該筆紀錄');
    }
    throw error;
  }
}

export async function updateHealthEntry(
  pool: DbPool,
  id: string,
  input: HealthEntryUpdateInput,
  expectedEpoch: string
): Promise<{ entry: HealthEntryDto; revision: string }> {
  try {
    return await withWorkspaceWrite(pool, expectedEpoch, async (client) => {
      const current = await selectEntry(client, id);
      if (!current) throw new AppError(404, 'HEALTH_ENTRY_NOT_FOUND', '找不到這筆健康紀錄');
      if (current.version !== input.version) {
        throw new AppError(409, 'VERSION_CONFLICT', '健康紀錄已更新，請重新載入再試');
      }

      const localDate = input.localDate ?? current.localDate;
      if (localDate > toHongKongDate()) {
        throw new AppError(400, 'FUTURE_HEALTH_ENTRY', '不可記錄未來日期');
      }
      const kind = input.kind ?? current.kind;
      const durationMinutes =
        input.durationMinutes === undefined ? current.durationMinutes : input.durationMinutes;
      const sleepHours =
        input.sleepHours === undefined ? current.sleepHours : input.sleepHours;
      const note = input.note ?? current.note;
      assertHealthShape({ kind, durationMinutes, sleepHours, note });

      await client.query(
        `update health_entries
            set local_date = $2, kind = $3,
                activity_name = $4, duration_minutes = $5, sleep_hours = $6, note = $7,
                version = version + 1, updated_at = now()
          where id = $1`,
        [
          id,
          localDate,
          kind,
          input.activityName === undefined ? current.activityName : input.activityName,
          durationMinutes,
          sleepHours,
          note
        ]
      );
      const entry = await selectEntry(client, id);
      if (!entry) throw new Error('updated health entry could not be read back');
      return { entry };
    }).then(({ value, revision }) => ({ ...value, revision }));
  } catch (error) {
    if (isUniqueSleepViolation(error)) {
      throw new AppError(409, 'SLEEP_ENTRY_EXISTS', '該日期已有睡眠紀錄，請直接修改該筆紀錄');
    }
    throw error;
  }
}