import type { PoolClient } from 'pg';
import type { ContactDto, InteractionDto } from '../../shared/api-types.js';
import type {
  ContactInput,
  ContactListQuery,
  ContactUpdateInput,
  InteractionInput,
  InteractionUpdateInput
} from '../../shared/schemas.js';
import type { DbPool } from '../db/pool.js';
import { withWorkspaceWrite } from '../db/system-state.js';
import { AppError } from '../errors.js';

const CONTACT_SELECT = `
  select
    c.id, c.name, c.organization, c.role, c.email, c.phone, c.profile_url as "profileUrl",
    c.relationship_tags as "relationshipTags", c.how_met as "howMet", c.notes,
    c.next_contact_on as "nextContactOn", c.version, c.created_at as "createdAt",
    c.updated_at as "updatedAt", c.archived_at as "archivedAt",
    (select max(i.occurred_at) from interactions i where i.contact_id = c.id) as "lastInteractionAt"
  from contacts c
`;

const INTERACTION_SELECT = `
  select id, contact_id as "contactId", occurred_at as "occurredAt", kind, summary,
         project_id as "projectId", event_id as "eventId",
         created_at as "createdAt", updated_at as "updatedAt"
    from interactions
`;

export async function listContacts(
  pool: DbPool,
  query: ContactListQuery
): Promise<{ items: ContactDto[]; total: number }> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (query.archived === 'exclude') where.push('c.archived_at is null');
  if (query.archived === 'only') where.push('c.archived_at is not null');
  if (query.q) {
    values.push(`%${query.q}%`);
    where.push(
      `(c.name ilike $${values.length} or c.organization ilike $${values.length} or c.role ilike $${values.length})`
    );
  }
  const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';
  const itemValues = [...values, query.limit, query.offset];
  const [items, count] = await Promise.all([
    pool.query<ContactDto>(
      `${CONTACT_SELECT} ${whereSql}
       order by c.next_contact_on asc nulls last, c.updated_at desc
       limit $${itemValues.length - 1} offset $${itemValues.length}`,
      itemValues
    ),
    pool.query<{ count: string }>(
      `select count(*)::text as count from contacts c ${whereSql}`,
      values
    )
  ]);
  return { items: items.rows, total: Number(count.rows[0]?.count ?? '0') };
}

export async function getContact(pool: DbPool, id: string): Promise<ContactDto | null> {
  const { rows } = await pool.query<ContactDto>(`${CONTACT_SELECT} where c.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createContact(
  pool: DbPool,
  input: ContactInput,
  workspaceEpoch: string
): Promise<{ contact: ContactDto; revision: string }> {
  const { value: id, revision } = await withWorkspaceWrite(pool, workspaceEpoch, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `insert into contacts
        (name, organization, role, email, phone, profile_url, relationship_tags, how_met, notes, next_contact_on)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       returning id`,
      [
        input.name,
        input.organization,
        input.role,
        input.email,
        input.phone,
        input.profileUrl,
        input.relationshipTags ?? [],
        input.howMet,
        input.notes,
        input.nextContactOn ?? null
      ]
    );
    const newId = rows[0]?.id;
    if (!newId) throw new Error('insert into contacts returned no row');
    return newId;
  });

  const contact = await getContact(pool, id);
  if (!contact) throw new Error('created contact could not be read back');
  return { contact, revision };
}

export async function updateContact(
  pool: DbPool,
  contactId: string,
  input: ContactUpdateInput,
  workspaceEpoch: string
): Promise<{ contact: ContactDto; revision: string }> {
  const { revision } = await withWorkspaceWrite(pool, workspaceEpoch, async (client) => {
    const { rows } = await client.query<ContactDto>(
      `${CONTACT_SELECT} where c.id = $1 for update of c`,
      [contactId]
    );
    const current = rows[0];
    if (!current) throw new AppError(404, 'CONTACT_NOT_FOUND', '找不到這位人物');
    if (current.version !== input.version) {
      throw new AppError(409, 'VERSION_CONFLICT', '資料已更新，請重新載入');
    }

    const columns: Record<string, string> = {
      name: 'name',
      organization: 'organization',
      role: 'role',
      email: 'email',
      phone: 'phone',
      profileUrl: 'profile_url',
      relationshipTags: 'relationship_tags',
      howMet: 'how_met',
      notes: 'notes',
      nextContactOn: 'next_contact_on',
      archivedAt: 'archived_at'
    };
    const patch: Record<string, unknown> = {};
    for (const key of [
      'name',
      'organization',
      'role',
      'email',
      'phone',
      'profileUrl',
      'relationshipTags',
      'howMet',
      'notes',
      'nextContactOn'
    ] as const) {
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
    values.push(contactId, input.version);
    const result = await client.query(
      `update contacts set ${sets.join(', ')} where id = $${index} and version = $${index + 1}`,
      values
    );
    if (result.rowCount === 0) {
      throw new AppError(409, 'VERSION_CONFLICT', '資料已更新，請重新載入');
    }
  });

  const contact = await getContact(pool, contactId);
  if (!contact) throw new Error('updated contact could not be read back');
  return { contact, revision };
}

export async function listInteractions(
  pool: DbPool,
  contactId: string
): Promise<InteractionDto[]> {
  const contact = await getContact(pool, contactId);
  if (!contact) throw new AppError(404, 'CONTACT_NOT_FOUND', '找不到這位人物');
  const { rows } = await pool.query<InteractionDto>(
    `${INTERACTION_SELECT} where contact_id = $1 order by occurred_at desc, id desc`,
    [contactId]
  );
  return rows;
}

async function assertInteractionTargets(
  client: PoolClient,
  projectId: string | null | undefined,
  eventId: string | null | undefined
): Promise<void> {
  if (projectId) {
    const result = await client.query('select 1 from projects where id = $1', [projectId]);
    if (result.rowCount === 0) {
      throw new AppError(400, 'PROJECT_NOT_FOUND', '找不到指定項目');
    }
  }
  if (eventId) {
    const result = await client.query('select 1 from events where id = $1', [eventId]);
    if (result.rowCount === 0) {
      throw new AppError(400, 'EVENT_NOT_FOUND', '找不到指定活動');
    }
  }
}

async function bumpContactVersion(client: PoolClient, contactId: string): Promise<void> {
  await client.query('update contacts set version = version + 1, updated_at = now() where id = $1', [
    contactId
  ]);
}

export async function createInteraction(
  pool: DbPool,
  contactId: string,
  input: InteractionInput,
  workspaceEpoch: string
): Promise<{ interaction: InteractionDto; revision: string }> {
  const { value, revision } = await withWorkspaceWrite(pool, workspaceEpoch, async (client) => {
    const contact = await client.query('select 1 from contacts where id = $1 for update', [
      contactId
    ]);
    if (contact.rowCount === 0) {
      throw new AppError(404, 'CONTACT_NOT_FOUND', '找不到這位人物');
    }
    await assertInteractionTargets(client, input.projectId, input.eventId);
    const { rows } = await client.query<InteractionDto>(
      `insert into interactions (contact_id, occurred_at, kind, summary, project_id, event_id)
       values ($1,$2,$3,$4,$5,$6)
       returning id, contact_id as "contactId", occurred_at as "occurredAt", kind, summary,
                 project_id as "projectId", event_id as "eventId",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [
        contactId,
        input.occurredAt,
        input.kind,
        input.summary,
        input.projectId ?? null,
        input.eventId ?? null
      ]
    );
    await bumpContactVersion(client, contactId);
    const interaction = rows[0];
    if (!interaction) throw new Error('insert into interactions returned no row');
    return interaction;
  });
  return { interaction: value, revision };
}

export async function updateInteraction(
  pool: DbPool,
  interactionId: string,
  input: InteractionUpdateInput,
  workspaceEpoch: string
): Promise<{ interaction: InteractionDto; revision: string }> {
  const { value, revision } = await withWorkspaceWrite(pool, workspaceEpoch, async (client) => {
    const { rows } = await client.query<{ contactId: string }>(
      'select contact_id as "contactId" from interactions where id = $1',
      [interactionId]
    );
    const found = rows[0];
    if (!found) throw new AppError(404, 'INTERACTION_NOT_FOUND', '找不到這筆互動紀錄');
    const contact = await client.query<{ version: number }>(
      'select version from contacts where id = $1 for update',
      [found.contactId]
    );
    const current = contact.rows[0];
    if (!current) throw new AppError(404, 'CONTACT_NOT_FOUND', '找不到這位人物');
    if (current.version !== input.version) {
      throw new AppError(409, 'VERSION_CONFLICT', '資料已更新，請重新載入');
    }
    await assertInteractionTargets(client, input.projectId, input.eventId);

    const columns: Record<string, string> = {
      occurredAt: 'occurred_at',
      kind: 'kind',
      summary: 'summary',
      projectId: 'project_id',
      eventId: 'event_id'
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    for (const [key, column] of Object.entries(columns)) {
      if (Object.hasOwn(input, key)) {
        values.push(input[key as keyof typeof input]);
        sets.push(`${column} = $${index}`);
        index += 1;
      }
    }
    if (sets.length > 0) {
      sets.push('updated_at = now()');
      values.push(interactionId);
      await client.query(
        `update interactions set ${sets.join(', ')} where id = $${index}`,
        values
      );
    }
    await bumpContactVersion(client, found.contactId);
    const result = await client.query<InteractionDto>(
      `${INTERACTION_SELECT} where id = $1`,
      [interactionId]
    );
    const interaction = result.rows[0];
    if (!interaction) throw new Error('updated interaction could not be read back');
    return interaction;
  });
  return { interaction: value, revision };
}