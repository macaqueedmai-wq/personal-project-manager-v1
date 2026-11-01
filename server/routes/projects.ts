import { Router } from 'express';
import type {
  ApiEnvelope,
  ApplicationDto,
  ApplicationStageHistoryDto,
  CourseDto,
  ProjectDto
} from '../../shared/api-types.js';
import {
  applicationUpdateSchema,
  courseUpdateSchema,
  createProjectSchema,
  projectContactsSchema,
  projectListQuerySchema,
  projectRelatedAreasSchema,
  updateProjectSchema
} from '../../shared/schemas.js';
import type { DbPool } from '../db/pool.js';
import { readWorkspaceState } from '../db/system-state.js';
import { AppError, parseOrThrow } from '../errors.js';
import {
  createProject,
  getApplicationHistory,
  getProject,
  getProjectApplication,
  listProjects,
  updateCourse,
  updateProject,
  updateProjectApplication,
  updateProjectContacts,
  updateProjectRelatedAreas
} from '../services/projects.js';
import { assertUuidParam, buildMeta, readWorkspaceEpoch } from './helpers.js';

export function createProjectsRouter(pool: DbPool): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = parseOrThrow(projectListQuerySchema, req.query);
    const [{ items, total }, state] = await Promise.all([
      listProjects(pool, query),
      readWorkspaceState(pool)
    ]);
    const body: ApiEnvelope<ProjectDto[]> = { data: items, meta: buildMeta(state, total) };
    res.json(body);
  });

  router.post('/', async (req, res) => {
    const input = parseOrThrow(createProjectSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { project, revision } = await createProject(pool, input, epoch);
    const body: ApiEnvelope<ProjectDto> = {
      data: project,
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.status(201).json(body);
  });

  router.get('/:id', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const project = await getProject(pool, id);
    if (!project) {
      throw new AppError(404, 'PROJECT_NOT_FOUND', '找不到這個項目');
    }
    const state = await readWorkspaceState(pool);
    const body: ApiEnvelope<ProjectDto> = { data: project, meta: buildMeta(state) };
    res.json(body);
  });

  router.patch('/:id', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const input = parseOrThrow(updateProjectSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { project, revision } = await updateProject(pool, id, input, epoch);
    const body: ApiEnvelope<ProjectDto> = {
      data: project,
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.json(body);
  });

  router.get('/:id/application', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const application = await getProjectApplication(pool, id);
    const state = await readWorkspaceState(pool);
    const body: ApiEnvelope<ApplicationDto> = { data: application, meta: buildMeta(state) };
    res.json(body);
  });

  router.patch('/:id/application', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const input = parseOrThrow(applicationUpdateSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { application, revision } = await updateProjectApplication(pool, id, input, epoch);
    const body: ApiEnvelope<ApplicationDto> = {
      data: application,
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.json(body);
  });

  router.get('/:id/application/history', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const history = await getApplicationHistory(pool, id);
    const state = await readWorkspaceState(pool);
    const body: ApiEnvelope<ApplicationStageHistoryDto[]> = {
      data: history,
      meta: buildMeta(state)
    };
    res.json(body);
  });

  router.patch('/:id/course', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const input = parseOrThrow(courseUpdateSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { course, revision } = await updateCourse(pool, id, input, epoch);
    const body: ApiEnvelope<CourseDto> = {
      data: course,
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.json(body);
  });

  router.put('/:id/related-areas', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const input = parseOrThrow(projectRelatedAreasSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { areaIds, revision } = await updateProjectRelatedAreas(pool, id, input, epoch);
    const body: ApiEnvelope<{ areaIds: typeof areaIds }> = {
      data: { areaIds },
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.json(body);
  });

  router.put('/:id/contacts', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const input = parseOrThrow(projectContactsSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { contactIds, revision } = await updateProjectContacts(pool, id, input, epoch);
    const body: ApiEnvelope<{ contactIds: typeof contactIds }> = {
      data: { contactIds },
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.json(body);
  });

  return router;
}