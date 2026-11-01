import type { PoolClient } from 'pg';
import type {
  ApplicationDto,
  ApplicationStageHistoryDto,
  CourseDto,
  ProjectDto
} from '../../shared/api-types.js';
import type { AreaId } from '../../shared/areas.js';
import { isValidOutcomeForStage } from '../../shared/enums.js';
import type {
  ApplicationInput,
  ApplicationUpdateInput,
  CourseUpdateInput,
  CreateProjectInput,
  ProjectContactsInput,
  ProjectListQuery,
  ProjectRelatedAreasInput,
  UpdateProjectInput
} from '../../shared/schemas.js';
import type { DbPool } from '../db/pool.js';
import { withWorkspaceWrite } from '../db/system-state.js';
import { AppError } from '../errors.js';
import {
  assertProjectVersion,
  bumpProjectVersion,
  insertApplication,
  insertCourse,
  insertProject,
  insertStageHistory,
  lockProjectVersion,
  replaceProjectContacts,
  replaceRelatedAreas,
  selectApplicationHistory,
  selectProjectById,
  selectProjectContactIds,
  selectProjects,
  selectRelatedAreaIds,
  updateApplicationRecord,
  updateCourseDetails,
  updateProjectColumns,
  type ProjectListFilters
} from '../repositories/projects.js';

const AREA_RULES: Record<ProjectDto['kind'], AreaId[] | null> = {
  general: null,
  course: ['study'],
  degree_application: ['degree'],
  job_application: ['career-hk', 'internship-sz']
};

function assertAreaForKind(kind: ProjectDto['kind'], areaId: AreaId): void {
  const allowed = AREA_RULES[kind];
  if (allowed && !allowed.includes(areaId)) {
    throw new AppError(400, 'INVALID_PROJECT_AREA', '這個項目類型不允許此主領域', {
      primaryAreaId: '主領域與項目類型不符'
    });
  }
}

function assertApplicationType(kind: ProjectDto['kind'], type: ApplicationDto['applicationType']): void {
  const expected = kind === 'degree_application' ? 'degree' : kind === 'job_application' ? 'job' : null;
  if (expected !== type) {
    throw new AppError(400, 'INVALID_APPLICATION_TYPE', '申請類型與項目類型不符', {
      applicationType: '申請類型與項目類型不符'
    });
  }
}

function applicationFromInput(
  input: ApplicationInput,
  areaId: AreaId
): ApplicationDto {
  const workType =
    input.applicationType === 'job' &&
    areaId === 'internship-sz' &&
    (input.workType ?? null) === null
      ? 'internship'
      : input.workType ?? null;

  return {
    applicationType: input.applicationType,
    organizationName: input.organizationName,
    roleOrProgram: input.roleOrProgram,
    degreeLevel: input.degreeLevel ?? null,
    workType,
    location: input.location,
    postingUrl: input.postingUrl,
    portalUrl: input.portalUrl,
    stage: input.stage,
    outcome: input.outcome ?? null,
    appliedOn: input.appliedOn ?? null,
    receiptVerified: input.receiptVerified,
    nextFollowUpOn: input.nextFollowUpOn ?? null,
    notes: input.notes
  };
}

function projectStatusForApplication(
  stage: ApplicationDto['stage'],
  outcome: ApplicationDto['outcome']
): ProjectDto['status'] {
  if (stage !== 'closed') {
    return 'active';
  }
  return outcome === 'withdrawn' ? 'cancelled' : 'completed';
}

export async function listProjects(
  pool: DbPool,
  query: ProjectListQuery
): Promise<{ items: ProjectDto[]; total: number }> {
  const filters: ProjectListFilters = {
    q: query.q,
    areaId: query.areaId,
    kind: query.kind,
    status: query.status,
    archived: query.archived,
    limit: query.limit,
    offset: query.offset
  };
  return selectProjects(pool, filters);
}

export async function getProject(
  db: DbPool | PoolClient,
  projectId: string
): Promise<ProjectDto | null> {
  const project = await selectProjectById(db, projectId);
  if (!project) {
    return null;
  }
  const [relatedAreaIds, contactIds] = await Promise.all([
    selectRelatedAreaIds(db, projectId),
    selectProjectContactIds(db, projectId)
  ]);
  return { ...project, relatedAreaIds, contactIds };
}

export async function createProject(
  pool: DbPool,
  input: CreateProjectInput,
  workspaceEpoch: string
): Promise<{ project: ProjectDto; revision: string }> {
  const { value: projectId, revision } = await withWorkspaceWrite(
    pool,
    workspaceEpoch,
    async (client) => {
      assertAreaForKind(input.kind, input.primaryAreaId);

      let application: ApplicationDto | null = null;
      if (input.application) {
        assertApplicationType(input.kind, input.application.applicationType);
        application = applicationFromInput(input.application, input.primaryAreaId);
      }

      let status: ProjectDto['status'] = input.status ?? 'active';
      if (application) {
        if (input.status === 'completed' || input.status === 'cancelled') {
          throw new AppError(400, 'INVALID_PROJECT_STATUS', '申請項目狀態由申請階段管理', {
            status: '申請項目狀態由申請階段管理'
          });
        }
        status = projectStatusForApplication(application.stage, application.outcome);
        if (application.stage !== 'closed' && input.status === 'paused') {
          status = 'paused';
        }
      }

      const id = await insertProject(client, {
        primaryAreaId: input.primaryAreaId,
        title: input.title,
        description: input.description,
        kind: input.kind,
        status,
        dueOn: input.dueOn ?? null,
        dueAt: input.dueAt ?? null,
        dueTimezone: input.dueTimezone ?? null,
        nextStep: input.nextStep,
        tags: input.tags ?? []
      });

      if (input.course) {
        await insertCourse(client, id, input.course);
      }
      if (application) {
        await insertApplication(client, id, application);
        await insertStageHistory(client, id, null, application.stage, '建立申請');
      }

      return id;
    }
  );

  const project = await getProject(pool, projectId);
  if (!project) {
    throw new Error('created project could not be read back');
  }
  return { project, revision };
}

async function updateProjectStatus(
  client: PoolClient,
  projectId: string,
  status: ProjectDto['status']
): Promise<void> {
  await client.query('update projects set status = $2 where id = $1', [projectId, status]);
}

export async function updateProject(
  pool: DbPool,
  projectId: string,
  input: UpdateProjectInput,
  workspaceEpoch: string
): Promise<{ project: ProjectDto; revision: string }> {
  const { revision } = await withWorkspaceWrite(pool, workspaceEpoch, async (client) => {
    const version = await lockProjectVersion(client, projectId);
    assertProjectVersion(version, input.version);

    const current = await selectProjectById(client, projectId);
    if (!current) {
      throw new AppError(404, 'PROJECT_NOT_FOUND', '找不到這個項目');
    }

    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) {
      patch.title = input.title;
    }
    if (input.description !== undefined) {
      patch.description = input.description;
    }
    if (input.nextStep !== undefined) {
      patch.nextStep = input.nextStep;
    }
    if (input.tags !== undefined) {
      patch.tags = input.tags;
    }
    if (input.primaryAreaId !== undefined) {
      assertAreaForKind(current.kind, input.primaryAreaId);
      patch.primaryAreaId = input.primaryAreaId;
    }
    if (input.status !== undefined) {
      if (current.application) {
        if (
          current.application.stage === 'closed' ||
          input.status === 'completed' ||
          input.status === 'cancelled'
        ) {
          throw new AppError(400, 'INVALID_PROJECT_STATUS', '申請項目狀態由申請階段管理', {
            status: '申請項目狀態由申請階段管理'
          });
        }
      }
      patch.status = input.status;
    }

    const dueOn = Object.hasOwn(input, 'dueOn') ? (input.dueOn ?? null) : current.dueOn;
    const dueAt = Object.hasOwn(input, 'dueAt') ? (input.dueAt ?? null) : current.dueAt;
    const dueTimezone = Object.hasOwn(input, 'dueTimezone')
      ? (input.dueTimezone ?? null)
      : current.dueTimezone;

    if (dueOn !== null && dueAt !== null) {
      throw new AppError(400, 'INVALID_DUE', '截止日期與截止時間不可同時設定', {
        dueAt: '截止日期與截止時間不可同時設定'
      });
    }
    if (dueAt !== null && dueTimezone === null) {
      throw new AppError(400, 'INVALID_DUE', '精確截止需要時區', {
        dueTimezone: '精確截止需要時區'
      });
    }
    if (dueAt === null && dueTimezone !== null) {
      throw new AppError(400, 'INVALID_DUE', '沒有精確截止時不可設定時區', {
        dueTimezone: '沒有精確截止時不可設定時區'
      });
    }

    if (Object.hasOwn(input, 'dueOn')) {
      patch.dueOn = input.dueOn;
    }
    if (Object.hasOwn(input, 'dueAt')) {
      patch.dueAt = input.dueAt;
    }
    if (Object.hasOwn(input, 'dueTimezone')) {
      patch.dueTimezone = input.dueTimezone;
    }
    if (input.archived !== undefined) {
      patch.archivedAt = input.archived ? new Date().toISOString() : null;
    }

    if (Object.keys(patch).length === 0) {
      throw new AppError(400, 'EMPTY_UPDATE', '沒有任何變更');
    }

    await updateProjectColumns(client, projectId, input.version, patch);
  });

  const project = await getProject(pool, projectId);
  if (!project) {
    throw new Error('updated project could not be read back');
  }
  return { project, revision };
}

export async function getProjectApplication(
  pool: DbPool,
  projectId: string
): Promise<ApplicationDto> {
  const project = await selectProjectById(pool, projectId);
  if (!project) {
    throw new AppError(404, 'PROJECT_NOT_FOUND', '找不到這個項目');
  }
  if (!project.application) {
    throw new AppError(404, 'APPLICATION_NOT_FOUND', '找不到申請資料');
  }
  return project.application;
}

export async function getApplicationHistory(
  pool: DbPool,
  projectId: string
): Promise<ApplicationStageHistoryDto[]> {
  const project = await selectProjectById(pool, projectId);
  if (!project) {
    throw new AppError(404, 'PROJECT_NOT_FOUND', '找不到這個項目');
  }
  return selectApplicationHistory(pool, projectId);
}

export async function updateProjectApplication(
  pool: DbPool,
  projectId: string,
  input: ApplicationUpdateInput,
  workspaceEpoch: string
): Promise<{ application: ApplicationDto; revision: string }> {
  const { revision } = await withWorkspaceWrite(pool, workspaceEpoch, async (client) => {
    const version = await lockProjectVersion(client, projectId);
    assertProjectVersion(version, input.version);

    const project = await selectProjectById(client, projectId);
    if (!project) {
      throw new AppError(404, 'PROJECT_NOT_FOUND', '找不到這個項目');
    }
    if (!project.application) {
      throw new AppError(404, 'APPLICATION_NOT_FOUND', '找不到申請資料');
    }

    const old = project.application;
    const oldStage = old.stage;
    const newStage = input.stage ?? oldStage;
    let newOutcome = input.outcome !== undefined ? input.outcome : old.outcome;

    if (oldStage === 'closed' && newStage !== 'closed') {
      newOutcome = null;
    }
    if (!isValidOutcomeForStage(newStage, newOutcome)) {
      throw new AppError(400, 'INVALID_APPLICATION_OUTCOME', '結果與申請階段不相符', {
        outcome: '結果與申請階段不相符'
      });
    }

    const nextDegreeLevel =
      input.degreeLevel !== undefined ? input.degreeLevel : old.degreeLevel;
    const nextWorkType = input.workType !== undefined ? input.workType : old.workType;
    if (old.applicationType === 'degree' && nextWorkType !== null) {
      throw new AppError(400, 'INVALID_APPLICATION_FIELDS', '學位申請不可設定工作類型', {
        workType: '學位申請不可設定工作類型'
      });
    }
    if (old.applicationType === 'job' && nextDegreeLevel !== null) {
      throw new AppError(400, 'INVALID_APPLICATION_FIELDS', '職位申請不可設定學位程度', {
        degreeLevel: '職位申請不可設定學位程度'
      });
    }

    const patch: Record<string, unknown> = {};
    for (const key of [
      'organizationName',
      'roleOrProgram',
      'degreeLevel',
      'workType',
      'location',
      'postingUrl',
      'portalUrl',
      'appliedOn',
      'receiptVerified',
      'nextFollowUpOn',
      'notes'
    ] as const) {
      if (Object.hasOwn(input, key)) {
        patch[key] = input[key];
      }
    }
    patch.stage = newStage;
    patch.outcome = newOutcome;

    let nextProjectStatus: ProjectDto['status'] | null = null;
    if (newStage !== oldStage || newOutcome !== old.outcome) {
      if (newStage === 'closed') {
        nextProjectStatus = newOutcome === 'withdrawn' ? 'cancelled' : 'completed';
      } else if (oldStage === 'closed') {
        nextProjectStatus = 'active';
      }
    }

    await updateApplicationRecord(client, projectId, patch);
    if (nextProjectStatus) {
      await updateProjectStatus(client, projectId, nextProjectStatus);
    }
    await bumpProjectVersion(client, projectId);

    if (newStage !== oldStage) {
      await insertStageHistory(client, projectId, oldStage, newStage, '');
    }
  });

  const project = await getProject(pool, projectId);
  if (!project?.application) {
    throw new Error('updated application could not be read back');
  }
  return { application: project.application, revision };
}

export async function updateCourse(
  pool: DbPool,
  projectId: string,
  input: CourseUpdateInput,
  workspaceEpoch: string
): Promise<{ course: CourseDto; revision: string }> {
  const { revision } = await withWorkspaceWrite(pool, workspaceEpoch, async (client) => {
    const version = await lockProjectVersion(client, projectId);
    assertProjectVersion(version, input.version);

    const project = await selectProjectById(client, projectId);
    if (!project) {
      throw new AppError(404, 'PROJECT_NOT_FOUND', '找不到這個項目');
    }
    if (!project.course) {
      throw new AppError(404, 'COURSE_NOT_FOUND', '找不到課程資料');
    }

    await updateCourseDetails(client, projectId, {
      courseCode: input.courseCode,
      term: input.term,
      instructorName: input.instructorName
    });
    await bumpProjectVersion(client, projectId);
  });

  const project = await selectProjectById(pool, projectId);
  if (!project?.course) {
    throw new Error('updated course could not be read back');
  }
  return { course: project.course, revision };
}

export async function updateProjectRelatedAreas(
  pool: DbPool,
  projectId: string,
  input: ProjectRelatedAreasInput,
  workspaceEpoch: string
): Promise<{ areaIds: AreaId[]; revision: string }> {
  const { revision } = await withWorkspaceWrite(pool, workspaceEpoch, async (client) => {
    const version = await lockProjectVersion(client, projectId);
    assertProjectVersion(version, input.version);

    const project = await selectProjectById(client, projectId);
    if (!project) {
      throw new AppError(404, 'PROJECT_NOT_FOUND', '找不到這個項目');
    }
    if (input.areaIds.includes(project.primaryAreaId)) {
      throw new AppError(400, 'RELATED_PRIMARY_AREA', '相關領域不可包含主領域', {
        areaIds: '相關領域不可包含主領域'
      });
    }

    await replaceRelatedAreas(client, projectId, input.areaIds);
    await bumpProjectVersion(client, projectId);
  });

  return {
    areaIds: await selectRelatedAreaIds(pool, projectId),
    revision
  };
}

export async function updateProjectContacts(
  pool: DbPool,
  projectId: string,
  input: ProjectContactsInput,
  workspaceEpoch: string
): Promise<{ contactIds: string[]; revision: string }> {
  const { revision } = await withWorkspaceWrite(pool, workspaceEpoch, async (client) => {
    const version = await lockProjectVersion(client, projectId);
    assertProjectVersion(version, input.version);

    const project = await selectProjectById(client, projectId);
    if (!project) {
      throw new AppError(404, 'PROJECT_NOT_FOUND', '找不到這個項目');
    }

    if (input.contactIds.length > 0) {
      const { rows } = await client.query<{ count: string }>(
        'select count(*)::text as count from contacts where id = any($1::uuid[])',
        [input.contactIds]
      );
      if (Number(rows[0]?.count ?? '0') !== input.contactIds.length) {
        throw new AppError(400, 'CONTACT_NOT_FOUND', '有一位或多位人物不存在', {
          contactIds: '有一位或多位人物不存在'
        });
      }
    }

    await replaceProjectContacts(client, projectId, input.contactIds);
    await bumpProjectVersion(client, projectId);
  });

  return {
    contactIds: await selectProjectContactIds(pool, projectId),
    revision
  };
}