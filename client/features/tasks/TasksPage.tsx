import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { ApiEnvelope, TaskDto } from '@shared/api-types';
import { AREA_IDS, AREA_NAME_BY_ID } from '@shared/areas';
import { TASK_STATUSES, TASK_STATUS_LABELS } from '@shared/enums';
import { ApiError, apiRequest } from '../../api/client';
import { PageStatus } from '../../components/PageStatus';
import { TaskList } from '../tasks/TaskList';
import { useSessionQuery } from '../session/useSession';
import {
  useAreasQuery,
  useProjectsQuery,
  useTasksQuery,
  useWorkspaceInvalidate
} from '../workspace/hooks';
import ui from '../../components/ui.module.css';

export function TasksPage() {
  const [q, setQ] = useState('');
  const [areaId, setAreaId] = useState('');
  const [status, setStatus] = useState('');
  const [undated, setUndated] = useState(false);
  const [archived, setArchived] = useState('exclude');
  const [title, setTitle] = useState('');
  const [newAreaId, setNewAreaId] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const session = useSessionQuery();
  const areas = useAreasQuery();
  const projects = useProjectsQuery({ limit: '200' });
  const invalidate = useWorkspaceInvalidate();

  const tasks = useTasksQuery({
    q,
    areaId,
    status,
    undated: undated ? 'true' : undefined,
    archived,
    limit: '200'
  });

  const create = useMutation({
    mutationFn: () => {
      const data = session.data?.data;
      if (!data?.csrfToken || !data.workspaceEpoch) {
        throw new Error('登入狀態尚未就緒');
      }
      return apiRequest<ApiEnvelope<TaskDto>>('/tasks', {
        method: 'POST',
        body: {
          title,
          projectId: newProjectId || null,
          areaId: newProjectId ? null : newAreaId || null
        },
        csrfToken: data.csrfToken,
        workspaceEpoch: data.workspaceEpoch
      });
    },
    onSuccess: async (response) => {
      setTitle('');
      setNewProjectId('');
      setNewAreaId('');
      setMessage(`已新增「${response.data.title}」`);
      await invalidate();
    }
  });

  const handleCreate = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (title.trim().length === 0) {
      setMessage('請輸入標題。');
      return;
    }
    create.mutate();
  };

  const createError =
    create.error instanceof ApiError
      ? create.error.fieldErrors?.title ?? create.error.message
      : create.error?.message;

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <p className={ui.eyebrow}>所有任務</p>
        <h1 className={ui.title}>所有任務</h1>
        <p className={ui.lede}>
          依領域、狀態、標籤與日期篩選；預設不隱藏沒有日期的任務。
        </p>
      </header>

      <section className={ui.card} aria-labelledby="new-task-heading">
        <div className={ui.cardHeader}>
          <h2 id="new-task-heading" className={ui.sectionTitle}>
            新增任務
          </h2>
          <span className={ui.muted}>只填標題也可以</span>
        </div>
        <form className={ui.form} onSubmit={handleCreate}>
          <div className={ui.filterRow}>
            <div className={ui.field} style={{ flex: '2 1 260px' }}>
              <label className={ui.label} htmlFor="new-task-title">
                任務標題
              </label>
              <input
                id="new-task-title"
                className={ui.input}
                value={title}
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="new-task-area">
                領域
              </label>
              <select
                id="new-task-area"
                className={ui.select}
                value={newAreaId}
                onChange={(event) => setNewAreaId(event.target.value)}
                disabled={Boolean(newProjectId)}
              >
                <option value="">未分類</option>
                {areas.data?.data.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="new-task-project">
                項目
              </label>
              <select
                id="new-task-project"
                className={ui.select}
                value={newProjectId}
                onChange={(event) => {
                  setNewProjectId(event.target.value);
                  if (event.target.value) setNewAreaId('');
                }}
              >
                <option value="">無項目</option>
                {projects.data?.data.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className={ui.actions}>
            <button className={ui.button} type="submit" disabled={create.isPending}>
              {create.isPending ? '儲存中…' : '新增'}
            </button>
            {message ? <span className={ui.muted}>{message}</span> : null}
          </div>
          {createError ? <p className={ui.error}>{createError}</p> : null}
        </form>
      </section>

      <section className={ui.card} aria-labelledby="filter-heading">
        <div className={ui.cardHeader}>
          <h2 id="filter-heading" className={ui.sectionTitle}>
            篩選
          </h2>
          {tasks.data?.meta?.total !== undefined ? (
            <span className={ui.muted}>共 {tasks.data.meta.total} 項</span>
          ) : null}
        </div>
        <div className={ui.filterRow}>
          <div className={ui.field} style={{ flex: '2 1 220px' }}>
            <label className={ui.label} htmlFor="task-q">
              搜尋
            </label>
            <input
              id="task-q"
              className={ui.input}
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="標題或備註"
            />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="task-area">
              領域
            </label>
            <select
              id="task-area"
              className={ui.select}
              value={areaId}
              onChange={(event) => setAreaId(event.target.value)}
            >
              <option value="">全部領域</option>
              {AREA_IDS.map((id) => (
                <option key={id} value={id}>
                  {AREA_NAME_BY_ID[id]}
                </option>
              ))}
            </select>
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="task-status">
              狀態
            </label>
            <select
              id="task-status"
              className={ui.select}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">全部狀態</option>
              {TASK_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {TASK_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="task-archived">
              封存
            </label>
            <select
              id="task-archived"
              className={ui.select}
              value={archived}
              onChange={(event) => setArchived(event.target.value)}
            >
              <option value="exclude">不顯示封存</option>
              <option value="only">只顯示封存</option>
              <option value="all">全部</option>
            </select>
          </div>
        </div>
        <div className={ui.checkboxRow} style={{ marginTop: 10 }}>
          <label>
            <input
              type="checkbox"
              checked={undated}
              onChange={(event) => setUndated(event.target.checked)}
            />
            只顯示無日期
          </label>
          <Link className={ui.inlineLink} to="/inbox">
            到收件箱
          </Link>
        </div>
      </section>

      <section className={ui.card} aria-labelledby="task-list-heading">
        <div className={ui.cardHeader}>
          <h2 id="task-list-heading" className={ui.sectionTitle}>
            任務清單
          </h2>
        </div>
        {tasks.isPending ? <PageStatus compact kind="loading" title="正在讀取任務…" /> : null}
        {tasks.isError ? (
          <PageStatus
            compact
            kind="error"
            title="無法讀取任務"
            onRetry={() => void tasks.refetch()}
          />
        ) : null}
        {tasks.data ? (
          <TaskList
            tasks={tasks.data.data}
            emptyTitle="沒有符合條件的任務"
            emptyDescription="調整篩選，或新增一項任務。"
          />
        ) : null}
      </section>
    </div>
  );
}