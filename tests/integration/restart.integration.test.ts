import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../../server/db/migrate';
import { createPool, type DbPool } from '../../server/db/pool';
import {
  findFreePort,
  startTestDatabase,
  type TestDatabase
} from '../helpers/testDatabase';

const OWNER_PASSWORD = 'restart-test-password';
const SESSION_SECRET = 'restart-test-session-secret-0123456789';

let database: TestDatabase;
let pool: DbPool;
let passwordHash = '';
let port = 0;
let origin = '';
let serverProcess: ChildProcess | null = null;
let serverStderr = '';

interface LoginResult {
  cookie: string;
  csrfToken: string;
  workspaceEpoch: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady(): Promise<void> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (serverProcess && serverProcess.exitCode !== null) {
      throw new Error(
        `伺服器提前結束（exit ${serverProcess.exitCode}）：${serverStderr.slice(-2_000)}`
      );
    }

    try {
      const response = await fetch(`${origin}/readyz`);
      if (response.ok) {
        return;
      }
    } catch {
      // Not listening yet.
    }

    await delay(250);
  }

  throw new Error(`等待伺服器就緒逾時：${serverStderr.slice(-2_000)}`);
}

async function waitForShutdown(): Promise<void> {
  const deadline = Date.now() + 8_000;

  while (Date.now() < deadline) {
    try {
      await fetch(`${origin}/healthz`);
    } catch {
      return;
    }

    await delay(200);
  }
}

async function startServer(): Promise<void> {
  serverStderr = '';
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(port),
    DATABASE_URL: database.databaseUrl,
    PUBLIC_ORIGIN: origin,
    ADMIN_PASSWORD_HASH: passwordHash,
    SESSION_SECRET,
    TRUST_PROXY_HOPS: '0'
  };

  serverProcess = spawn(process.execPath, ['dist/server/index.js'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true
  });
  serverProcess.stderr?.on('data', (chunk: Buffer | string) => {
    serverStderr += chunk.toString();
  });

  await waitForReady();
}

async function stopServer(): Promise<void> {
  const child = serverProcess;

  if (!child) {
    return;
  }

  serverProcess = null;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5_000);
    timer.unref();

    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });

    child.kill('SIGTERM');
  });

  await waitForShutdown();
}

async function login(): Promise<LoginResult> {
  const response = await fetch(`${origin}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ password: OWNER_PASSWORD })
  });

  if (response.status !== 200) {
    throw new Error(`登入失敗（${response.status}）：${await response.text()}`);
  }

  const setCookies = response.headers.getSetCookie();
  const cookie = setCookies
    .map((value) => value.split(';')[0] ?? '')
    .filter(Boolean)
    .join('; ');
  const body = (await response.json()) as {
    data: { csrfToken: string; workspaceEpoch: string };
  };

  return {
    cookie,
    csrfToken: body.data.csrfToken,
    workspaceEpoch: body.data.workspaceEpoch
  };
}

/** Runs the real entry point with missing settings and captures its output. */
async function runStartupExpectingFailure(missingKeys: string[]): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'ppm-startup-'));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(port),
    DATABASE_URL: database.databaseUrl,
    PUBLIC_ORIGIN: origin,
    ADMIN_PASSWORD_HASH: passwordHash,
    SESSION_SECRET
  };

  for (const key of missingKeys) {
    delete env[key];
  }

  const child = spawn(process.execPath, [path.resolve(process.cwd(), 'dist/server/index.js')], {
    cwd: tempDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  let output = '';
  child.stdout?.on('data', (chunk: Buffer | string) => {
    output += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer | string) => {
    output += chunk.toString();
  });

  const exitCode = await new Promise<number | null>((resolve) => {
    child.once('exit', (code) => resolve(code));
  });

  await rm(tempDir, { recursive: true, force: true });

  expect(exitCode).toBe(1);
  return output;
}

beforeAll(async () => {
  if (!existsSync(path.resolve(process.cwd(), 'dist/server/index.js'))) {
    throw new Error('找不到 dist/server/index.js，請先執行 npm run build');
  }

  database = await startTestDatabase();
  pool = createPool(database.databaseUrl);
  await runMigrations(pool, path.resolve(process.cwd(), 'migrations'));
  passwordHash = await bcrypt.hash(OWNER_PASSWORD, 4);
  port = await findFreePort();
  origin = `http://127.0.0.1:${port}`;
}, 180_000);

afterAll(async () => {
  await stopServer();
  await pool.end().catch(() => undefined);
  await database.stop();

  it('缺少 ADMIN_PASSWORD_HASH 或 SESSION_SECRET 時啟動失敗，不提供預設登入', async () => {
    const missingHash = await runStartupExpectingFailure(['ADMIN_PASSWORD_HASH']);
    expect(missingHash).toContain('ADMIN_PASSWORD_HASH');
    expect(missingHash).not.toContain(passwordHash);

    const missingSecret = await runStartupExpectingFailure(['SESSION_SECRET']);
    expect(missingSecret).toContain('SESSION_SECRET');
    expect(missingSecret).not.toContain(SESSION_SECRET);
  }, 30_000);
});

describe('API 程序重啟', () => {
  it('重新啟動服務後，先前建立的任務仍可由資料庫讀回', async () => {
    await startServer();

    const firstSession = await login();
    const title = `重啟持久化測試 ${Date.now()}`;
    const createResponse = await fetch(`${origin}/api/v1/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: firstSession.cookie,
        'X-CSRF-Token': firstSession.csrfToken,
        'X-Workspace-Epoch': firstSession.workspaceEpoch
      },
      body: JSON.stringify({ title })
    });

    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { data: { id: string } };

    await stopServer();
    await startServer();

    const secondSession = await login();
    const listResponse = await fetch(`${origin}/api/v1/tasks`, {
      headers: { Cookie: secondSession.cookie }
    });
    expect(listResponse.status).toBe(200);

    const list = (await listResponse.json()) as { data: Array<{ id: string; title: string }> };
    expect(list.data.map((task) => task.id)).toContain(created.data.id);
    expect(list.data.find((task) => task.id === created.data.id)?.title).toBe(title);

    const { rows } = await pool.query<{ title: string }>(
      'select title from tasks where id = $1',
      [created.data.id]
    );
    expect(rows[0]?.title).toBe(title);
  }, 90_000);
});
