import { Link, useParams } from 'react-router-dom';
import { AREA_IDS, AREA_NAME_BY_ID, type AreaId } from '@shared/areas';
import {
  APPLICATION_STAGE_LABELS,
  PROJECT_KIND_LABELS,
  PROJECT_STATUS_LABELS
} from '@shared/enums';
import { formatHongKongShortDate } from '@shared/dates';
import { PageStatus } from '../../components/PageStatus';
import { TaskList } from '../tasks/TaskList';
import { useProjectsQuery, useTasksQuery } from '../workspace/hooks';
import ui from '../../components/ui.module.css';

const APPLICATION_AREAS: AreaId[] = ['degree', 'career-hk', 'internship-sz'];

function newProjectKind(areaId: AreaId): string {
  if (areaId === 'study') return 'course';
  if (areaId === 'degree') return 'degree_application';
  if (areaId === 'career-hk' || areaId === 'internship-sz') return 'job_application';
  return 'general';
}

export function AreaPage() {
  const { areaId } = useParams<{ areaId: string }>();
  const validArea = AREA_IDS.includes(areaId as (typeof AREA_IDS)[number])
    ? (areaId as AreaId)
    : null;
  const projects = useProjectsQuery({ areaId: validArea ?? undefined, limit: '200' });
  const tasks = useTasksQuery({ areaId: validArea ?? undefined, limit: '200' });

  if (!validArea) {
    return (
      <PageStatus
        kind="error"
        title="找不到這個領域"
        description="七個領域是固定的，請從左側導覽進入。"
      />
    );
  }

  const applications = projects.data?.data.filter(
    (project) =>
      project.kind === 'degree_application' || project.kind === 'job_application'
  );

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <p className={ui.eyebrow}>領域</p>
        <h1 className={ui.title}>{AREA_NAME_BY_ID[validArea]}</h1>
        <p className={ui.lede}>
          這個領域的項目與任務；跨領域項目只在這裡以相關項目出現一次。
        </p>
        <div className={ui.actions}>
          <Link
            className={ui.button}
            to={`/projects/new?kind=${newProjectKind(validArea)}&area=${validArea}`}
          >
            {APPLICATION_AREAS.includes(validArea) ? '新增申請' : '新增項目'}
          </Link>
          <Link className={`${ui.button} ${ui.secondary}`} to="/tasks">
            所有任務
          </Link>
        </div>
      </header>

      {APPLICATION_AREAS.includes(validArea) ? (
        <section className={ui.card} aria-labelledby="applications-heading">
          <div className={ui.cardHeader}>
            <h2 id="applications-heading" className={ui.sectionTitle}>
              申請清單
            </h2>
            <span className={ui.muted}>{applications?.length ?? 0} 項</span>
          </div>
          {projects.isPending ? (
            <PageStatus compact kind="loading" title="正在讀取申請…" />
          ) : null}
          {projects.isError ? (
            <PageStatus compact kind="error" title="無法讀取申請" />
          ) : null}
          {applications && applications.length > 0 ? (
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>機構</th>
                    <th>職位／課程</th>
                    <th>階段</th>
                    <th>截止</th>
                    <th>提交日</th>
                    <th>下次跟進</th>
                    <th>回執</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((project) => (
                    <tr key={project.id}>
                      <td>
                        <Link className={ui.rowLink} to={`/projects/${project.id}`}>
                          {project.application?.organizationName ?? project.title}
                        </Link>
                      </td>
                      <td>{project.application?.roleOrProgram ?? project.title}</td>
                      <td>
                        {project.application
                          ? APPLICATION_STAGE_LABELS[project.application.stage]
                          : '—'}
                      </td>
                      <td>
                        {project.dueOn ? formatHongKongShortDate(project.dueOn) : '未設定'}
                      </td>
                      <td>
                        {project.application?.appliedOn
                          ? formatHongKongShortDate(project.application.appliedOn)
                          : '待補'}
                      </td>
                      <td>
                        {project.application?.nextFollowUpOn
                          ? formatHongKongShortDate(project.application.nextFollowUpOn)
                          : '未設定'}
                      </td>
                      <td>{project.application?.receiptVerified ? '已核實' : '未核實'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={ui.empty}>這個領域還未有申請。</p>
          )}
        </section>
      ) : null}

      <section className={ui.card} aria-labelledby="area-projects-heading">
        <div className={ui.cardHeader}>
          <h2 id="area-projects-heading" className={ui.sectionTitle}>
            項目
          </h2>
          <span className={ui.muted}>{projects.data?.data.length ?? 0} 項</span>
        </div>
        {projects.isPending ? (
          <PageStatus compact kind="loading" title="正在讀取項目…" />
        ) : null}
        {projects.data && projects.data.data.length === 0 ? (
          <p className={ui.empty}>這個領域還未有項目。</p>
        ) : null}
        {projects.data && projects.data.data.length > 0 ? (
          <ul className={ui.list}>
            {projects.data.data.map((project) => (
              <li key={project.id} className={ui.row}>
                <Link className={`${ui.rowTitle} ${ui.rowLink}`} to={`/projects/${project.id}`}>
                  {project.title}
                </Link>
                <span className={ui.meta}>
                  <span>{PROJECT_KIND_LABELS[project.kind]}</span>
                  <span>·</span>
                  <span>{PROJECT_STATUS_LABELS[project.status]}</span>
                  {project.application ? (
                    <>
                      <span>·</span>
                      <span>{project.application.organizationName}</span>
                      <span>·</span>
                      <span>{APPLICATION_STAGE_LABELS[project.application.stage]}</span>
                    </>
                  ) : null}
                  {project.dueOn ? (
                    <>
                      <span>·</span>
                      <span>截止 {formatHongKongShortDate(project.dueOn)}</span>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className={ui.card} aria-labelledby="area-tasks-heading">
        <div className={ui.cardHeader}>
          <h2 id="area-tasks-heading" className={ui.sectionTitle}>
            任務
          </h2>
          <span className={ui.muted}>{tasks.data?.meta?.total ?? 0} 項</span>
        </div>
        {tasks.isPending ? (
          <PageStatus compact kind="loading" title="正在讀取任務…" />
        ) : null}
        {tasks.isError ? <PageStatus compact kind="error" title="無法讀取任務" /> : null}
        {tasks.data ? (
          <TaskList
            tasks={tasks.data.data}
            emptyTitle="這個領域未有任務"
            emptyDescription="從所有任務新增，或把現有任務歸類到這個領域。"
          />
        ) : null}
      </section>
    </div>
  );
}