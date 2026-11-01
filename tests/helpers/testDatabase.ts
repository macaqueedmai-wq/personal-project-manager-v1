import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (typeof address === 'object' && address !== null) {
        const { port } = address;
        server.close(() => resolve(port));
        return;
      }

      server.close(() => reject(new Error('無法取得空閒連接埠')));
    });
  });
}

export interface TestDatabase {
  databaseUrl: string;
  source: 'embedded' | 'TEST_DATABASE_URL';
  stop: () => Promise<void>;
}

/**
 * Integration tests use a real PostgreSQL server. If TEST_DATABASE_URL is set
 * (CI service container), that dedicated database is used; otherwise a
 * temporary embedded PostgreSQL cluster is started on this machine.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const externalUrl = process.env.TEST_DATABASE_URL;

  if (externalUrl) {
    return {
      databaseUrl: externalUrl,
      source: 'TEST_DATABASE_URL',
      stop: async () => undefined
    };
  }

  const databaseDir = await mkdtemp(path.join(tmpdir(), 'ppm-pg-'));
  const port = await findFreePort();

  const postgres = new EmbeddedPostgres({
    databaseDir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    autoRehydrateSymlinks: true,
    onLog: () => undefined,
    onError: (message) => {
      console.error('[embedded-postgres]', message);
    }
  });

  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('ppm_test');

  return {
    databaseUrl: `postgres://postgres:postgres@127.0.0.1:${port}/ppm_test`,
    source: 'embedded',
    stop: async () => {
      await postgres.stop().catch(() => undefined);

      // Windows can briefly keep handles on the data directory after the
      // postgres process exits. Cleanup must never fail the test suite.
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
          await rm(databaseDir, { recursive: true, force: true });
          return;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EBUSY') {
            console.warn(`[tests] 暫存資料庫目錄未能刪除：${databaseDir}`);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }

      console.warn(`[tests] 暫存資料庫目錄仍被鎖定，已保留：${databaseDir}`);
    }
  };
}
