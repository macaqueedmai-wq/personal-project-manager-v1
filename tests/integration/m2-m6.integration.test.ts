import path from 'node:path';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppConfig } from '../../server/config';
import { loadConfig } from '../../server/config';
import { createApp } from '../../server/app';
import { runMigrations } from '../../server/db/migrate';
import { createPool, type DbPool } from '../../server/db/pool';
import { addDays, toHongKongDate } from '../../shared/dates';
import { startTestDatabase, type TestDatabase } from '../helpers/testDatabase';

const OWNER_PASSWORD = 'm2-m6-test-password';
const MIGRATIONS_DIR = path.resolve(process.cwd(), 'migrations');

let database: TestDatabase;
let pool: DbPool;
let config: AppConfig;
let app: Express;
let agent: ReturnType<typeof request.agent>;
let csrfToken = '';
let epoch = '';
let generalProjectId = '';
let applicationProjectId = '';
let taskId = '';
let contactId = '';
let resourceId = '';
let eventId = '';

function authHeaders(): Record<string, string> {
  return {
    Origin: config.publicOrigin,
    'X-CSRF-Token': csrfToken,
    'X-Workspace-Epoch': epoch
  };
}

async function login(): Promise<void> {
  const response = await agent
    .post('/api/v1/auth/login')
    .set('Origin', config.publicOrigin)
    .send({ password: OWNER_PASSWORD });
  expect(response.status).toBe(200);
  const session = await agent.get('/api/v1/auth/session');
  expect(session.status).toBe(200);
  csrfToken = session.body.data.csrfToken;
  epoch = session.body.data.workspaceEpoch;
}

beforeAll(async () => {
  database = await startTestDatabase();
  pool = createPool(database.databaseUrl);
  await runMigrations(pool, MIGRATIONS_DIR);
  const adminPasswordHash = await bcrypt.hash(OWNER_PASSWORD, 4);
  config = loadConfig({
    NODE_ENV: 'test',
    PORT: '3000',
    DATABASE_URL: database.databaseUrl,
    PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
    ADMIN_PASSWORD_HASH: adminPasswordHash,
    SESSION_SECRET: 'm2-m6-integration-secret-0123456789',
    TRUST_PROXY_HOPS: '0'
  });
  app = createApp({ config, pool, logger: { error: () => undefined } });
  agent = request.agent(app);
  await login();
}, 120_000);

afterAll(async () => {
  await pool.end().catch(() => undefined);
  await database.stop();
});

describe('M2 項目、任務、每日重點及總覽', () => {
  it('建立項目及任務，並以版本控制更新', async () => {
    const project = await agent
      .post('/api/v1/projects')
      .set(authHeaders())
      .send({ primaryAreaId: 'study', title: 'M2 測試項目', kind: 'general' });
    expect(project.status).toBe(201);
    generalProjectId = project.body.data.id;

    const task = await agent
      .post('/api/v1/tasks')
      .set(authHeaders())
      .send({ title: 'M2 測試任務', projectId: generalProjectId, plannedOn: toHongKongDate() });
    expect(task.status).toBe(201);
    taskId = task.body.data.id;
    expect(task.body.data.projectTitle).toBe('M2 測試項目');

    const conflict = await agent
      .patch(`/api/v1/tasks/${taskId}`)
      .set(authHeaders())
      .send({ version: 999, title: '衝突' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('VERSION_CONFLICT');

    const updated = await agent
      .patch(`/api/v1/tasks/${taskId}`)
      .set(authHeaders())
      .send({ version: task.body.data.version, status: 'done' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.completedAt).toEqual(expect.any(String));
  });

  it('每日重點最多三項，總覽讀回今日任務', async () => {
    const today = toHongKongDate();
    const focusTask = await agent
      .post('/api/v1/tasks')
      .set(authHeaders())
      .send({ title: 'M2 重點任務', projectId: generalProjectId, plannedOn: today });
    expect(focusTask.status).toBe(201);
    const focusTaskId = focusTask.body.data.id;

    const focus = await agent
      .put(`/api/v1/focus/${today}`)
      .set(authHeaders())
      .send({ taskIds: [focusTaskId], version: 0 });
    expect(focus.status).toBe(200);
    expect(focus.body.data.tasks[0].id).toBe(focusTaskId);

    const dashboard = await agent.get('/api/v1/dashboard');
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.focus[0].id).toBe(focusTaskId);
    expect(dashboard.body.data.today).toBe(today);
  });
});

describe('M3 申請階段與歷史', () => {
  it('建立申請及更新階段，保留歷史', async () => {
    const project = await agent
      .post('/api/v1/projects')
      .set(authHeaders())
      .send({
        primaryAreaId: 'degree',
        title: 'M3 申請項目',
        kind: 'degree_application',
        application: {
          applicationType: 'degree',
          organizationName: '測試大學',
          roleOrProgram: '測試碩士',
          degreeLevel: 'master'
        }
      });
    expect(project.status).toBe(201);
    applicationProjectId = project.body.data.id;
    expect(project.body.data.application.stage).toBe('exploring');

    const stage = await agent
      .patch(`/api/v1/projects/${applicationProjectId}/application`)
      .set(authHeaders())
      .send({ version: project.body.data.version, stage: 'preparing' });
    expect(stage.status).toBe(200);
    expect(stage.body.data.stage).toBe('preparing');

    const history = await agent.get(`/api/v1/projects/${applicationProjectId}/application/history`);
    expect(history.status).toBe(200);
    expect(history.body.data.length).toBeGreaterThanOrEqual(2);
    expect(history.body.data.at(-1).toStage).toBe('preparing');
  });
});

describe('M4 活動、人物、文件與日曆', () => {
  it('建立活動及關聯人物', async () => {
    const contact = await agent
      .post('/api/v1/contacts')
      .set(authHeaders())
      .send({ name: 'M4 測試人物', organization: '測試機構', nextContactOn: toHongKongDate() });
    expect(contact.status).toBe(201);
    contactId = contact.body.data.id;

    const event = await agent
      .post('/api/v1/events')
      .set(authHeaders())
      .send({
        title: 'M4 測試活動',
        primaryAreaId: 'social',
        kind: 'meeting',
        allDay: false,
        startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        timezone: 'Asia/Hong_Kong',
        location: '測試地點'
      });
    expect(event.status).toBe(201);
    eventId = event.body.data.id;

    const linked = await agent
      .put(`/api/v1/events/${eventId}/contacts`)
      .set(authHeaders())
      .send({ version: event.body.data.version, contactIds: [contactId] });
    expect(linked.status).toBe(200);
    expect(linked.body.data.contactIds).toEqual([contactId]);

    const interaction = await agent
      .post(`/api/v1/contacts/${contactId}/interactions`)
      .set(authHeaders())
      .send({ occurredAt: new Date().toISOString(), kind: 'meeting', summary: '第一次會面' });
    expect(interaction.status).toBe(201);
    const timeline = await agent.get(`/api/v1/contacts/${contactId}/interactions`);
    expect(timeline.body.data[0].summary).toBe('第一次會面');
  });

  it('文件連結驗證 web_link 協定並可關聯多個實體', async () => {
    const invalid = await agent
      .post('/api/v1/resources')
      .set(authHeaders())
      .send({ title: '危險連結', kind: 'web_link', target: 'javascript:alert(1)' });
    expect(invalid.status).toBe(400);

    const resource = await agent
      .post('/api/v1/resources')
      .set(authHeaders())
      .send({ title: 'M4 文件', kind: 'local_path', target: 'C:\\Example\\CV.pdf' });
    expect(resource.status).toBe(201);
    resourceId = resource.body.data.id;

    const first = await agent
      .post(`/api/v1/resources/${resourceId}/links`)
      .set(authHeaders())
      .send({ version: resource.body.data.version, projectId: generalProjectId });
    expect(first.status).toBe(201);
    const second = await agent
      .post(`/api/v1/resources/${resourceId}/links`)
      .set(authHeaders())
      .send({ version: resource.body.data.version + 1, taskId });
    expect(second.status).toBe(201);
  });

  it('日曆合併活動及聯絡提醒', async () => {
    const today = toHongKongDate();
    const calendar = await agent.get(`/api/v1/calendar?from=${today}&to=${today}`);
    expect(calendar.status).toBe(200);
    const keys = calendar.body.data.map((item: { sourceType: string }) => item.sourceType);
    expect(keys).toContain('event');
    expect(keys).toContain('contact');
  });
});

describe('M5 習慣、健康與搜尋', () => {
  it('習慣打卡冪等、未來日期被拒絕，健康睡眠唯一', async () => {
    const tomorrowDate = addDays(toHongKongDate(), 1);

    const habit = await agent
      .post('/api/v1/habits')
      .set(authHeaders())
      .send({ title: 'M5 每週習慣', scheduleType: 'weekly', weekdays: [1, 3, 5], startOn: toHongKongDate() });
    expect(habit.status).toBe(201);
    const habitId = habit.body.data.id;

    const first = await agent
      .put(`/api/v1/habits/${habitId}/entries/${toHongKongDate()}`)
      .set(authHeaders())
      .send({ status: 'done' });
    expect(first.status).toBe(200);
    const duplicate = await agent
      .put(`/api/v1/habits/${habitId}/entries/${toHongKongDate()}`)
      .set(authHeaders())
      .send({ status: 'done' });
    expect(duplicate.status).toBe(200);

    const future = await agent
      .put(`/api/v1/habits/${habitId}/entries/${tomorrowDate}`)
      .set(authHeaders())
      .send({ status: 'done' });
    expect(future.status).toBe(400);

    const { rows } = await pool.query<{ count: string }>(
      'select count(*)::text as count from habit_entries where habit_id = $1',
      [habitId]
    );
    expect(rows[0]?.count).toBe('1');

    const exercise = await agent
      .post('/api/v1/health-entries')
      .set(authHeaders())
      .send({ localDate: toHongKongDate(), kind: 'exercise', durationMinutes: 30, activityName: '跑步' });
    expect(exercise.status).toBe(201);

    const sleep = await agent
      .post('/api/v1/health-entries')
      .set(authHeaders())
      .send({ localDate: toHongKongDate(), kind: 'sleep', sleepHours: 7.5 });
    expect(sleep.status).toBe(201);
    const secondSleep = await agent
      .post('/api/v1/health-entries')
      .set(authHeaders())
      .send({ localDate: toHongKongDate(), kind: 'sleep', sleepHours: 8 });
    expect(secondSleep.status).toBe(409);
    expect(secondSleep.body.error.code).toBe('SLEEP_ENTRY_EXISTS');

    const found = await agent.get('/api/v1/search?q=M4');
    expect(found.status).toBe(200);
    expect(found.body.data.length).toBeGreaterThan(0);
  });
});

describe('M6 備份匯出、預覽及還原', () => {
  let exported: Record<string, unknown>;
  let restoreToken = '';

  it('匯出包含所有業務資料及排除系統秘密', async () => {
    const response = await agent.get('/api/v1/backup/export');
    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toContain('ppm-backup-');
    exported = response.body as Record<string, unknown>;
    expect(exported.format).toBe('personal-project-manager');
    expect(exported.schemaVersion).toBe(1);
    const data = exported.data as Record<string, unknown[]>;
    expect(data.projects?.length).toBeGreaterThanOrEqual(2);
    expect(data.tasks?.length).toBeGreaterThanOrEqual(1);
    expect(data.focus_days?.length).toBeGreaterThanOrEqual(1);
    expect(data.habit_entries?.length).toBeGreaterThanOrEqual(1);
    expect(data.app_settings).toHaveLength(1);
    expect(data.sessions).toBeUndefined();
    expect(data.restore_tokens).toBeUndefined();
  });

  it('有效預覽、下載現況及還原後清除 Session', async () => {
    const preRestoreEpoch = epoch;
    const preview = await agent
      .post('/api/v1/backup/preview')
      .set(authHeaders())
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(exported));
    expect(preview.status).toBe(201);
    restoreToken = preview.body.data.token;
    expect(preview.body.data.incoming.projects).toBeGreaterThanOrEqual(2);

    const download = await agent.get(
      `/api/v1/backup/export?restoreToken=${encodeURIComponent(restoreToken)}`
    );
    expect(download.status).toBe(200);

    const restore = await agent
      .post('/api/v1/backup/restore')
      .set('Origin', config.publicOrigin)
      .set('X-CSRF-Token', csrfToken)
      .field('token', restoreToken)
      .field('confirmText', '還原')
      .field('password', OWNER_PASSWORD)
      .attach('file', Buffer.from(JSON.stringify(exported)), {
        filename: 'backup.json',
        contentType: 'application/json'
      });
    expect(restore.status).toBe(200);
    expect(restore.body.data.restored).toBe(true);

    const oldSession = await agent.get('/api/v1/tasks');
    expect(oldSession.status).toBe(401);

    agent = request.agent(app);
    await login();
    const projects = await agent.get('/api/v1/projects?limit=200');
    expect(projects.status).toBe(200);
    expect(projects.body.data.length).toBeGreaterThanOrEqual(2);

    const staleEpochWrite = await agent
      .post('/api/v1/tasks')
      .set('Origin', config.publicOrigin)
      .set('X-CSRF-Token', csrfToken)
      .set('X-Workspace-Epoch', preRestoreEpoch)
      .send({ title: '還原前舊分頁不應寫入' });
    expect(staleEpochWrite.status).toBe(409);
    expect(staleEpochWrite.body.error.code).toBe('WORKSPACE_CHANGED');
  }, 60_000);

  it('損壞備份不改資料及 revision', async () => {
    const before = await pool.query<{ revision: string }>(
      'select revision::text as revision from system_state where id = 1'
    );
    const response = await agent
      .post('/api/v1/backup/preview')
      .set(authHeaders())
      .set('Content-Type', 'application/json')
      .send('{not-json');
    expect(response.status).toBe(400);
    const after = await pool.query<{ revision: string }>(
      'select revision::text as revision from system_state where id = 1'
    );
    expect(after.rows[0]?.revision).toBe(before.rows[0]?.revision);
  });

  it('未知版本、缺少固定領域及重複 ID 均在預覽被拒絕', async () => {
    const revisionBefore = await pool.query<{ revision: string }>(
      'select revision::text as revision from system_state where id = 1'
    );

    const unknownVersion = { ...exported, schemaVersion: 2 };
    const versionResponse = await agent
      .post('/api/v1/backup/preview')
      .set(authHeaders())
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(unknownVersion));
    expect(versionResponse.status).toBe(400);

    const missingAreas = structuredClone(exported);
    (missingAreas.data as Record<string, unknown[]>).areas = [];
    const areasResponse = await agent
      .post('/api/v1/backup/preview')
      .set(authHeaders())
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(missingAreas));
    expect(areasResponse.status).toBe(400);

    const duplicate = structuredClone(exported);
    const duplicateData = duplicate.data as Record<string, unknown[]>;
    const projects = duplicateData.projects ?? [];
    if (projects.length > 0) duplicateData.projects = [...projects, structuredClone(projects[0])];
    const duplicateResponse = await agent
      .post('/api/v1/backup/preview')
      .set(authHeaders())
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(duplicate));
    expect(duplicateResponse.status).toBe(400);

    const revisionAfter = await pool.query<{ revision: string }>(
      'select revision::text as revision from system_state where id = 1'
    );
    expect(revisionAfter.rows[0]?.revision).toBe(revisionBefore.rows[0]?.revision);
  });

  it('新資料庫完整還原往返保留所有業務資料', async () => {
    const targetDatabase = await startTestDatabase();
    const targetPool = createPool(targetDatabase.databaseUrl);
    try {
      await runMigrations(targetPool, MIGRATIONS_DIR);
      const targetApp = createApp({
        config,
        pool: targetPool,
        logger: { error: () => undefined }
      });
      let targetAgent = request.agent(targetApp);
      const targetLogin = await targetAgent
        .post('/api/v1/auth/login')
        .set('Origin', config.publicOrigin)
        .send({ password: OWNER_PASSWORD });
      expect(targetLogin.status).toBe(200);
      const targetSession = await targetAgent.get('/api/v1/auth/session');
      const targetCsrf = targetSession.body.data.csrfToken;
      const targetEpoch = targetSession.body.data.workspaceEpoch;
      const fileText = JSON.stringify(exported);

      const preview = await targetAgent
        .post('/api/v1/backup/preview')
        .set('Origin', config.publicOrigin)
        .set('X-CSRF-Token', targetCsrf)
        .set('X-Workspace-Epoch', targetEpoch)
        .set('Content-Type', 'application/json')
        .send(fileText);
      expect(preview.status).toBe(201);
      const token = preview.body.data.token;
      const download = await targetAgent.get(`/api/v1/backup/export?restoreToken=${encodeURIComponent(token)}`);
      expect(download.status).toBe(200);

      const restore = await targetAgent
        .post('/api/v1/backup/restore')
        .set('Origin', config.publicOrigin)
        .set('X-CSRF-Token', targetCsrf)
        .field('token', token)
        .field('confirmText', '還原')
        .field('password', OWNER_PASSWORD)
        .attach('file', Buffer.from(fileText), { filename: 'backup.json', contentType: 'application/json' });
      expect(restore.status).toBe(200);

      targetAgent = request.agent(targetApp);
      await targetAgent
        .post('/api/v1/auth/login')
        .set('Origin', config.publicOrigin)
        .send({ password: OWNER_PASSWORD });
      const targetExport = await targetAgent.get('/api/v1/backup/export');
      expect(targetExport.status).toBe(200);
      expect(targetExport.body.data).toEqual((exported as { data: unknown }).data);
      expect(targetExport.body.data.sessions).toBeUndefined();
    } finally {
      await targetPool.end().catch(() => undefined);
      await targetDatabase.stop();
    }
  }, 120_000);

  it('測試專用故障注入在刪除後、插入中及提交前全部 rollback', async () => {    const exportedNow = await agent.get('/api/v1/backup/export');
    const fileText = JSON.stringify(exportedNow.body);
    const preview = await agent
      .post('/api/v1/backup/preview')
      .set(authHeaders())
      .set('Content-Type', 'application/json')
      .send(fileText);
    expect(preview.status).toBe(201);
    const token = preview.body.data.token;
    const download = await agent.get(`/api/v1/backup/export?restoreToken=${encodeURIComponent(token)}`);
    expect(download.status).toBe(200);

    const snapshotCounts = async (): Promise<string> => {
      const { rows } = await pool.query<{ value: string }>(
        `select concat(
          (select count(*) from projects), ':', (select count(*) from tasks), ':',
          (select count(*) from habit_entries), ':', (select count(*) from focus_days)
        ) as value`
      );
      return rows[0]?.value ?? '';
    };
    const before = await snapshotCounts();

    const otherAgent = request.agent(app);
    await otherAgent
      .post('/api/v1/auth/login')
      .set('Origin', config.publicOrigin)
      .send({ password: OWNER_PASSWORD });
    const otherSession = await otherAgent.get('/api/v1/auth/session');
    const otherToken = otherSession.body.data.csrfToken;
    const otherEpoch = otherSession.body.data.workspaceEpoch;
    const otherSessionRestore = await otherAgent
      .post('/api/v1/backup/restore')
      .set('Origin', config.publicOrigin)
      .set('X-CSRF-Token', otherToken)
      .set('X-Workspace-Epoch', otherEpoch)
      .field('token', token)
      .field('confirmText', '還原')
      .field('password', OWNER_PASSWORD)
      .attach('file', Buffer.from(fileText), { filename: 'backup.json', contentType: 'application/json' });
    expect(otherSessionRestore.status).toBe(409);
    expect(await snapshotCounts()).toBe(before);

    const wrongPassword = await agent
      .post('/api/v1/backup/restore')
      .set('Origin', config.publicOrigin)
      .set('X-CSRF-Token', csrfToken)
      .field('token', token)
      .field('confirmText', '還原')
      .field('password', 'wrong-restore-password')
      .attach('file', Buffer.from(fileText), { filename: 'backup.json', contentType: 'application/json' });
    expect(wrongPassword.status).toBe(403);

    const wrongConfirmation = await agent
      .post('/api/v1/backup/restore')
      .set('Origin', config.publicOrigin)
      .set('X-CSRF-Token', csrfToken)
      .field('token', token)
      .field('confirmText', '確認')
      .field('password', OWNER_PASSWORD)
      .attach('file', Buffer.from(fileText), { filename: 'backup.json', contentType: 'application/json' });
    expect(wrongConfirmation.status).toBe(400);

    const tampered = fileText.replace('M2 測試項目', 'M2 被篡改');
    const tamperedFile = await agent
      .post('/api/v1/backup/restore')
      .set('Origin', config.publicOrigin)
      .set('X-CSRF-Token', csrfToken)
      .field('token', token)
      .field('confirmText', '還原')
      .field('password', OWNER_PASSWORD)
      .attach('file', Buffer.from(tampered), { filename: 'backup.json', contentType: 'application/json' });
    expect(tamperedFile.status).toBe(409);
    expect(await snapshotCounts()).toBe(before);

    for (const fault of ['afterDelete', 'duringInsert', 'beforeCommit']) {
      process.env.PPM_TEST_RESTORE_FAIL = fault;
      const failed = await agent
        .post('/api/v1/backup/restore')
        .set('Origin', config.publicOrigin)
        .set('X-CSRF-Token', csrfToken)
        .field('token', token)
        .field('confirmText', '還原')
        .field('password', OWNER_PASSWORD)
        .attach('file', Buffer.from(fileText), { filename: 'backup.json', contentType: 'application/json' });
      expect(failed.status).not.toBe(200);
      expect(await snapshotCounts()).toBe(before);
    }

    delete process.env.PPM_TEST_RESTORE_FAIL;
    const successful = await agent
      .post('/api/v1/backup/restore')
      .set('Origin', config.publicOrigin)
      .set('X-CSRF-Token', csrfToken)
      .field('token', token)
      .field('confirmText', '還原')
      .field('password', OWNER_PASSWORD)
      .attach('file', Buffer.from(fileText), { filename: 'backup.json', contentType: 'application/json' });
    expect(successful.status).toBe(200);
  }, 60_000);
});