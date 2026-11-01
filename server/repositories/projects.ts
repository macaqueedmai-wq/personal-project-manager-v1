import type { PoolClient } from 'pg';
import type { AreaId } from '../../shared/areas.js';
import type {
  ApplicationDto,
  ApplicationStageHistoryDto,
  CourseDto,
  ProjectDto
} from '../../shared/api-types.js';
import type { DbPool } from '../db/pool.js';
import { AppError } from '../errors.js';

export interface ProjectListFilters {
  q?: string;
  areaId?: AreaId;
  kind?: string;
  status?: string;
  archived: 'exclude' | 'only' | 'all';
  limit: number;
  offset: number;
}

interface ProjectRecord {
  id: string;
  primaryAreaId: AreaId;
  title: string;
  description: string;
  kind: ProjectDto['kind'];
  status: ProjectDto['status'];
  dueOn: string | null;
  dueAt: string | null;
  dueTimezone: string | null;
  nextStep: string;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  courseCode: string | null;
  courseTerm: string | null;
  courseInstructorName: string | null;
  applicationType: ApplicationDto['applicationType'] | null;
  organizationName: string | null;
  roleOrProgram: string | null;
  degreeLevel: ApplicationDto['degreeLevel'];
  workType: ApplicationDto['workType'];
  location: string | null;
  postingUrl: string | null;
  portalUrl: string | null;
  stage: ApplicationDto['stage'] | null;
  outcome: ApplicationDto['outcome'];
  appliedOn: string | null;
  receiptVerified: boolean | null;
  nextFollowUpOn: string | null;
  applicationNotes: string | null;
}

const PROJECT_SELECT = `
  select
    p.id,
    p.primary_area_id as "primaryAreaId",
    p.title,
    p.description,
    p.kind,
    p.status,
    p.due_on as "dueOn",
    p.due_at as "dueAt",
    p.due_timezone as "dueTimezone",
    p.next_step as "nextStep",
    p.tags,
    p.version,
    p.created_at as "createdAt",
    p.updated_at as "updatedAt",
    p.archived_at as "archivedAt",
    c.course_code as "courseCode",
    c.term as "courseTerm",
    c.instructor_name as "courseInstructorName",
    a.application_type as "applicationType",
    a.organization_name as "organizationName",
    a.role_or_program as "roleOrProgram",
    a.degree_level as "degreeLevel",
    a.work_type as "workType",
    a.location,
    a.posting_url as "postingUrl",
    a.portal_url as "portalUrl",
    a.stage,
    a.outcome,
    a.applied_on as "appliedOn",
    a.receipt_verified as "receiptVerified",
    a.next_follow_up_on as "nextFollowUpOn",
    a.notes as "applicationNotes"
  from projects p
  left join course_details c on c.project_id = p.id
  left join applications a on a.project_id = p.id
`;

function mapProject(record: ProjectRecord): ProjectDto {
  const {
    courseCode,
    courseTerm,
    courseInstructorName,
    applicationType,
    organizationName,
    roleOrProgram,
    degreeLevel,
    workType,
    location,
    postingUrl,
    portalUrl,
    stage,
    outcome,
    appliedOn,
    receiptVerified,
    nextFollowUpOn,
    applicationNotes,
    ...base
  } = record;

  const course: CourseDto | null =
    courseCode === null
      ? null
      : {
          courseCode,
          term: courseTerm ?? '',
          instructorName: courseInstructorName ?? ''
        };

  const application: ApplicationDto | null =
    applicationType === null || stage === null
      ? null
      : {
          applicationType,
          organizationName: organizationName ?? '',
          roleOrProgram: roleOrProgram ?? '',
          degreeLevel: degreeLevel ?? null,
          workType: workType ?? null,
          location: location ?? '',
          postingUrl: postingUrl ?? '',
          portalUrl: portalUrl ?? '',
          stage,
          outcome: outcome ?? null,
          appliedOn,
          receiptVerified: receiptVerified ?? false,
          nextFollowUpOn,
          notes: applicationNotes ?? ''
        };

  return { ...base, course, application };
}

export async function selectProjects(
  pool: DbPool,
  filters: ProjectListFilters
): Promise<{ items: ProjectDto[]; total: number }> {
  const where: string[] = [];
  const values: unknown[] = [];

  if (filters.archived === 'exclude') {
    where.push('p.archived_at is null');
  } else if (filters.archived === 'only') {
    where.push('p.archived_at is not null');
  }

  if (filters.q) {
    values.push(`%${filters.q}%`);
    where.push(`(p.title ilike $${values.length} or p.description ilike $${values.length})`);
  }
  if (filters.areaId) {
    values.push(filters.areaId);
    where.push(
      `(p.primary_area_id = $${values.length} or exists (
        select 1 from project_related_areas pra
        where pra.project_id = p.id and pra.area_id = $${values.length}
      ))`
    );
  }
  if (filters.kind) {
    values.push(filters.kind);
    where.push(`p.kind = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    where.push(`p.status = $${values.length}`);
  }

  const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';
  values.push(filters.limit, filters.offset);

  const [itemsResult, countResult] = await Promise.all([
    pool.query<ProjectRecord>(
      `${PROJECT_SELECT}
        ${whereSql}
        order by p.updated_at desc, p.id desc
        limit $${values.length - 1} offset $${values.length}`,
      values
    ),
    pool.query<{ count: string }>(
      `select count(*)::text as count from projects p ${whereSql}`,
      values.slice(0, -2)
    )
  ]);

  return {
    items: itemsResult.rows.map(mapProject),
    total: Number(countResult.rows[0]?.count ?? '0')
  };
}

export async function selectProjectById(
  db: DbPool | PoolClient,
  projectId: string
): Promise<ProjectDto | null> {
  const { rows } = await db.query<ProjectRecord>(`${PROJECT_SELECT} where p.id = $1`, [projectId]);
  return rows[0] ? mapProject(rows[0]) : null;
}

export async function selectRelatedAreaIds(
  db: DbPool | PoolClient,
  projectId: string
): Promise<AreaId[]> {
  const { rows } = await db.query<{ areaId: AreaId }>(
    'select area_id as "areaId" from project_related_areas where project_id = $1 order by area_id',
    [projectId]
  );
  return rows.map((row) => row.areaId);
}

export async function selectProjectContactIds(
  db: DbPool | PoolClient,
  projectId: string
): Promise<string[]> {
  const { rows } = await db.query<{ contactId: string }>(
    'select contact_id as "contactId" from project_contacts where project_id = $1 order by contact_id',
    [projectId]
  );
  return rows.map((row) => row.contactId);
}

export async function insertProject(
  client: PoolClient,
  input: {
    primaryAreaId: AreaId;
    title: string;
    description: string;
    kind: ProjectDto['kind'];
    status: ProjectDto['status'];
    dueOn: string | null;
    dueAt: string | null;
    dueTimezone: string | null;
    nextStep: string;
    tags: string[];
  }
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into projects
      (primary_area_id, title, description, kind, status, due_on, due_at, due_timezone, next_step, tags)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning id`,
    [
      input.primaryAreaId,
      input.title,
      input.description,
      input.kind,
      input.status,
      input.dueOn,
      input.dueAt,
      input.dueTimezone,
      input.nextStep,
      input.tags
    ]
  );

  const id = rows[0]?.id;
  if (!id) {
    throw new Error('insert into projects returned no row');
  }
  return id;
}

export async function insertCourse(
  client: PoolClient,
  projectId: string,
  course: CourseDto
): Promise<void> {
  await client.query(
    'insert into course_details (project_id, course_code, term, instructor_name) values ($1, $2, $3, $4)',
    [projectId, course.courseCode, course.term, course.instructorName]
  );
}

export async function insertApplication(
  client: PoolClient,
  projectId: string,
  application: ApplicationDto
): Promise<void> {
  await client.query(
    `insert into applications
      (project_id, application_type, organization_name, role_or_program, degree_level,
       work_type, location, posting_url, portal_url, stage, outcome, applied_on,
       receipt_verified, next_follow_up_on, notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      projectId,
      application.applicationType,
      application.organizationName,
      application.roleOrProgram,
      application.degreeLevel,
      application.workType,
      application.location,
      application.postingUrl,
      application.portalUrl,
      application.stage,
      application.outcome,
      application.appliedOn,
      application.receiptVerified,
      application.nextFollowUpOn,
      application.notes
    ]
  );
}

export async function insertStageHistory(
  client: PoolClient,
  projectId: string,
  fromStage: ApplicationDto['stage'] | null,
  toStage: ApplicationDto['stage'],
  note: string
): Promise<void> {
  await client.query(
    'insert into application_stage_history (project_id, from_stage, to_stage, note) values ($1, $2, $3, $4)',
    [projectId, fromStage, toStage, note]
  );
}

export async function lockProjectVersion(
  client: PoolClient,
  projectId: string
): Promise<number | null> {
  const { rows } = await client.query<{ version: number }>(
    'select version from projects where id = $1 for update',
    [projectId]
  );
  return rows[0]?.version ?? null;
}

export function assertProjectVersion(actual: number | null, expected: number): void {
  if (actual === null) {
    throw new AppError(404, 'PROJECT_NOT_FOUND', '找不到這個項目');
  }
  if (actual !== expected) {
    throw new AppError(409, 'VERSION_CONFLICT', '資料已更新，請重新載入');
  }
}

export async function bumpProjectVersion(
  client: PoolClient,
  projectId: string
): Promise<{ version: number; updatedAt: string }> {
  const { rows } = await client.query<{ version: number; updatedAt: string }>(
    `update projects
        set version = version + 1, updated_at = now()
      where id = $1
      returning version, updated_at as "updatedAt"`,
    [projectId]
  );
  const row = rows[0];
  if (!row) {
    throw new AppError(404, 'PROJECT_NOT_FOUND', '找不到這個項目');
  }
  return row;
}

export async function updateProjectColumns(
  client: PoolClient,
  projectId: string,
  expectedVersion: number,
  patch: Record<string, unknown>
): Promise<void> {
  const columns: Record<string, string> = {
    title: 'title',
    description: 'description',
    primaryAreaId: 'primary_area_id',
    status: 'status',
    dueOn: 'due_on',
    dueAt: 'due_at',
    dueTimezone: 'due_timezone',
    nextStep: 'next_step',
    tags: 'tags',
    archivedAt: 'archived_at'
  };
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

  if (sets.length === 0) {
    return;
  }

  sets.push('version = version + 1', 'updated_at = now()');
  values.push(projectId, expectedVersion);
  const { rowCount } = await client.query(
    `update projects set ${sets.join(', ')}
      where id = $${index} and version = $${index + 1}`,
    values
  );

  if (rowCount === 0) {
    throw new AppError(409, 'VERSION_CONFLICT', '資料已更新，請重新載入');
  }
}

export async function updateCourseDetails(
  client: PoolClient,
  projectId: string,
  patch: { courseCode?: string; term?: string; instructorName?: string }
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (patch.courseCode !== undefined) {
    values.push(patch.courseCode);
    sets.push(`course_code = $${index}`);
    index += 1;
  }
  if (patch.term !== undefined) {
    values.push(patch.term);
    sets.push(`term = $${index}`);
    index += 1;
  }
  if (patch.instructorName !== undefined) {
    values.push(patch.instructorName);
    sets.push(`instructor_name = $${index}`);
    index += 1;
  }

  if (sets.length === 0) {
    return;
  }

  values.push(projectId);
  const { rowCount } = await client.query(
    `update course_details set ${sets.join(', ')} where project_id = $${index}`,
    values
  );

  if (rowCount === 0) {
    throw new AppError(404, 'COURSE_NOT_FOUND', '找不到課程資料');
  }
}

export async function updateApplicationRecord(
  client: PoolClient,
  projectId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const columns: Record<string, string> = {
    organizationName: 'organization_name',
    roleOrProgram: 'role_or_program',
    degreeLevel: 'degree_level',
    workType: 'work_type',
    location: 'location',
    postingUrl: 'posting_url',
    portalUrl: 'portal_url',
    stage: 'stage',
    outcome: 'outcome',
    appliedOn: 'applied_on',
    receiptVerified: 'receipt_verified',
    nextFollowUpOn: 'next_follow_up_on',
    notes: 'notes'
  };
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

  if (sets.length === 0) {
    return;
  }

  values.push(projectId);
  const { rowCount } = await client.query(
    `update applications set ${sets.join(', ')} where project_id = $${index}`,
    values
  );

  if (rowCount === 0) {
    throw new AppError(404, 'APPLICATION_NOT_FOUND', '找不到申請資料');
  }
}

export async function replaceRelatedAreas(
  client: PoolClient,
  projectId: string,
  areaIds: AreaId[]
): Promise<void> {
  await client.query('delete from project_related_areas where project_id = $1', [projectId]);
  for (const areaId of areaIds) {
    await client.query(
      'insert into project_related_areas (project_id, area_id) values ($1, $2)',
      [projectId, areaId]
    );
  }
}

export async function replaceProjectContacts(
  client: PoolClient,
  projectId: string,
  contactIds: string[]
): Promise<void> {
  await client.query('delete from project_contacts where project_id = $1', [projectId]);
  for (const contactId of contactIds) {
    await client.query(
      'insert into project_contacts (project_id, contact_id) values ($1, $2)',
      [projectId, contactId]
    );
  }
}

export async function selectApplicationHistory(
  db: DbPool | PoolClient,
  projectId: string
): Promise<ApplicationStageHistoryDto[]> {
  const { rows } = await db.query<ApplicationStageHistoryDto>(
    `select id, from_stage as "fromStage", to_stage as "toStage",
            changed_at as "changedAt", note
       from application_stage_history
      where project_id = $1
      order by changed_at asc, id asc`,
    [projectId]
  );
  return rows;
}
