import path from 'node:path';
import { loadConfig, loadEnvFileIfPresent } from '../server/config.js';
import { runMigrations } from '../server/db/migrate.js';
import { createPool } from '../server/db/pool.js';

async function main(): Promise<void> {
  loadEnvFileIfPresent();
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);

  try {
    const result = await runMigrations(pool, path.resolve(process.cwd(), 'migrations'));
    console.log(
      `[db:migrate] 已套用：${result.applied.length > 0 ? result.applied.join(', ') : '（無）'}`
    );
    console.log(`[db:migrate] 已略過（先前已套用）：${result.skipped.length} 個`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[db:migrate] 失敗：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
