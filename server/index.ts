import { loadConfig, loadEnvFileIfPresent } from './config.js';
import { createApp } from './app.js';
import { createPool } from './db/pool.js';
import { assertDatabaseReady } from './db/readiness.js';

async function main(): Promise<void> {
  loadEnvFileIfPresent();

  const config = loadConfig();
  const pool = createPool(config.databaseUrl);

  try {
    await assertDatabaseReady(pool);
  } catch (error) {
    console.error(
      `[startup] 無法啟動：${error instanceof Error ? error.message : String(error)}`
    );
    console.error('[startup] 請確認 PostgreSQL 已啟動，並先執行 npm run db:migrate。');
    await pool.end();
    process.exitCode = 1;
    return;
  }

  const serveClient = config.nodeEnv === 'production';
  const app = createApp({ config, pool, serveClient });
  const host = config.nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1';

  const server = app.listen(config.port, host, () => {
    const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
    console.log(`[startup] API 已啟動：http://${displayHost}:${config.port}（${config.nodeEnv}）`);
  });

  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`[shutdown] 收到 ${signal}，正在關閉服務…`);

    server.close((error) => {
      void (async () => {
        await pool.end().catch(() => undefined);

        if (error) {
          console.error(`[shutdown] 關閉 HTTP 伺服器時出錯：${error.message}`);
          process.exitCode = 1;
        }
      })();
    });

    setTimeout(() => {
      console.error('[shutdown] 超過 10 秒仍未關閉，強制結束。');
      process.exit(1);
    }, 10_000).unref();
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error(`[startup] 無法啟動：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
