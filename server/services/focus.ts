import type { FocusDayDto } from '../../shared/api-types.js';
import type { FocusPutInput } from '../../shared/schemas.js';
import type { DbPool } from '../db/pool.js';
import { withWorkspaceWrite } from '../db/system-state.js';
import { AppError } from '../errors.js';
import {
  selectFocusTaskValidation,
  selectFocusTasks
} from '../repositories/tasks.js';

export async function getFocusDay(pool: DbPool, localDate: string): Promise<FocusDayDto> {
  const { rows } = await pool.query<{ version: number }>(
    'select version from focus_days where local_date = $1',
    [localDate]
  );
  const version = rows[0]?.version ?? 0;
  const tasks = version === 0 ? [] : await selectFocusTasks(pool, localDate);
  return { date: localDate, version, tasks };
}

export async function putFocusDay(
  pool: DbPool,
  localDate: string,
  input: FocusPutInput,
  workspaceEpoch: string
): Promise<{ focus: FocusDayDto; revision: string }> {
  const { value, revision } = await withWorkspaceWrite(pool, workspaceEpoch, async (client) => {
    const inserted = await client.query<{ version: number }>(
      `insert into focus_days (local_date, version) values ($1, 1)
       on conflict (local_date) do nothing
       returning version`,
      [localDate]
    );

    let currentVersion: number;
    let created = false;

    if (inserted.rows[0]) {
      if (input.version !== 0) {
        throw new AppError(409, 'FOCUS_VERSION_CONFLICT', '每日重點已更新，請重新載入');
      }
      currentVersion = 1;
      created = true;
    } else {
      const locked = await client.query<{ version: number }>(
        'select version from focus_days where local_date = $1 for update',
        [localDate]
      );
      const version = locked.rows[0]?.version;
      if (version === undefined) {
        throw new Error('focus_days row disappeared during update');
      }
      if (input.version !== version) {
        throw new AppError(409, 'FOCUS_VERSION_CONFLICT', '每日重點已更新，請重新載入');
      }
      currentVersion = version;
    }

    if (input.taskIds.length > 0) {
      const validations = await selectFocusTaskValidation(client, input.taskIds);
      if (validations.length !== input.taskIds.length) {
        throw new AppError(400, 'INVALID_FOCUS_TASK', '有一項重點任務不存在', {
          taskIds: '有一項重點任務不存在'
        });
      }
      for (const task of validations) {
        if (task.status === 'done' || task.status === 'cancelled') {
          throw new AppError(400, 'INVALID_FOCUS_TASK', '只能選擇未完成、未取消的任務', {
            taskIds: '只能選擇未完成、未取消的任務'
          });
        }
        if (task.archivedAt || task.projectArchivedAt) {
          throw new AppError(400, 'INVALID_FOCUS_TASK', '已封存的任務不可設為重點', {
            taskIds: '已封存的任務不可設為重點'
          });
        }
      }
    }

    await client.query('delete from daily_focus where local_date = $1', [localDate]);
    for (const [index, taskId] of input.taskIds.entries()) {
      await client.query(
        'insert into daily_focus (local_date, task_id, position) values ($1, $2, $3)',
        [localDate, taskId, index + 1]
      );
    }

    if (!created) {
      const updated = await client.query<{ version: number }>(
        `update focus_days
            set version = version + 1, updated_at = now()
          where local_date = $1
          returning version`,
        [localDate]
      );
      currentVersion = updated.rows[0]?.version ?? currentVersion + 1;
    }

    return {
      date: localDate,
      version: currentVersion,
      tasks: await selectFocusTasks(client, localDate)
    };
  });

  return { focus: value, revision };
}