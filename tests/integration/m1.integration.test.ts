import path from 'node:path';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppConfig } from '../../server/config';
import { loadConfig } from '../../server/config';
import { createApp } from '../../server/app';
import { runMigrations, type MigrationResult } from '../../server/db/migrate';
import { createPool, type DbPool } from '../../server/db/pool';
import { LoginRateLimiter } from '../../server/services/auth';
import { startTestDatabase, type TestDatabase } from '../helpers/testDatabase';

const OWNER_PASSWORD = 'integration-test-password';
const MIGRATIONS_DIR = path.resolve(process.cwd(), 'migrations');

let database: TestDatabase;
let pool: DbPool;
let config: AppConfig;
let app: Express;
let agent: ReturnType<typeof request.agent>;
let csrfToken = '';
let workspaceEpoch = '';
let createdTaskId = '';
let firstRevision = '0';

function sessionCookieFrom(rawCookie: unknown): string {
  const cookies = Array.isArray(rawCookie)
    ? rawCookie.filter((value): value is string => typeof value === 'string')
    : typeof rawCookie === 'string'
      ? [rawCookie]
      : [];
  const sessionCookie = cookies.find((cookie) => cookie.startsWith('ppm.sid='));

  if (!sessionCookie) {
    throw new Error('登入回應沒有 ppm.sid Cookie');
  }

  return sessionCookie.split(';')[0] ?? '';
}

async function login(application: Express): Promise<request.Response> {
  return request(application)
    .post('/api/v1/auth/login')
    .set('Origin', config.publicOrigin)
    .send({ password: OWNER_PASSWORD });
}

beforeAll(async () => {
  database = await startTestDatabase();

  pool = createPool(database.databaseUrl);
  const migrations: MigrationResult = await runMigrations(pool, MIGRATIONS_DIR);
  const migrationFiles = [...migrations.applied, ...migrations.skipped];
  expect(migrationFiles).toHaveLength(7);

  const adminPasswordHash = await bcrypt.hash(OWNER_PASSWORD, 4);
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    PORT: '3000',
    DATABASE_URL: database.databaseUrl,
    PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
    ADMIN_PASSWORD_HASH: adminPasswordHash,
    SESSION_SECRET: 'integration-test-session-secret-0123456789',
    TRUST_PROXY_HOPS: '0'
  };

  config = loadConfig(env);
  app = createApp({
    config,
    pool,
    logger: { error: () => undefined }
  });
  agent = request.agent(app);

  const { rows } = await pool.query<{ revision: string }>(
    'select revision from system_state where id = 1'
  );
  firstRevision = rows[0]?.revision ?? '0';
}, 120_000);

afterAll(async () => {
  await pool.end().catch(() => undefined);
  await database.stop();
});

describe('migration 與七領域種子', () => {
  it('healthz 與 readyz 公開、可用且不洩漏連線資訊', async () => {
    const health = await request(app).get('/healthz');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok' });

    const ready = await request(app).get('/readyz');
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: 'ready' });
  });

  it('重跑 migration 不會重複領域或改寫資料', async () => {
    const secondRun = await runMigrations(pool, MIGRATIONS_DIR);
    expect(secondRun.applied).toEqual([]);
    expect(secondRun.skipped).toHaveLength(7);

    const { rows } = await pool.query<{ id: string; sort_order: number }>(
      'select id, sort_order from areas order by sort_order asc'
    );
    expect(rows.map((row) => row.id)).toEqual([
      'study',
      'degree',
      'career-hk',
      'internship-sz',
      'health',
      'social',
      'outreach'
    ]);
    expect(rows).toHaveLength(7);

    const { rows: taskRows } = await pool.query<{ count: string }>(
      'select count(*)::text as count from tasks'
    );
    expect(taskRows[0]?.count).toBe('0');
  });
});

describe('身份驗證與 CSRF', () => {
  it('未登入不可讀取或改寫業務資料', async () => {
    const read = await request(app).get('/api/v1/tasks');
    expect(read.status).toBe(401);
    expect(read.body.error.code).toBe('UNAUTHENTICATED');
    expect(read.body.data).toBeUndefined();

    const write = await request(app)
      .post('/api/v1/tasks')
      .set('Origin', config.publicOrigin)
      .send({ title: '未授權任務' });
    expect(write.status).toBe(401);

    const exportLikeRead = await request(app).get('/api/v1/areas');
    expect(exportLikeRead.status).toBe(401);
  });

  it('拒絕外部 Origin 與缺少 Origin 的登入', async () => {
    const foreign = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ password: OWNER_PASSWORD });
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.code).toBe('ORIGIN_MISMATCH');

    const missing = await request(app)
      .post('/api/v1/auth/login')
      .send({ password: OWNER_PASSWORD });
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe('ORIGIN_REQUIRED');
  });

  it('錯誤密碼回 401，正確密碼建立可用的 Session', async () => {
    const wrong = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', config.publicOrigin)
      .send({ password: 'wrong-password' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');

    const response = await agent
      .post('/api/v1/auth/login')
      .set('Origin', config.publicOrigin)
      .send({ password: OWNER_PASSWORD });
    expect(response.status).toBe(200);
    expect(response.body.data.authenticated).toBe(true);

    const rawCookie = response.headers['set-cookie'];
    const cookies = Array.isArray(rawCookie) ? rawCookie : [rawCookie ?? ''];
    expect(cookies[0]).toContain('HttpOnly');
    expect(cookies[0]).toContain('SameSite=Lax');
    expect(cookies[0]).toContain('Path=/');

    const session = await agent.get('/api/v1/auth/session');
    expect(session.status).toBe(200);
    expect(session.body.data.authenticated).toBe(true);
    expect(session.body.data.timezone).toBe('Asia/Hong_Kong');
    expect(session.body.data.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    csrfToken = session.body.data.csrfToken;
    workspaceEpoch = session.body.data.workspaceEpoch;
    expect(csrfToken).toEqual(expect.any(String));
    expect(workspaceEpoch).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('已登入但缺少 CSRF 或工作區版本時拒絕改寫', async () => {
    const missingCsrf = await agent
      .post('/api/v1/tasks')
      .set('Origin', config.publicOrigin)
      .set('X-Workspace-Epoch', workspaceEpoch)
      .send({ title: '不應寫入' });
    expect(missingCsrf.status).toBe(403);
    expect(missingCsrf.body.error.code).toBe('INVALID_CSRF_TOKEN');

    const missingEpoch = await agent
      .post('/api/v1/tasks')
      .set('Origin', config.publicOrigin)
      .set('X-CSRF-Token', csrfToken)
      .send({ title: '不應寫入' });
    expect(missingEpoch.status).toBe(400);
    expect(missingEpoch.body.error.code).toBe('MISSING_WORKSPACE_EPOCH');

    const staleEpoch = await agent
      .post('/api/v1/tasks')
      .set('Origin', config.publicOrigin)
      .set('X-CSRF-Token', csrfToken)
      .set('X-Workspace-Epoch', '00000000-0000-4000-8000-000000000000')
      .send({ title: '不應寫入' });
    expect(staleEpoch.status).toBe(409);
    expect(staleEpoch.body.error.code).toBe('WORKSPACE_CHANGED');

    const { rows } = await pool.query<{ count: string }>(
      'select count(*)::text as count from tasks'
    );
    expect(rows[0]?.count).toBe('0');
  });
});

describe('任務建立、驗證與讀回', () => {
  it('只輸入標題即可建立任務並保存到 PostgreSQL', async () => {
    const response = await agent
      .post('/api/v1/tasks')
      .set('Origin', config.publicOrigin)
      .set('X-CSRF-Token', csrfToken)
      .set('X-Workspace-Epoch', workspaceEpoch)
      .send({ title: '  閱讀方法論文章  ' });

    expect(response.status).toBe(201);
    expect(response.body.data.title).toBe('閱讀方法論文章');
    expect(response.body.data.status).toBe('todo');
    expect(response.body.data.areaId).toBeNull();
    expect(response.body.data.projectId).toBeNull();
    expect(response.body.data.plannedOn).toBeNull();
    expect(response.body.data.dueOn).toBeNull();
    expect(response.body.data.dueAt).toBeNull();
    expect(response.body.data.id).toMatch(/^[0-9a-f-]{36}$/);

    createdTaskId = response.body.data.id;
    expect(response.body.meta.revision).toBe(String(Number(firstRevision) + 1));

    const { rows } = await pool.query<{
      title: string;
      status: string;
      area_id: string | null;
      project_id: string | null;
    }>('select title, status, area_id, project_id from tasks where id = $1', [createdTaskId]);

    expect(rows[0]).toEqual({
      title: '閱讀方法論文章',
      status: 'todo',
      area_id: null,
      project_id: null
    });

    const list = await agent.get('/api/v1/tasks');
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].id).toBe(createdTaskId);

    const single = await agent.get(`/api/v1/tasks/${createdTaskId}`);
    expect(single.status).toBe(200);
    expect(single.body.data.title).toBe('閱讀方法論文章');

    const inboxView = await agent.get('/api/v1/tasks?limit=10&offset=0');
    expect(inboxView.body.data).toHaveLength(1);
  });

  it('拒絕空白、超長、未知欄位與無效識別碼', async () => {
    const send = (body: Record<string, unknown>) =>
      agent
        .post('/api/v1/tasks')
        .set('Origin', config.publicOrigin)
        .set('X-CSRF-Token', csrfToken)
        .set('X-Workspace-Epoch', workspaceEpoch)
        .send(body);

    const empty = await send({ title: '   ' });
    expect(empty.status).toBe(400);
    expect(empty.body.error.fieldErrors.title).toBe('標題不可空白');

    const tooLong = await send({ title: '字'.repeat(201) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.fieldErrors.title).toBe('標題最多 200 字');

    const unknownField = await send({ title: '合法標題', status: 'done' });
    expect(unknownField.status).toBe(400);
    expect(unknownField.body.error.fieldErrors.status).toBeDefined();

    const invalidId = await agent.get('/api/v1/tasks/not-a-uuid');
    expect(invalidId.status).toBe(400);

    const missing = await agent.get('/api/v1/tasks/00000000-0000-4000-8000-000000000000');
    expect(missing.status).toBe(404);

    const { rows } = await pool.query<{ count: string }>(
      'select count(*)::text as count from tasks'
    );
    expect(rows[0]?.count).toBe('1');
  });

  it('列表參數受白名單限制', async () => {
    const tooMany = await agent.get('/api/v1/tasks?limit=201');
    expect(tooMany.status).toBe(400);

    const unknown = await agent.get('/api/v1/tasks?unknown=1');
    expect(unknown.status).toBe(400);
  });

  it('未知 API 回 404，不會落入 SPA 私人內容', async () => {
    const unknown = await agent.get('/api/v1/does-not-exist');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('NOT_FOUND');
    expect(unknown.headers['content-type']).toContain('application/json');
  });
});

describe('Session 失效與登入限流', () => {
  it('密碼雜湊變更後舊 Session 不可再讀取', async () => {
    const oldLogin = await login(app);
    const cookie = sessionCookieFrom(oldLogin.headers['set-cookie']);

    const changedConfig: AppConfig = {
      ...config,
      adminPasswordHash: await bcrypt.hash('changed-owner-password', 4)
    };
    const changedApp = createApp({
      config: changedConfig,
      pool,
      logger: { error: () => undefined }
    });

    const response = await request(changedApp).get('/api/v1/tasks').set('Cookie', cookie);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('連續失敗達上限後回 429', async () => {
    const limiter = new LoginRateLimiter({ maxFailures: 10 });
    const limitedApp = createApp({
      config,
      pool,
      limiter,
      logger: { error: () => undefined }
    });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await request(limitedApp)
        .post('/api/v1/auth/login')
        .set('Origin', config.publicOrigin)
        .send({ password: 'wrong-password' });
      expect(response.status).toBe(401);
    }

    const blocked = await request(limitedApp)
      .post('/api/v1/auth/login')
      .set('Origin', config.publicOrigin)
      .send({ password: OWNER_PASSWORD });

    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('登出後同一個 Session 不能再讀取', async () => {
    const logout = await agent
      .post('/api/v1/auth/logout')
      .set('Origin', config.publicOrigin)
      .set('X-CSRF-Token', csrfToken);
    expect(logout.status).toBe(200);

    const afterLogout = await agent.get('/api/v1/tasks');
    expect(afterLogout.status).toBe(401);
  });
});
