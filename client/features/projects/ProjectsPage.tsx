import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AREA_NAME_BY_ID } from '@shared/areas';
import {
  APPLICATION_STAGE_LABELS,
  PROJECT_KIND_LABELS,
  PROJECT_STATUS_LABELS
} from '@shared/enums';
import { PageStatus } from '../../components/PageStatus';
import { useProjectsQuery } from '../workspace/hooks';
import ui from '../../components/ui.module.css';

export function ProjectsPage() {
  const [archived, setArchived] = useState('exclude');
  const projects = useProjectsQuery({ archived, limit: '200' });

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <p className={ui.eyebrow}>項目</p>
        <h1 className={ui.title}>所有項目</h1>
        <p className={ui.lede}>
          課程與申請共用項目資料；項目詳情可更新階段、回執與截止日期。
        </p>
        <div className={ui.actions}>
          <Link className={ui.button} to="/projects/new">
            新增項目
          </Link>
          <select
            className={ui.select}
            style={{ maxWidth: 220 }}
            value={archived}
            onChange={(event) => setArchived(event.target.value)}
            aria-label="封存篩選"
          >
            <option value="exclude">不顯示封存</option>
            <option value="only">只顯示封存</option>
            <option value="all">全部</option>
          </select>
        </div>
      </header>

      <section className={ui.card}>
        {projects.isPending ? <PageStatus compact kind="loading" title="正在讀取項目…" /> : null}
        {projects.isError ? (
          <PageStatus
            compact
            kind="error"
            title="無法讀取項目"
            onRetry={() => void projects.refetch()}
          />
        ) : null}
        {projects.data && projects.data.data.length === 0 ? (
          <p className={ui.empty}>還沒有項目。建立一個課程、申請或一般項目。</p>
        ) : null}
        {projects.data && projects.data.data.length > 0 ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>項目</th>
                  <th>類型</th>
                  <th>主領域</th>
                  <th>狀態</th>
                  <th>申請資料</th>
                  <th>更新</th>
                </tr>
              </thead>
              <tbody>
                {projects.data.data.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <Link className={ui.rowLink} to={`/projects/${project.id}`}>
                        {project.title}
                      </Link>
                      <p className={ui.muted}>{project.nextStep || '未設定下一步'}</p>
                    </td>
                    <td>{PROJECT_KIND_LABELS[project.kind]}</td>
                    <td>{AREA_NAME_BY_ID[project.primaryAreaId]}</td>
                    <td>
                      {PROJECT_STATUS_LABELS[project.status]}
                      {project.archivedAt ? '（已封存）' : ''}
                    </td>
                    <td>
                      {project.application
                        ? `${project.application.organizationName} · ${
                            APPLICATION_STAGE_LABELS[project.application.stage]
                          }${project.application.receiptVerified ? ' · 回執已核實' : ''}`
                        : project.course
                          ? `${project.course.courseCode || '課程'} ${project.course.term}`
                          : '—'}
                    </td>
                    <td>{new Date(project.updatedAt).toLocaleString('zh-HK')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}