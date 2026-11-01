import type { Pool } from 'pg';

/** Verifies connectivity and that the versioned schema has been applied. */
export async function assertDatabaseReady(pool: Pool): Promise<void> {
  await pool.query('select 1');

  try {
    const { rows } = await pool.query<{ count: string }>(
      'select count(*)::text as count from schema_migrations'
    );

    if (!rows[0] || Number(rows[0].count) === 0) {
      throw new Error('資料庫尚未套用 migration。');
    }
  } catch (error) {
    if ((error as { code?: string }).code === '42P01') {
      throw new Error('資料庫尚未套用 migration。', { cause: error });
    }
    throw error;
  }
}
