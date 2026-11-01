import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import type { BackupCountsDto, BackupPreviewDto } from '../../shared/api-types.js';
import { AREA_DEFINITIONS } from '../../shared/areas.js';
import { APP_TIMEZONE } from '../../shared/dates.js';
import type { AppConfig } from '../config.js';
import type { DbPool } from '../db/pool.js';
import { readWorkspaceState } from '../db/system-state.js';
import { AppError } from '../errors.js';
import { verifyPassword } from './auth.js';

export const BACKUP_FORMAT = 'personal-project-manager';
export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_MAX_BYTES = 20 * 1024 * 1024;
export const RESTORE_TOKEN_TTL_MS = 10 * 60 * 1000;
const APP_VERSION = '0.1.0';

export type BackupRow = Record<string, unknown>;
export type BackupData = Record<string, BackupRow[]>;

interface TableSpec {
  key: string;
  table: string;
  columns: string[];
  orderBy: string;
}

const TABLE_SPECS: TableSpec[] = [
  { key: 'areas', table: 'areas', columns: ['id', 'name', 'sort_order'], orderBy: 'id' },
  {
    key: 'projects',
    table: 'projects',
    columns: [
      'id', 'primary_area_id', 'title', 'description', 'kind', 'status', 'due_on', 'due_at',
      'due_timezone', 'next_step', 'tags', 'version', 'created_at', 'updated_at', 'archived_at'
    ],
    orderBy: 'id'
  },
  {
    key: 'tasks',
    table: 'tasks',
    columns: [
      'id', 'title', 'description', 'project_id', 'area_id', 'status', 'priority', 'planned_on',
      'due_on', 'due_at', 'due_timezone', 'follow_up_on', 'estimated_minutes', 'completed_at',
      'tags', 'version', 'created_at', 'updated_at', 'archived_at', 'contact_id', 'event_id'
    ],
    orderBy: 'id'
  },
  {
    key: 'course_details',
    table: 'course_details',
    columns: ['project_id', 'course_code', 'term', 'instructor_name'],
    orderBy: 'project_id'
  },
  {
    key: 'applications',
    table: 'applications',
    columns: [
      'project_id', 'application_type', 'organization_name', 'role_or_program', 'degree_level',
      'work_type', 'location', 'posting_url', 'portal_url', 'stage', 'outcome', 'applied_on',
      'receipt_verified', 'next_follow_up_on', 'notes'
    ],
    orderBy: 'project_id'
  },
  {
    key: 'application_stage_history',
    table: 'application_stage_history',
    columns: ['id', 'project_id', 'from_stage', 'to_stage', 'changed_at', 'note'],
    orderBy: 'id'
  },
  {
    key: 'focus_days',
    table: 'focus_days',
    columns: ['local_date', 'version', 'updated_at'],
    orderBy: 'local_date'
  },
  {
    key: 'daily_focus',
    table: 'daily_focus',
    columns: ['local_date', 'task_id', 'position'],
    orderBy: 'local_date, position'
  },
  {
    key: 'events',
    table: 'events',
    columns: [
      'id', 'title', 'description', 'primary_area_id', 'project_id', 'kind', 'location', 'url',
      'all_day', 'start_on', 'end_on', 'starts_at', 'ends_at', 'timezone', 'registration_status',
      'registration_due_on', 'registration_due_at', 'registration_due_timezone',
      'attendance_status', 'notes', 'tags', 'version', 'created_at', 'updated_at', 'archived_at'
    ],
    orderBy: 'id'
  },
  {
    key: 'contacts',
    table: 'contacts',
    columns: [
      'id', 'name', 'organization', 'role', 'email', 'phone', 'profile_url',
      'relationship_tags', 'how_met', 'notes', 'next_contact_on', 'version', 'created_at',
      'updated_at', 'archived_at'
    ],
    orderBy: 'id'
  },
  {
    key: 'interactions',
    table: 'interactions',
    columns: ['id', 'contact_id', 'occurred_at', 'kind', 'summary', 'project_id', 'event_id', 'created_at', 'updated_at'],
    orderBy: 'id'
  },
  { key: 'project_related_areas', table: 'project_related_areas', columns: ['project_id', 'area_id'], orderBy: 'project_id, area_id' },
  { key: 'project_contacts', table: 'project_contacts', columns: ['project_id', 'contact_id'], orderBy: 'project_id, contact_id' },
  { key: 'event_related_areas', table: 'event_related_areas', columns: ['event_id', 'area_id'], orderBy: 'event_id, area_id' },
  { key: 'event_contacts', table: 'event_contacts', columns: ['event_id', 'contact_id'], orderBy: 'event_id, contact_id' },
  {
    key: 'resources',
    table: 'resources',
    columns: ['id', 'title', 'kind', 'target', 'version_label', 'notes', 'tags', 'version', 'created_at', 'updated_at', 'archived_at'],
    orderBy: 'id'
  },
  {
    key: 'resource_links',
    table: 'resource_links',
    columns: ['id', 'resource_id', 'project_id', 'task_id', 'event_id', 'contact_id'],
    orderBy: 'id'
  },
  {
    key: 'habits',
    table: 'habits',
    columns: ['id', 'title', 'description', 'schedule_type', 'weekdays', 'start_on', 'end_on', 'version', 'created_at', 'updated_at', 'archived_at'],
    orderBy: 'id'
  },
  {
    key: 'habit_entries',
    table: 'habit_entries',
    columns: ['habit_id', 'local_date', 'status', 'note'],
    orderBy: 'habit_id, local_date'
  },
  {
    key: 'health_entries',
    table: 'health_entries',
    columns: ['id', 'local_date', 'kind', 'activity_name', 'duration_minutes', 'sleep_hours', 'note', 'version', 'created_at', 'updated_at'],
    orderBy: 'id'
  },
  { key: 'app_settings', table: 'app_settings', columns: ['id', 'locale', 'timezone', 'week_starts_on'], orderBy: 'id' }
];

const TABLE_BY_KEY = new Map(TABLE_SPECS.map((spec) => [spec.key, spec]));

const DELETE_ORDER = [
  'resource_links',
  'resources',
  'daily_focus',
  'focus_days',
  'habit_entries',
  'habits',
  'health_entries',
  'interactions',
  'event_contacts',
  'event_related_areas',
  'project_contacts',
  'project_related_areas',
  'tasks',
  'application_stage_history',
  'applications',
  'course_details',
  'events',
  'contacts',
  'projects'
];

const INSERT_ORDER = [
  'projects',
  'course_details',
  'applications',
  'application_stage_history',
  'events',
  'contacts',
  'interactions',
  'tasks',
  'focus_days',
  'daily_focus',
  'project_related_areas',
  'project_contacts',
  'event_related_areas',
  'event_contacts',
  'resources',
  'resource_links',
  'habits',
  'habit_entries',
  'health_entries'
];

const rowSchema = z.record(z.string(), z.unknown());

const backupPayloadSchema = z
  .strictObject({
    format: z.literal(BACKUP_FORMAT),
    schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
    exportedAt: z.string().min(1),
    appVersion: z.string().min(1).max(100),
    timezone: z.literal(APP_TIMEZONE),
    data: z.strictObject(
      Object.fromEntries(TABLE_SPECS.map((spec) => [spec.key, z.array(rowSchema)])) as Record<
        string,
        z.ZodArray<typeof rowSchema>
      >
    )
  })
  .strict();

export interface BackupPayload {
  format: typeof BACKUP_FORMAT;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  appVersion: string;
  timezone: typeof APP_TIMEZONE;
  data: BackupData;
}

export function parseBackupBuffer(raw: Buffer): BackupPayload {
  if (raw.length > BACKUP_MAX_BYTES) {
    throw new AppError(413, 'BACKUP_TOO_LARGE', '備份檔不可超過 20MB');
  }
  if (raw.length === 0) {
    throw new AppError(400, 'EMPTY_BACKUP', '備份檔是空的');
  }

  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch {
    throw new AppError(400, 'INVALID_BACKUP', '備份檔必須是 UTF-8 JSON');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded.replace(/^\uFEFF/, ''));
  } catch {
    throw new AppError(400, 'INVALID_BACKUP_JSON', '備份檔不是有效 JSON');
  }

  const result = backupPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new AppError(
      400,
      'INVALID_BACKUP',
      `備份格式不正確：${result.error.issues[0]?.message ?? '未知錯誤'}`
    );
  }

  return result.data as BackupPayload;
}

function assertAreasAndSettings(data: BackupData): void {
  const areas = data.areas ?? [];
  const expectedAreas = new Map(AREA_DEFINITIONS.map((area) => [area.id, area]));
  if (areas.length !== expectedAreas.size) {
    throw new AppError(400, 'INVALID_BACKUP_AREAS', '備份缺少固定的七個領域');
  }
  const seen = new Set<string>();
  for (const area of areas) {
    const id = typeof area.id === 'string' ? area.id : '';
    const definition = expectedAreas.get(id as never);
    if (
      !definition ||
      seen.has(id) ||
      area.name !== definition.name ||
      Number(area.sort_order) !== definition.sortOrder
    ) {
      throw new AppError(400, 'INVALID_BACKUP_AREAS', '備份的領域資料不正確');
    }
    seen.add(id);
  }

  const settings = data.app_settings ?? [];
  if (
    settings.length !== 1 ||
    settings[0]?.id !== 1 ||
    settings[0]?.locale !== 'zh-HK' ||
    settings[0]?.timezone !== APP_TIMEZONE ||
    Number(settings[0]?.week_starts_on) !== 1
  ) {
    throw new AppError(400, 'INVALID_BACKUP_SETTINGS', '備份的設定必須是固定香港設定');
  }
}

function assertRowsShape(data: BackupData): void {
  for (const spec of TABLE_SPECS) {
    const rows = data[spec.key];
    if (!rows) {
      throw new AppError(400, 'INVALID_BACKUP', `備份缺少 ${spec.key}`);
    }
    for (const [index, row] of rows.entries()) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        throw new AppError(400, 'INVALID_BACKUP', `${spec.key} 第 ${index + 1} 筆格式不正確`);
      }
      const keys = Object.keys(row);
      if (keys.length !== spec.columns.length || spec.columns.some((column) => !(column in row))) {
        throw new AppError(400, 'INVALID_BACKUP', `${spec.key} 第 ${index + 1} 筆欄位不完整`);
      }
      for (const key of keys) {
        if (!spec.columns.includes(key)) {
          throw new AppError(400, 'INVALID_BACKUP', `${spec.key} 含有未支援的欄位 ${key}`);
        }
      }
    }
  }
  assertAreasAndSettings(data);
}

async function exportData(client: PoolClient): Promise<BackupData> {
  const data: BackupData = {};
  for (const spec of TABLE_SPECS) {
    const { rows } = await client.query<{ rows: BackupRow[] }>(
      `select coalesce(json_agg(t order by ${spec.orderBy}), '[]'::json) as rows
         from ${spec.table} t`
    );
    data[spec.key] = rows[0]?.rows ?? [];
  }
  return data;
}

async function replaceBusinessData(
  client: PoolClient,
  data: BackupData,
  onStage?: (stage: 'afterDelete' | 'duringInsert') => void
): Promise<void> {
  for (const key of DELETE_ORDER) {
    const spec = TABLE_BY_KEY.get(key);
    if (!spec) throw new Error(`missing backup table ${key}`);
    await client.query(`delete from ${spec.table}`);
  }
  onStage?.('afterDelete');

  for (const key of INSERT_ORDER) {
    const spec = TABLE_BY_KEY.get(key);
    if (!spec) throw new Error(`missing backup table ${key}`);
    const rows = data[key] ?? [];
    for (const row of rows) {
      const placeholders = spec.columns.map((_column, index) => `$${index + 1}`).join(', ');
      await client.query(
        `insert into ${spec.table} (${spec.columns.join(', ')}) values (${placeholders})`,
        spec.columns.map((column) => row[column])
      );
      if (key === 'tasks') {
        onStage?.('duringInsert');
      }
    }
  }
}

async function countCurrent(db: DbPool | PoolClient): Promise<BackupCountsDto> {
  const { rows } = await db.query<BackupCountsDto>(
    `select
       (select count(*)::int from areas) as "areas",
       (select count(*)::int from projects) as "projects",
       (select count(*)::int from tasks) as "tasks",
       (select count(*)::int from events) as "events",
       (select count(*)::int from contacts) as "contacts",
       (select count(*)::int from resources) as "resources",
       (select count(*)::int from habits) as "habits",
       (select count(*)::int from health_entries) as "healthEntries",
       (select count(*)::int from course_details) as "courseDetails",
       (select count(*)::int from applications) as "applications",
       (select count(*)::int from application_stage_history) as "applicationStageHistory",
       (select count(*)::int from focus_days) as "focusDays",
       (select count(*)::int from interactions) as "interactions",
       (select count(*)::int from project_related_areas) as "projectRelatedAreas",
       (select count(*)::int from project_contacts) as "projectContacts",
       (select count(*)::int from event_related_areas) as "eventRelatedAreas",
       (select count(*)::int from event_contacts) as "eventContacts",
       (select count(*)::int from resource_links) as "resourceLinks",
       (select count(*)::int from habit_entries) as "habitEntries"`
  );
  return rows[0] ?? {
    areas: 0,
    projects: 0,
    tasks: 0,
    events: 0,
    contacts: 0,
    resources: 0,
    habits: 0,
    healthEntries: 0
  };
}

function countIncoming(data: BackupData): BackupCountsDto {
  return {
    areas: data.areas?.length ?? 0,
    projects: data.projects?.length ?? 0,
    tasks: data.tasks?.length ?? 0,
    events: data.events?.length ?? 0,
    contacts: data.contacts?.length ?? 0,
    resources: data.resources?.length ?? 0,
    habits: data.habits?.length ?? 0,
    healthEntries: data.health_entries?.length ?? 0,
    courseDetails: data.course_details?.length ?? 0,
    applications: data.applications?.length ?? 0,
    applicationStageHistory: data.application_stage_history?.length ?? 0,
    focusDays: data.focus_days?.length ?? 0,
    interactions: data.interactions?.length ?? 0,
    projectRelatedAreas: data.project_related_areas?.length ?? 0,
    projectContacts: data.project_contacts?.length ?? 0,
    eventRelatedAreas: data.event_related_areas?.length ?? 0,
    eventContacts: data.event_contacts?.length ?? 0,
    resourceLinks: data.resource_links?.length ?? 0,
    habitEntries: data.habit_entries?.length ?? 0
  };
}

export interface ExportResult {
  payload: BackupPayload;
  filename: string;
  revision: string;
  dataEpoch: string;
  tokenId: string | null;
}

function hongKongFilenameTimestamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);
  const value = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00';
  return `${value('year')}${value('month')}${value('day')}-${value('hour')}${value('minute')}${value('second')}`;
}

async function findToken(
  db: DbPool | PoolClient,
  token: string
): Promise<{ id: string; sessionId: string; revision: string; dataEpoch: string; expiresAt: Date; downloadedAt: Date | null; downloadedRevision: string | null; usedAt: Date | null; fileHash: string } | null> {
  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
  const { rows } = await db.query<{
    id: string;
    sessionId: string;
    revision: string;
    dataEpoch: string;
    expiresAt: Date;
    downloadedAt: Date | null;
    downloadedRevision: string | null;
    usedAt: Date | null;
    fileHash: string;
  }>(
    `select id, session_id as "sessionId", revision::text as revision,
            data_epoch as "dataEpoch", expires_at as "expiresAt",
            downloaded_at as "downloadedAt", downloaded_revision::text as "downloadedRevision",
            used_at as "usedAt", file_hash as "fileHash"
       from restore_tokens where token_hash = $1`,
    [tokenHash]
  );
  return rows[0] ?? null;
}

export async function exportBackup(
  pool: DbPool,
  sessionId: string,
  restoreToken?: string
): Promise<ExportResult> {
  let tokenId: string | null = null;
  const client = await pool.connect();
  try {
    await client.query('begin isolation level repeatable read read only');
    const state = await readWorkspaceState(client);

    if (restoreToken) {
      const token = await findToken(client, restoreToken);
      if (!token || token.sessionId !== sessionId || token.usedAt) {
        throw new AppError(409, 'RESTORE_TOKEN_INVALID', '還原預覽已失效，請重新預覽');
      }
      if (new Date(token.expiresAt).getTime() <= Date.now()) {
        throw new AppError(409, 'RESTORE_TOKEN_EXPIRED', '還原預覽已過期，請重新預覽');
      }
      if (token.revision !== state.revision || token.dataEpoch !== state.dataEpoch) {
        throw new AppError(409, 'RESTORE_PREVIEW_STALE', '預覽後資料已改變，請重新預覽');
      }
      tokenId = token.id;
    }

    const data = await exportData(client);
    const payload: BackupPayload = {
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      timezone: APP_TIMEZONE,
      data
    };
    await client.query('commit');
    return {
      payload,
      filename: `ppm-backup-${hongKongFilenameTimestamp()}.json`,
      revision: state.revision,
      dataEpoch: state.dataEpoch,
      tokenId
    };
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // ignore rollback failure
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function markTokenDownloaded(
  pool: DbPool,
  tokenId: string,
  revision: string
): Promise<void> {
  await pool.query(
    `update restore_tokens
        set downloaded_at = now(), downloaded_revision = $2
      where id = $1 and used_at is null`,
    [tokenId, revision]
  );
}

export async function createRestorePreview(
  pool: DbPool,
  sessionId: string,
  raw: Buffer
): Promise<BackupPreviewDto> {
  const parsed = parseBackupBuffer(raw);
  assertRowsShape(parsed.data);

  const client = await pool.connect();
  try {
    await client.query('begin');
    try {
      await replaceBusinessData(client, parsed.data);
    } catch (error) {
      throw new AppError(
        400,
        'INVALID_BACKUP_DATA',
        `備份資料未通過資料庫驗證：${error instanceof Error ? error.message : '未知錯誤'}`
      );
    }
    await client.query('rollback');
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // ignore
    }
    throw error;
  } finally {
    client.release();
  }

  const [state, current] = await Promise.all([readWorkspaceState(pool), countCurrent(pool)]);
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
  const expiresAt = new Date(Date.now() + RESTORE_TOKEN_TTL_MS);

  const client2 = await pool.connect();
  try {
    await client2.query('begin');
    await client2.query('delete from restore_tokens where session_id = $1 and used_at is null', [sessionId]);
    await client2.query(
      `insert into restore_tokens (token_hash, session_id, file_hash, revision, data_epoch, expires_at)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        tokenHash,
        sessionId,
        createHash('sha256').update(raw).digest('hex'),
        state.revision,
        state.dataEpoch,
        expiresAt
      ]
    );
    await client2.query('commit');
  } catch (error) {
    try {
      await client2.query('rollback');
    } catch {
      // ignore
    }
    throw error;
  } finally {
    client2.release();
  }

  return {
    token,
    fileHash: createHash('sha256').update(raw).digest('hex'),
    revision: state.revision,
    workspaceEpoch: state.dataEpoch,
    expiresAt: expiresAt.toISOString(),
    current,
    incoming: countIncoming(parsed.data)
  };
}

export interface RestoreResult {
  counts: BackupCountsDto;
  revision: string;
  dataEpoch: string;
}

export async function restoreBackup(
  pool: DbPool,
  config: AppConfig,
  sessionId: string,
  raw: Buffer,
  tokenValue: string,
  confirmText: string,
  password: string
): Promise<RestoreResult> {
  if (confirmText !== '還原') {
    throw new AppError(400, 'RESTORE_CONFIRMATION_REQUIRED', '請輸入「還原」以確認');
  }
  const passwordOk = await verifyPassword(password, config.adminPasswordHash);
  if (!passwordOk) {
    throw new AppError(403, 'INVALID_PASSWORD', '登入密碼不正確');
  }

  const parsed = parseBackupBuffer(raw);
  assertRowsShape(parsed.data);
  const fileHash = createHash('sha256').update(raw).digest('hex');
  const client = await pool.connect();

  try {
    await client.query('begin');
    const stateResult = await client.query<{ revision: string; dataEpoch: string }>(
      `select revision::text as revision, data_epoch as "dataEpoch"
         from system_state where id = 1 for update`
    );
    const state = stateResult.rows[0];
    if (!state) throw new AppError(503, 'WORKSPACE_NOT_READY', '資料庫尚未初始化');

    const token = await findToken(client, tokenValue);
    if (!token || token.sessionId !== sessionId || token.usedAt) {
      throw new AppError(409, 'RESTORE_TOKEN_INVALID', '還原預覽已失效，請重新預覽');
    }
    if (new Date(token.expiresAt).getTime() <= Date.now()) {
      throw new AppError(409, 'RESTORE_TOKEN_EXPIRED', '還原預覽已過期，請重新預覽');
    }
    if (
      token.fileHash !== fileHash ||
      token.revision !== state.revision ||
      token.dataEpoch !== state.dataEpoch
    ) {
      throw new AppError(409, 'RESTORE_PREVIEW_STALE', '預覽後資料或檔案已改變，請重新預覽');
    }
    if (!token.downloadedAt || token.downloadedRevision !== token.revision) {
      throw new AppError(409, 'CURRENT_BACKUP_REQUIRED', '請先下載目前資料備份，再確認還原');
    }

    try {
      const fault =
        config.nodeEnv === 'test' ? process.env.PPM_TEST_RESTORE_FAIL : undefined;
      const onStage =
        fault === 'afterDelete' || fault === 'duringInsert'
          ? (stage: 'afterDelete' | 'duringInsert'): void => {
              if (stage === fault) throw new Error(`test-only restore fault: ${stage}`);
            }
          : undefined;
      await replaceBusinessData(client, parsed.data, onStage);
      if (fault === 'beforeCommit') {
        throw new Error('test-only restore fault: beforeCommit');
      }
    } catch (error) {
      throw new AppError(
        400,
        'INVALID_BACKUP_DATA',
        `備份資料未能還原：${error instanceof Error ? error.message : '未知錯誤'}`
      );
    }

    const updated = await client.query<{ revision: string; dataEpoch: string }>(
      `update system_state
          set revision = revision + 1, data_epoch = gen_random_uuid()
        where id = 1
        returning revision::text as revision, data_epoch as "dataEpoch"`
    );
    const next = updated.rows[0];
    if (!next) throw new Error('system_state restore update returned no row');

    await client.query('update restore_tokens set used_at = now() where id = $1', [token.id]);
    await client.query('delete from restore_tokens where session_id = $1 and used_at is null', [sessionId]);
    await client.query('delete from sessions');
    await client.query('commit');

    return { counts: countIncoming(parsed.data), revision: next.revision, dataEpoch: next.dataEpoch };
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // ignore
    }
    throw error;
  } finally {
    client.release();
  }
}