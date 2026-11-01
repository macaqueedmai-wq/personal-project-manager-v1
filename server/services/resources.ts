import type { ResourceDto, ResourceLinkDto } from '../../shared/api-types.js';
import type {
  ResourceInput,
  ResourceLinkInput,
  ResourceListQuery,
  ResourceUpdateInput
} from '../../shared/schemas.js';
import type { DbPool } from '../db/pool.js';
import { withWorkspaceWrite } from '../db/system-state.js';
import { AppError } from '../errors.js';

const RESOURCE_SELECT = `
  select id, title, kind, target, version_label as "versionLabel", notes, tags, version,
         created_at as "createdAt", updated_at as "updatedAt", archived_at as "archivedAt"
    from resources
`;

const LINK_SELECT = `
  select id, resource_id as "resourceId", project_id as "projectId", task_id as "taskId",
         event_id as "eventId", contact_id as "contactId"
    from resource_links
`;

export async function listResources(
  pool: DbPool,
  query: ResourceListQuery
): Promise<{ items: ResourceDto[]; total: number }> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (query.archived === 'exclude') where.push('archived_at is null');
  if (query.archived === 'only') where.push('archived_at is not null');
  if (query.q) {
    values.push(`%${query.q}%`);
    where.push(`(title ilike $${values.length} or notes ilike $${values.length} or target ilike $${values.length})`);
  }
  if (query.kind) {
    values.push(query.kind);
    where.push(`kind = $${values.length}`);
  }
  const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';
  const itemValues = [...values, query.limit, query.offset];
  const [items, count] = await Promise.all([
    pool.query<ResourceDto>(
      `${RESOURCE_SELECT} ${whereSql} order by updated_at desc limit $${itemValues.length - 1} offset $${itemValues.length}`,
      itemValues
    ),
    pool.query<{ count: string }>(
      `select count(*)::text as count from resources ${whereSql}`,
      values
    )
  ]);
  return { items: items.rows, total: Number(count.rows[0]?.count ?? '0') };
}

export async function getResource(pool: DbPool, id: string): Promise<ResourceDto | null> {
  const { rows } = await pool.query<ResourceDto>(`${RESOURCE_SELECT} where id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createResource(
  pool: DbPool,
  input: ResourceInput,
  workspaceEpoch: string
): Promise<{ resource: ResourceDto; revision: string }> {
  const { value: id, revision } = await withWorkspaceWrite(pool, workspaceEpoch, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `insert into resources (title, kind, target, version_label, notes, tags)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [input.title, input.kind, input.target, input.versionLabel, input.notes, input.tags ?? []]
    );
    const newId = rows[0]?.id;
    if (!newId) throw new Error('insert into resources returned no row');
    return newId;
  });
  const resource = await getResource(pool, id);
  if (!resource) throw new Error('created resource could not be read back');
  return { resource, revision };
}

export async function updateResource(
  pool: DbPool,
  resourceId: string,
  input: ResourceUpdateInput,
  workspaceEpoch: string
): Promise<{ resource: ResourceDto; revision: string }> {
  const { revision } = await withWorkspaceWrite(pool, workspaceEpoch, async (client) => {
    const { rows } = await client.query<ResourceDto>(`${RESOURCE_SELECT} where id = $1 for update`, [
      resourceId
    ]);
    const current = rows[0];
    if (!current) throw new AppError(404, 'RESOURCE_NOT_FOUND', '找不到這份文件連結');
    if (current.version !== input.version) {
      throw new AppError(409, 'VERSION_CONFLICT', '資料已更新，請重新載入');
    }

    const nextKind = input.kind ?? current.kind;
    const nextTarget = input.target ?? current.target;
    if (nextKind === 'web_link' && !/^https?:\/\//i.test(nextTarget)) {
      throw new AppError(400, 'INVALID_RESOURCE_TARGET', '網頁連結只接受 http 或 https', {
        target: '網頁連結只接受 http 或 https'
      });
    }

    const columns: Record<string, string> = {
      title: 'title',
      kind: 'kind',
      target: 'target',
      versionLabel: 'version_label',
      notes: 'notes',
      tags: 'tags',
      archivedAt: 'archived_at'
    };
    const patch: Record<string, unknown> = {};
    for (const key of ['title', 'kind', 'target', 'versionLabel', 'notes', 'tags'] as const) {
      if (Object.hasOwn(input, key)) patch[key] = input[key];
    }
    if (input.archived !== undefined) {
      patch.archivedAt = input.archived ? new Date().toISOString() : null;
    }
    if (Object.keys(patch).length === 0) {
      throw new AppError(400, 'EMPTY_UPDATE', '沒有任何變更');
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    for (const [key, column] of Object.entries(columns)) {
      if (Object.hasOwn(patch, key)) {
        values.push(patch[key]);
        sets.push(`${column} = $${index}`);
        index += 1;
      }
    }
    sets.push('version = version + 1', 'updated_at = now()');
    values.push(resourceId, input.version);
    const result = await client.query(
      `update resources set ${sets.join(', ')} where id = $${index} and version = $${index + 1}`,
      values
    );
    if (result.rowCount === 0) {
      throw new AppError(409, 'VERSION_CONFLICT', '資料已更新，請重新載入');
    }
  });
  const resource = await getResource(pool, resourceId);
  if (!resource) throw new Error('updated resource could not be read back');
  return { resource, revision };
}

export async function listResourceLinks(
  pool: DbPool,
  resourceId: string
): Promise<ResourceLinkDto[]> {
  const resource = await getResource(pool, resourceId);
  if (!resource) throw new AppError(404, 'RESOURCE_NOT_FOUND', '找不到這份文件連結');
  const { rows } = await pool.query<ResourceLinkDto>(
    `${LINK_SELECT} where resource_id = $1 order by id`,
    [resourceId]
  );
  return rows;
}

async function assertLinkTarget(
  client: import('pg').PoolClient,
  input: ResourceLinkInput
): Promise<void> {
  const checks: Array<[string | null | undefined, string]> = [
    [input.projectId, 'projects'],
    [input.taskId, 'tasks'],
    [input.eventId, 'events'],
    [input.contactId, 'contacts']
  ];
  for (const [id, table] of checks) {
    if (id) {
      const result = await client.query(`select 1 from ${table} where id = $1`, [id]);
      if (result.rowCount === 0) {
        throw new AppError(400, 'LINK_TARGET_NOT_FOUND', '關聯對象不存在');
      }
    }
  }
}

export async function addResourceLink(
  pool: DbPool,
  resourceId: string,
  input: ResourceLinkInput,
  workspaceEpoch: string
): Promise<{ link: ResourceLinkDto; revision: string }> {
  const { value, revision } = await withWorkspaceWrite(pool, workspaceEpoch, async (client) => {
    const { rows } = await client.query<{ version: number }>(
      'select version from resources where id = $1 for update',
      [resourceId]
    );
    const current = rows[0];
    if (!current) throw new AppError(404, 'RESOURCE_NOT_FOUND', '找不到這份文件連結');
    if (current.version !== input.version) {
      throw new AppError(409, 'VERSION_CONFLICT', '資料已更新，請重新載入');
    }
    await assertLinkTarget(client, input);
    const link = await client.query<ResourceLinkDto>(
      `insert into resource_links (resource_id, project_id, task_id, event_id, contact_id)
       values ($1,$2,$3,$4,$5)
       returning id, resource_id as "resourceId", project_id as "projectId",
                 task_id as "taskId", event_id as "eventId", contact_id as "contactId"`,
      [
        resourceId,
        input.projectId ?? null,
        input.taskId ?? null,
        input.eventId ?? null,
        input.contactId ?? null
      ]
    );
    await client.query(
      'update resources set version = version + 1, updated_at = now() where id = $1',
      [resourceId]
    );
    const row = link.rows[0];
    if (!row) throw new Error('insert into resource_links returned no row');
    return row;
  });
  return { link: value, revision };
}

export async function deleteResourceLink(
  pool: DbPool,
  resourceId: string,
  linkId: string,
  version: number,
  workspaceEpoch: string
): Promise<{ revision: string }> {
  const { revision } = await withWorkspaceWrite(pool, workspaceEpoch, async (client) => {
    const { rows } = await client.query<{ version: number }>(
      'select version from resources where id = $1 for update',
      [resourceId]
    );
    const current = rows[0];
    if (!current) throw new AppError(404, 'RESOURCE_NOT_FOUND', '找不到這份文件連結');
    if (current.version !== version) {
      throw new AppError(409, 'VERSION_CONFLICT', '資料已更新，請重新載入');
    }
    const result = await client.query(
      'delete from resource_links where id = $1 and resource_id = $2',
      [linkId, resourceId]
    );
    if (result.rowCount === 0) {
      throw new AppError(404, 'LINK_NOT_FOUND', '找不到這個關聯');
    }
    await client.query(
      'update resources set version = version + 1, updated_at = now() where id = $1',
      [resourceId]
    );
  });
  return { revision };
}