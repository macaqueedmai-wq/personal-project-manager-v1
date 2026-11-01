import type { Pool, PoolClient } from 'pg';
import { AppError } from '../errors.js';

export interface WorkspaceState {
  revision: string;
  dataEpoch: string;
}

type Queryable = Pick<Pool | PoolClient, 'query'>;

export async function readWorkspaceState(db: Queryable): Promise<WorkspaceState> {
  const { rows } = await db.query<WorkspaceState>(
    'select revision, data_epoch as "dataEpoch" from system_state where id = 1'
  );

  const row = rows[0];
  if (!row) {
    throw new AppError(
      503,
      'WORKSPACE_NOT_READY',
      '資料庫尚未初始化，請執行 npm run db:migrate'
    );
  }

  return row;
}

/**
 * All business writes share one lock protocol: lock the single system_state
 * row, compare the caller's workspace epoch, run the work, then bump revision.
 */
export async function withWorkspaceWrite<T>(
  pool: Pool,
  expectedEpoch: string,
  work: (client: PoolClient) => Promise<T>
): Promise<{ value: T; revision: string }> {
  const client = await pool.connect();

  try {
    await client.query('begin');

    const { rows } = await client.query<WorkspaceState>(
      'select revision, data_epoch as "dataEpoch" from system_state where id = 1 for update'
    );
    const state = rows[0];

    if (!state) {
      throw new AppError(
        503,
        'WORKSPACE_NOT_READY',
        '資料庫尚未初始化，請執行 npm run db:migrate'
      );
    }

    if (state.dataEpoch !== expectedEpoch) {
      throw new AppError(409, 'WORKSPACE_CHANGED', '資料已更新，請重新載入後再試');
    }

    const value = await work(client);

    const updated = await client.query<{ revision: string }>(
      'update system_state set revision = revision + 1 where id = 1 returning revision'
    );
    const revision = updated.rows[0]?.revision;

    if (!revision) {
      throw new Error('system_state revision update returned no row');
    }

    await client.query('commit');

    return { value, revision };
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // The connection is already unusable; the original error is the useful one.
    }
    throw error;
  } finally {
    client.release();
  }
}
