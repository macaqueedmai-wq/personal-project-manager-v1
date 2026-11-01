import type { PoolClient } from 'pg';
import type { HabitDto, HabitEntryDto } from '../../shared/api-types.js';
import { toHongKongDate } from '../../shared/dates.js';
import type { HabitEntryInput, HabitInput, HabitUpdateInput } from '../../shared/schemas.js';
import type { DbPool } from '../db/pool.js';
import { withWorkspaceWrite } from '../db/system-state.js';
import { AppError } from '../errors.js';

const HABIT_SELECT = `
  select id, title, description, schedule_type as "scheduleType", weekdays,
         start_on as "startOn", end_on as "endOn", version,
         created_at as "createdAt", updated_at as "updatedAt", archived_at as "archivedAt"
    from habits
`;

const ENTRY_SELECT = `
  select habit_id as "habitId", local_date as "localDate", status, note
    from habit_entries
`;

interface HabitListFilters {
  q?: string;
  archived: 'exclude' | 'only' | 'all';
  limit: number;
  offset: number;
}

async function selectHabit(
  db: DbPool | PoolClient,
  id: string
): Promise<HabitDto | null> {
  const { rows } = await db.query<HabitDto>(`${HABIT_SELECT} where id = $1`, [id]);
  return rows[0] ?? null;
}

function assertHabitShape(value: {
  scheduleType: HabitDto['scheduleType'];
  weekdays: number[];
  startOn: string;
  endOn: string | null;
}): void {
  if (value.scheduleType === 'daily' && value.weekdays.length > 0) {
    throw new AppError(400, 'INVALID_HABIT_SCHEDULE', '每日習慣不應設定星期');
  }
  if (value.scheduleType === 'weekly' && value.weekdays.length === 0) {
    throw new AppError(400, 'INVALID_HABIT_SCHEDULE', '每週習慣至少需要選一日');
  }
  if (value.endOn && value.endOn < value.startOn) {
    throw new AppError(400, 'INVALID_HABIT_RANGE', '結束日期不可早於開始日期');
  }
}

export async function listHabits(
  pool: DbPool,
  filters: HabitListFilters
): Promise<{ items: HabitDto[]; total: number }> {
  const where: string[] = [];
  const values: unknown[] = [];

  if (filters.archived === 'exclude') {
    where.push('archived_at is null');
  } else if (filters.archived === 'only') {
    where.push('archived_at is not null');
  }
  if (filters.q) {
    values.push(`%${filters.q}%`);
    where.push(`(title ilike $${values.length} or description ilike $${values.length})`);
  }

  const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';
  const itemValues = [...values, filters.limit, filters.offset];
  const [items, count] = await Promise.all([
    pool.query<HabitDto>(
      `${HABIT_SELECT} ${whereSql}
        order by archived_at asc nulls first, created_at asc
        limit $${itemValues.length - 1} offset $${itemValues.length}`,
      itemValues
    ),
    pool.query<{ count: string }>(
      `select count(*)::text as count from habits ${whereSql}`,
      values
    )
  ]);

  return { items: items.rows, total: Number(count.rows[0]?.count ?? '0') };
}

export async function getHabit(pool: DbPool, id: string): Promise<HabitDto | null> {
  return selectHabit(pool, id);
}

export async function createHabit(
  pool: DbPool,
  input: HabitInput,
  expectedEpoch: string
): Promise<{ habit: HabitDto; revision: string }> {
  assertHabitShape({ ...input, endOn: input.endOn ?? null });

  return withWorkspaceWrite(pool, expectedEpoch, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `insert into habits (title, description, schedule_type, weekdays, start_on, end_on)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        input.title,
        input.description,
        input.scheduleType,
        input.weekdays,
        input.startOn,
        input.endOn ?? null
      ]
    );
    const id = rows[0]?.id;
    if (!id) throw new Error('insert into habits returned no row');
    const habit = await selectHabit(client, id);
    if (!habit) throw new Error('inserted habit could not be read back');
    return { habit };
  }).then(({ value, revision }) => ({ ...value, revision }));
}

export async function updateHabit(
  pool: DbPool,
  id: string,
  input: HabitUpdateInput,
  expectedEpoch: string
): Promise<{ habit: HabitDto; revision: string }> {
  return withWorkspaceWrite(pool, expectedEpoch, async (client) => {
    const current = await selectHabit(client, id);
    if (!current) throw new AppError(404, 'HABIT_NOT_FOUND', '找不到這個習慣');
    if (current.version !== input.version) {
      throw new AppError(409, 'VERSION_CONFLICT', '習慣已更新，請重新載入再試');
    }

    const finalShape = {
      scheduleType: input.scheduleType ?? current.scheduleType,
      weekdays: input.weekdays ?? current.weekdays,
      startOn: current.startOn,
      endOn: input.endOn === undefined ? current.endOn : input.endOn
    };
    assertHabitShape(finalShape);

    await client.query(
      `update habits
          set title = coalesce($2, title),
              description = coalesce($3, description),
              schedule_type = $4,
              weekdays = $5,
              end_on = $6,
              archived_at = case
                when $7::boolean is null then archived_at
                when $7 then coalesce(archived_at, now())
                else null
              end,
              version = version + 1,
              updated_at = now()
        where id = $1`,
      [
        id,
        input.title ?? null,
        input.description ?? null,
        finalShape.scheduleType,
        finalShape.weekdays,
        finalShape.endOn,
        input.archived ?? null
      ]
    );

    const habit = await selectHabit(client, id);
    if (!habit) throw new Error('updated habit could not be read back');
    return { habit };
  }).then(({ value, revision }) => ({ ...value, revision }));
}

export async function listHabitEntries(
  pool: DbPool,
  habitId: string,
  from: string,
  to: string
): Promise<HabitEntryDto[]> {
  const habit = await getHabit(pool, habitId);
  if (!habit) throw new AppError(404, 'HABIT_NOT_FOUND', '找不到這個習慣');
  if (from > to) throw new AppError(400, 'INVALID_DATE_RANGE', '開始日期不可晚於結束日期');
  const { rows } = await pool.query<HabitEntryDto>(
    `${ENTRY_SELECT} where habit_id = $1 and local_date between $2 and $3 order by local_date asc`,
    [habitId, from, to]
  );
  return rows;
}

export async function putHabitEntry(
  pool: DbPool,
  habitId: string,
  localDate: string,
  input: HabitEntryInput,
  expectedEpoch: string
): Promise<{ entry: HabitEntryDto; revision: string }> {
  return withWorkspaceWrite(pool, expectedEpoch, async (client) => {
    const habit = await selectHabit(client, habitId);
    if (!habit) throw new AppError(404, 'HABIT_NOT_FOUND', '找不到這個習慣');
    if (habit.archivedAt) {
      throw new AppError(409, 'HABIT_ARCHIVED', '已封存的習慣不可打卡');
    }

    const today = toHongKongDate();
    if (localDate > today) {
      throw new AppError(400, 'FUTURE_HABIT_ENTRY', '不可為未來日期打卡');
    }
    if (localDate < habit.startOn) {
      throw new AppError(400, 'HABIT_ENTRY_BEFORE_START', '日期早於習慣開始日期');
    }
    if (habit.endOn && localDate > habit.endOn) {
      throw new AppError(400, 'HABIT_ENTRY_AFTER_END', '日期晚於習慣結束日期');
    }

    const existing = await client.query<HabitEntryDto>(
      `${ENTRY_SELECT} where habit_id = $1 and local_date = $2`,
      [habitId, localDate]
    );
    const previous = existing.rows[0];
    if (previous && previous.status === input.status && previous.note === input.note) {
      return { entry: previous };
    }

    await client.query(
      `insert into habit_entries (habit_id, local_date, status, note)
       values ($1, $2, $3, $4)
       on conflict (habit_id, local_date)
       do update set status = excluded.status, note = excluded.note`,
      [habitId, localDate, input.status, input.note]
    );

    if (!previous || previous.status !== input.status || previous.note !== input.note) {
      await client.query(
        'update habits set version = version + 1, updated_at = now() where id = $1',
        [habitId]
      );
    }

    const entry = await client.query<HabitEntryDto>(
      `${ENTRY_SELECT} where habit_id = $1 and local_date = $2`,
      [habitId, localDate]
    );
    const saved = entry.rows[0];
    if (!saved) throw new Error('saved habit entry could not be read back');
    return { entry: saved };
  }).then(({ value, revision }) => ({ ...value, revision }));
}

export async function deleteHabitEntry(
  pool: DbPool,
  habitId: string,
  localDate: string,
  expectedEpoch: string
): Promise<{ deleted: boolean; revision: string }> {
  return withWorkspaceWrite(pool, expectedEpoch, async (client) => {
    const habit = await selectHabit(client, habitId);
    if (!habit) throw new AppError(404, 'HABIT_NOT_FOUND', '找不到這個習慣');
    if (localDate > toHongKongDate()) {
      throw new AppError(400, 'FUTURE_HABIT_ENTRY', '不可修改未來日期');
    }
    const result = await client.query(
      'delete from habit_entries where habit_id = $1 and local_date = $2',
      [habitId, localDate]
    );
    const deleted = (result.rowCount ?? 0) > 0;
    if (deleted) {
      await client.query(
        'update habits set version = version + 1, updated_at = now() where id = $1',
        [habitId]
      );
    }
    return { deleted };
  }).then(({ value, revision }) => ({ ...value, revision }));
}