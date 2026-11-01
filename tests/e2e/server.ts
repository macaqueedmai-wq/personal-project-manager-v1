import path from 'node:path';
import bcrypt from 'bcryptjs';
import { loadConfig } from '../../server/config.js';
import { createApp } from '../../server/app.js';
import { runMigrations } from '../../server/db/migrate.js';
import { createPool } from '../../server/db/pool.js';
import { startTestDatabase } from '../helpers/testDatabase.js';

const PORT = 3100;
const PUBLIC_ORIGIN = `http://127.0.0.1:${PORT}`;
const OWNER_PASSWORD = 'e2e-owner-password';

async function main(): Promise<void> {
  const database = await startTestDatabase();
  const pool = createPool(database.databaseUrl);
  await runMigrations(pool, path.resolve(process.cwd(), 'migrations'));

  const adminPasswordHash = await bcrypt.hash(OWNER_PASSWORD, 6);
  const config = loadConfig({
    NODE_ENV: 'test',
    PORT: String(PORT),
    DATABASE_URL: database.databaseUrl,
    PUBLIC_ORIGIN,
    ADMIN_PASSWORD_HASH: adminPasswordHash,
    SESSION_SECRET: 'e2e-session-secret-0123456789abcdefghij',
    TRUST_PROXY_HOPS: '0'
  } satisfies NodeJS.ProcessEnv);

  const app = createApp({
    config,
    pool,
    serveClient: true,
    logger: { error: (...args: unknown[]) => console.error('[e2e]', ...args) }
  });

  const server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`[e2e] 測試伺服器已啟動：${PUBLIC_ORIGIN}`);
  });

  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    server.close(() => {
      void (async () => {
        await pool.end().catch(() => undefined);
        await database.stop();
      })();
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(`[e2e] 啟動失敗：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
