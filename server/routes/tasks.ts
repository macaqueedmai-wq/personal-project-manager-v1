import { Router } from 'express';
import type { ApiEnvelope, ResponseMeta, TaskDto } from '../../shared/api-types.js';
import { toHongKongDate } from '../../shared/dates.js';
import {
  createTaskSchema,
  taskListQuerySchema,
  updateTaskSchema,
  uuidSchema
} from '../../shared/schemas.js';
import type { DbPool } from '../db/pool.js';
import { readWorkspaceState } from '../db/system-state.js';
import { AppError, parseOrThrow } from '../errors.js';
import { createTask, getTask, listTasks, updateTask } from '../services/tasks.js';
import type { TaskListFilters } from '../repositories/tasks.js';

function buildMeta(
  state: { revision: string; dataEpoch: string },
  total?: number
): ResponseMeta {
  return {
    workspaceEpoch: state.dataEpoch,
    revision: state.revision,
    today: toHongKongDate(),
    now: new Date().toISOString(),
    ...(total === undefined ? {} : { total })
  };
}

function readWorkspaceEpoch(header: string | undefined): string {
  if (!header) {
    throw new AppError(400, 'MISSING_WORKSPACE_EPOCH', '缺少工作區版本，請重新載入頁面');
  }
  if (!uuidSchema.safeParse(header).success) {
    throw new AppError(409, 'WORKSPACE_CHANGED', '資料已更新，請重新載入頁面');
  }
  return header;
}

function assertId(id: string): string {
  if (!uuidSchema.safeParse(id).success) {
    throw new AppError(400, 'INVALID_ID', '識別碼格式不正確');
  }
  return id;
}

export function createTasksRouter(pool: DbPool): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = parseOrThrow(taskListQuerySchema, req.query);
    const filters: TaskListFilters = {
      q: query.q,
      areaId: query.areaId,
      projectId: query.projectId,
      status: query.status,
      tag: query.tag,
      from: query.from,
      to: query.to,
      undated: query.undated === 'true',
      archived: query.archived,
      sort: query.sort,
      limit: query.limit,
      offset: query.offset
    };
    const [{ items, total }, state] = await Promise.all([
      listTasks(pool, filters),
      readWorkspaceState(pool)
    ]);

    const body: ApiEnvelope<TaskDto[]> = { data: items, meta: buildMeta(state, total) };
    res.json(body);
  });

  router.post('/', async (req, res) => {
    const input = parseOrThrow(createTaskSchema, req.body);
    const workspaceEpoch = readWorkspaceEpoch(req.get('x-workspace-epoch'));
    const { task, revision } = await createTask(pool, input, workspaceEpoch);

    const body: ApiEnvelope<TaskDto> = {
      data: task,
      meta: buildMeta({ revision, dataEpoch: workspaceEpoch })
    };
    res.status(201).json(body);
  });

  router.get('/:id', async (req, res) => {
    const id = assertId(req.params.id);
    const task = await getTask(pool, id);
    if (!task) {
      throw new AppError(404, 'TASK_NOT_FOUND', '找不到這項任務');
    }

    const state = await readWorkspaceState(pool);
    const body: ApiEnvelope<TaskDto> = { data: task, meta: buildMeta(state) };
    res.json(body);
  });

  router.patch('/:id', async (req, res) => {
    const id = assertId(req.params.id);
    const input = parseOrThrow(updateTaskSchema, req.body);
    const workspaceEpoch = readWorkspaceEpoch(req.get('x-workspace-epoch'));
    const { task, revision } = await updateTask(pool, id, input, workspaceEpoch);

    const body: ApiEnvelope<TaskDto> = {
      data: task,
      meta: buildMeta({ revision, dataEpoch: workspaceEpoch })
    };
    res.json(body);
  });

  return router;
}
