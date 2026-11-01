import type { SearchResultDto } from '../../shared/api-types.js';
import type { DbPool } from '../db/pool.js';

export async function searchWorkspace(
  pool: DbPool,
  q: string,
  archived: 'exclude' | 'include',
  limit: number
): Promise<SearchResultDto[]> {
  const pattern = `%${q}%`;

  const [tasks, projects, applications, events, contacts, resources] = await Promise.all([
    pool.query<SearchResultDto>(
      `select 'task' as type, t.id, t.title,
              coalesce(p.title, '任務') as subtitle,
              coalesce(t.area_id, p.primary_area_id) as "areaId",
              (t.archived_at is not null or p.archived_at is not null) as archived
         from tasks t
         left join projects p on p.id = t.project_id
        where (t.title ilike $1 or t.description ilike $1)
          and ($2::boolean or (t.archived_at is null and (t.project_id is null or p.archived_at is null)))
        order by t.updated_at desc
        limit $3`,
      [pattern, archived === 'include', limit]
    ),
    pool.query<SearchResultDto>(
      `select 'project' as type, id, title, '項目' as subtitle,
              primary_area_id as "areaId", (archived_at is not null) as archived
         from projects
        where (title ilike $1 or description ilike $1)
          and ($2::boolean or archived_at is null)
        order by updated_at desc
        limit $3`,
      [pattern, archived === 'include', limit]
    ),
    pool.query<SearchResultDto>(
      `select 'application' as type, p.id,
              a.organization_name || ' — ' || a.role_or_program as title,
              '申請' as subtitle, p.primary_area_id as "areaId",
              (p.archived_at is not null) as archived
         from applications a
         join projects p on p.id = a.project_id
        where (a.organization_name ilike $1 or a.role_or_program ilike $1 or a.notes ilike $1)
          and ($2::boolean or p.archived_at is null)
        order by p.updated_at desc
        limit $3`,
      [pattern, archived === 'include', limit]
    ),
    pool.query<SearchResultDto>(
      `select 'event' as type, id, title,
              case when location <> '' then location else '活動' end as subtitle,
              primary_area_id as "areaId", (archived_at is not null) as archived
         from events
        where (title ilike $1 or description ilike $1 or notes ilike $1)
          and ($2::boolean or archived_at is null)
        order by updated_at desc
        limit $3`,
      [pattern, archived === 'include', limit]
    ),
    pool.query<SearchResultDto>(
      `select 'contact' as type, id, name as title,
              coalesce(nullif(organization, ''), nullif(role, ''), '人物') as subtitle,
              null::text as "areaId", (archived_at is not null) as archived
         from contacts
        where (name ilike $1 or organization ilike $1 or role ilike $1 or notes ilike $1)
          and ($2::boolean or archived_at is null)
        order by updated_at desc
        limit $3`,
      [pattern, archived === 'include', limit]
    ),
    pool.query<SearchResultDto>(
      `select 'resource' as type, id, title, target as subtitle,
              null::text as "areaId", (archived_at is not null) as archived
         from resources
        where (title ilike $1 or target ilike $1 or notes ilike $1)
          and ($2::boolean or archived_at is null)
        order by updated_at desc
        limit $3`,
      [pattern, archived === 'include', limit]
    )
  ]);

  return [
    ...tasks.rows,
    ...projects.rows,
    ...applications.rows,
    ...events.rows,
    ...contacts.rows,
    ...resources.rows
  ]
    .sort((left, right) => Number(left.archived) - Number(right.archived))
    .slice(0, limit);
}