import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';

const MIGRATION_LOCK_KEY = 7_710_001;
const migrationFilePattern = /^\d{3}_[a-z0-9_-]+\.sql$/;

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

interface MigrationRow {
  id: string;
  checksum: string;
}

function checksumOf(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

/**
 * Applies SQL migrations in filename order under a PostgreSQL advisory lock.
 * Each file is recorded with a checksum so an already-applied file can never be
 * silently rewritten.
 */
export async function runMigrations(pool: Pool, migrationsDir: string): Promise<MigrationResult> {
  const files = (await readdir(migrationsDir))
    .filter((file) => migrationFilePattern.test(file))
    .sort();

  if (files.length === 0) {
    throw new Error(`migration 資料夾沒有任何 .sql 檔案：${migrationsDir}`);
  }

  const client = await pool.connect();

  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

    await client.query(`
      create table if not exists schema_migrations (
        id text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);

    const { rows } = await client.query<MigrationRow>(
      'select id, checksum from schema_migrations'
    );
    const applied = new Map(rows.map((row) => [row.id, row.checksum]));

    const result: MigrationResult = { applied: [], skipped: [] };

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      // Normalise line endings before hashing and executing so a Windows
      // checkout and a Linux CI checkout produce the same checksum.
      const sql = (await readFile(filePath, 'utf8')).replace(/\r\n/g, '\n');
      const checksum = checksumOf(sql);
      const previousChecksum = applied.get(file);

      if (previousChecksum !== undefined) {
        if (previousChecksum !== checksum) {
          throw new Error(
            `migration ${file} 已套用，但檔案內容已被修改（checksum 不符）。請新增一個新的 migration，而不要改寫已套用的檔案。`
          );
        }
        result.skipped.push(file);
        continue;
      }

      await client.query('begin');
      try {
        await client.query(sql);
        await client.query(
          'insert into schema_migrations (id, checksum) values ($1, $2)',
          [file, checksum]
        );
        await client.query('commit');
        result.applied.push(file);
      } catch (error) {
        await client.query('rollback');
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`migration ${file} 執行失敗：${message}`, { cause: error });
      }
    }

    return result;
  } finally {
    await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}
