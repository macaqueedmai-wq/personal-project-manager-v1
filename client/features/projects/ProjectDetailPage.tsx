import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type {
  ApiEnvelope,
  ApplicationDto,
  ApplicationStageHistoryDto,
  CourseDto,
  ProjectDto
} from '@shared/api-types';
import {
  APPLICATION_OUTCOMES,
  APPLICATION_OUTCOME_LABELS,
  APPLICATION_STAGES,
  APPLICATION_STAGE_LABELS,
  DEGREE_LEVELS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  WORK_TYPES
} from '@shared/enums';
import { AREA_IDS, AREA_NAME_BY_ID } from '@shared/areas';
import { ApiError, apiRequest } from '../../api/client';
import { PageStatus } from '../../components/PageStatus';
import { TaskList } from '../tasks/TaskList';
import { useSessionQuery } from '../session/useSession';
import {
  useAreasQuery,
  useContactsQuery,
  useProjectQuery,
  useTasksQuery,
  useWorkspaceInvalidate
} from '../workspace/hooks';
import ui from '../../components/ui.module.css';

function toHongKongInput(iso: string | null): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(iso));
  const get = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function localInputToIso(value: string): string | null {
  if (!value) return null;
  return new Date(`${value}:00+08:00`).toISOString();
}

interface BaseForm {
  title: string;
  description: string;
  primaryAreaId: ProjectDto['primaryAreaId'];
  status: ProjectDto['status'];
  dueOn: string;
  dueAtLocal: string;
  nextStep: string;
  tags: string;
  archived: boolean;
}

interface ApplicationForm {
  organizationName: string;
  roleOrProgram: string;
  degreeLevel: string;
  workType: string;
  location: string;
  postingUrl: string;
  portalUrl: string;
  stage: ApplicationDto['stage'];
  outcome: '' | NonNullable<ApplicationDto['outcome']>;
  appliedOn: string;
  receiptVerified: boolean;
  nextFollowUpOn: string;
  notes: string;
}

interface CourseForm {
  courseCode: string;
  term: string;
  instructorName: string;
}

function baseFormFrom(project: ProjectDto): BaseForm {
  return {
    title: project.title,
    description: project.description,
    primaryAreaId: project.primaryAreaId,
    status: project.status,
    dueOn: project.dueOn ?? '',
    dueAtLocal: toHongKongInput(project.dueAt),
    nextStep: project.nextStep,
    tags: project.tags.join(', '),
    archived: project.archivedAt !== null
  };
}

function applicationFormFrom(application: ApplicationDto): ApplicationForm {
  return {
    organizationName: application.organizationName,
    roleOrProgram: application.roleOrProgram,
    degreeLevel: application.degreeLevel ?? '',
    workType: application.workType ?? '',
    location: application.location,
    postingUrl: application.postingUrl,
    portalUrl: application.portalUrl,
    stage: application.stage,
    outcome: application.outcome ?? '',
    appliedOn: application.appliedOn ?? '',
    receiptVerified: application.receiptVerified,
    nextFollowUpOn: application.nextFollowUpOn ?? '',
    notes: application.notes
  };
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const project = useProjectQuery(id);
  const tasks = useTasksQuery({ projectId: id, limit: '200' });
  const areas = useAreasQuery();
  const contacts = useContactsQuery({ limit: '200' });
  const session = useSessionQuery();
  const invalidate = useWorkspaceInvalidate();
  const [base, setBase] = useState<BaseForm | null>(null);
  const [application, setApplication] = useState<ApplicationForm | null>(null);
  const [course, setCourse] = useState<CourseForm | null>(null);
  const [relatedAreaIds, setRelatedAreaIds] = useState<string[]>([]);
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const history = useQuery({
    queryKey: ['project', id, 'application-history'],
    queryFn: () =>
      apiRequest<ApiEnvelope<ApplicationStageHistoryDto[]>>(
        `/projects/${id}/application/history`
      ),
    enabled: Boolean(id) && Boolean(project.data?.data.application)
  });

  useEffect(() => {
    if (project.data) {
      setBase(baseFormFrom(project.data.data));
      setApplication(
        project.data.data.application
          ? applicationFormFrom(project.data.data.application)
          : null
      );
      setCourse(project.data.data.course ?? null);
      setRelatedAreaIds(project.data.data.relatedAreaIds ?? []);
      setContactIds(project.data.data.contactIds ?? []);
    }
  }, [project.data]);

  const saveBase = useMutation({
    mutationFn: (values: BaseForm) => {
      const sessionData = session.data?.data;
      if (!sessionData?.csrfToken || !sessionData.workspaceEpoch || !project.data) {
        throw new Error('登入狀態尚未就緒');
      }
      return apiRequest<ApiEnvelope<ProjectDto>>(`/projects/${project.data.data.id}`, {
        method: 'PATCH',
        body: {
          version: project.data.data.version,
          title: values.title,
          description: values.description,
          primaryAreaId: values.primaryAreaId,
          status: isApplication ? undefined : values.status,
          dueOn: values.dueAtLocal ? null : values.dueOn || null,
          dueAt: localInputToIso(values.dueAtLocal),
          dueTimezone: values.dueAtLocal ? 'Asia/Hong_Kong' : null,
          nextStep: values.nextStep,
          tags: values.tags
            .split(/[,，\s]+/)
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 10),
          archived: values.archived
        },
        csrfToken: sessionData.csrfToken,
        workspaceEpoch: sessionData.workspaceEpoch
      });
    },
    onSuccess: async () => {
      setMessage('項目已儲存');
      setError(null);
      await invalidate();
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof ApiError
          ? Object.values(mutationError.fieldErrors ?? {})[0] ?? mutationError.message
          : mutationError.message
      );
    }
  });

  const saveApplication = useMutation({
    mutationFn: (values: ApplicationForm) => {
      const sessionData = session.data?.data;
      if (!sessionData?.csrfToken || !sessionData.workspaceEpoch || !project.data) {
        throw new Error('登入狀態尚未就緒');
      }
      return apiRequest<ApiEnvelope<ApplicationDto>>(
        `/projects/${project.data.data.id}/application`,
        {
          method: 'PATCH',
          body: {
            version: project.data.data.version,
            organizationName: values.organizationName,
            roleOrProgram: values.roleOrProgram,
            degreeLevel: values.degreeLevel || null,
            workType: values.workType || null,
            location: values.location,
            postingUrl: values.postingUrl,
            portalUrl: values.portalUrl,
            stage: values.stage,
            outcome: values.outcome || null,
            appliedOn: values.appliedOn || null,
            receiptVerified: values.receiptVerified,
            nextFollowUpOn: values.nextFollowUpOn || null,
            notes: values.notes
          },
          csrfToken: sessionData.csrfToken,
          workspaceEpoch: sessionData.workspaceEpoch
        }
      );
    },
    onSuccess: async () => {
      setMessage('申請已儲存');
      setError(null);
      await invalidate();
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof ApiError
          ? Object.values(mutationError.fieldErrors ?? {})[0] ?? mutationError.message
          : mutationError.message
      );
    }
  });

  const saveCourse = useMutation({
    mutationFn: (values: CourseForm) => {
      const sessionData = session.data?.data;
      if (!sessionData?.csrfToken || !sessionData.workspaceEpoch || !project.data) {
        throw new Error('登入狀態尚未就緒');
      }
      return apiRequest<ApiEnvelope<CourseDto>>(`/projects/${project.data.data.id}/course`, {
        method: 'PATCH',
        body: { version: project.data.data.version, ...values },
        csrfToken: sessionData.csrfToken,
        workspaceEpoch: sessionData.workspaceEpoch
      });
    },
    onSuccess: async () => {
      setMessage('課程資料已儲存');
      setError(null);
      await invalidate();
    },
    onError: (mutationError) => {
      setError(mutationError.message);
    }
  });

  const saveRelations = useMutation({
    mutationFn: async () => {
      const sessionData = session.data?.data;
      if (!sessionData?.csrfToken || !sessionData.workspaceEpoch || !project.data) {
        throw new Error('登入狀態尚未就緒');
      }
      let version = project.data.data.version;
      const currentAreas = project.data.data.relatedAreaIds ?? [];
      const currentContacts = project.data.data.contactIds ?? [];
      if (JSON.stringify([...relatedAreaIds].sort()) !== JSON.stringify([...currentAreas].sort())) {
        await apiRequest(`/projects/${project.data.data.id}/related-areas`, {
          method: 'PUT',
          body: { version, areaIds: relatedAreaIds },
          csrfToken: sessionData.csrfToken,
          workspaceEpoch: sessionData.workspaceEpoch
        });
        const latest = await apiRequest<ApiEnvelope<ProjectDto>>(`/projects/${project.data.data.id}`);
        version = latest.data.version;
      }
      if (JSON.stringify([...contactIds].sort()) !== JSON.stringify([...currentContacts].sort())) {
        await apiRequest(`/projects/${project.data.data.id}/contacts`, {
          method: 'PUT',
          body: { version, contactIds },
          csrfToken: sessionData.csrfToken,
          workspaceEpoch: sessionData.workspaceEpoch
        });
      }
    },
    onSuccess: async () => {
      setMessage('已儲存相關領域及人物');
      setError(null);
      await invalidate();
    },
    onError: (mutationError) => setError(mutationError.message)
  });

  if (project.isPending) {
    return <PageStatus kind="loading" title="正在讀取項目…" />;
  }
  if (project.isError || !project.data || !base) {
    return (
      <PageStatus
        kind="error"
        title="找不到項目"
        description="項目可能已被移除，或網址不正確。"
        onRetry={() => void project.refetch()}
      />
    );
  }

  const data = project.data.data;
  const isApplication = Boolean(data.application);

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <p className={ui.eyebrow}>項目詳情</p>
        <h1 className={ui.title}>{data.title}</h1>
        <p className={ui.lede}>
          {AREA_NAME_BY_ID[data.primaryAreaId]} · 版本 {data.version}
          {data.archivedAt ? ' · 已封存' : ''}
        </p>
        <div className={ui.actions}>
          <Link className={`${ui.button} ${ui.secondary}`} to="/projects">
            返回所有項目
          </Link>
          <Link className={`${ui.button} ${ui.secondary}`} to={`/areas/${data.primaryAreaId}`}>
            查看領域
          </Link>
        </div>
      </header>

      {message ? <p className={ui.success}>{message}</p> : null}
      {error ? <p className={ui.error}>{error}</p> : null}

      <section className={ui.card} aria-labelledby="project-base-heading">
        <div className={ui.cardHeader}>
          <h2 id="project-base-heading" className={ui.sectionTitle}>
            基本資料
          </h2>
          <span className={ui.muted}>類型：{data.kind}</span>
        </div>
        <form
          className={ui.form}
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            saveBase.mutate(base);
          }}
        >
          <div className={ui.grid}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="project-title-edit">
                標題
              </label>
              <input
                id="project-title-edit"
                className={ui.input}
                value={base.title}
                maxLength={200}
                onChange={(event) => setBase({ ...base, title: event.target.value })}
              />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="project-area-edit">
                主領域
              </label>
              <select
                id="project-area-edit"
                className={ui.select}
                value={base.primaryAreaId}
                onChange={(event) =>
                  setBase({ ...base, primaryAreaId: event.target.value as ProjectDto['primaryAreaId'] })
                }
              >
                {areas.data?.data.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="project-description-edit">
              描述
            </label>
            <textarea
              id="project-description-edit"
              className={ui.textarea}
              value={base.description}
              onChange={(event) => setBase({ ...base, description: event.target.value })}
            />
          </div>
          <div className={ui.gridThree}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="project-status-edit">
                狀態
              </label>
              <select
                id="project-status-edit"
                className={ui.select}
                value={base.status}
                onChange={(event) =>
                  setBase({ ...base, status: event.target.value as ProjectDto['status'] })
                }
                disabled={isApplication}
              >
                {PROJECT_STATUSES.map((value) => (
                  <option key={value} value={value} disabled={isApplication && (value === 'completed' || value === 'cancelled')}>
                    {PROJECT_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
              {isApplication ? <span className={ui.muted}>申請狀態由階段管理</span> : null}
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="project-due-edit">
                截止日期
              </label>
              <input
                id="project-due-edit"
                type="date"
                className={ui.input}
                value={base.dueOn}
                disabled={Boolean(base.dueAtLocal)}
                onChange={(event) => setBase({ ...base, dueOn: event.target.value })}
              />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="project-due-at-edit">
                截止時間（香港）
              </label>
              <input
                id="project-due-at-edit"
                type="datetime-local"
                className={ui.input}
                value={base.dueAtLocal}
                disabled={Boolean(base.dueOn)}
                onChange={(event) => setBase({ ...base, dueAtLocal: event.target.value })}
              />
            </div>
          </div>
          <div className={ui.grid}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="project-next-edit">
                下一步
              </label>
              <input
                id="project-next-edit"
                className={ui.input}
                value={base.nextStep}
                onChange={(event) => setBase({ ...base, nextStep: event.target.value })}
              />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="project-tags-edit">
                標籤
              </label>
              <input
                id="project-tags-edit"
                className={ui.input}
                value={base.tags}
                onChange={(event) => setBase({ ...base, tags: event.target.value })}
              />
            </div>
          </div>
          <label className={ui.checkboxRow}>
            <input
              type="checkbox"
              checked={base.archived}
              onChange={(event) => setBase({ ...base, archived: event.target.checked })}
            />
            封存項目（其任務暫時從日常清單隱藏）
          </label>
          <div className={ui.actions}>
            <button className={ui.button} type="submit" disabled={saveBase.isPending}>
              {saveBase.isPending ? '儲存中…' : '儲存基本資料'}
            </button>
          </div>
        </form>
      </section>

      {data.application && application ? (
        <section className={ui.card} aria-labelledby="application-heading">
          <div className={ui.cardHeader}>
            <h2 id="application-heading" className={ui.sectionTitle}>
              申請資料
            </h2>
            <span className={ui.muted}>{APPLICATION_STAGE_LABELS[application.stage]}</span>
          </div>
          <form
            className={ui.form}
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              saveApplication.mutate(application);
            }}
          >
            <div className={ui.grid}>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="app-org-edit">
                  機構／學校
                </label>
                <input
                  id="app-org-edit"
                  className={ui.input}
                  value={application.organizationName}
                  onChange={(event) =>
                    setApplication({ ...application, organizationName: event.target.value })
                  }
                />
              </div>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="app-role-edit">
                  職位／課程
                </label>
                <input
                  id="app-role-edit"
                  className={ui.input}
                  value={application.roleOrProgram}
                  onChange={(event) =>
                    setApplication({ ...application, roleOrProgram: event.target.value })
                  }
                />
              </div>
            </div>
            <div className={ui.gridThree}>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="app-stage-edit">
                  階段
                </label>
                <select
                  id="app-stage-edit"
                  className={ui.select}
                  value={application.stage}
                  onChange={(event) =>
                    setApplication({
                      ...application,
                      stage: event.target.value as ApplicationDto['stage']
                    })
                  }
                >
                  {APPLICATION_STAGES.map((value) => (
                    <option key={value} value={value}>
                      {APPLICATION_STAGE_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="app-outcome-edit">
                  結果
                </label>
                <select
                  id="app-outcome-edit"
                  className={ui.select}
                  value={application.outcome}
                  onChange={(event) =>
                    setApplication({
                      ...application,
                      outcome: event.target.value as ApplicationForm['outcome']
                    })
                  }
                >
                  <option value="">未有結果</option>
                  {APPLICATION_OUTCOMES.map((value) => (
                    <option key={value} value={value}>
                      {APPLICATION_OUTCOME_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="app-applied-edit">
                  實際提交日
                </label>
                <input
                  id="app-applied-edit"
                  type="date"
                  className={ui.input}
                  value={application.appliedOn}
                  onChange={(event) =>
                    setApplication({ ...application, appliedOn: event.target.value })
                  }
                />
              </div>
            </div>
            <div className={ui.gridThree}>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="app-follow-edit">
                  下次跟進
                </label>
                <input
                  id="app-follow-edit"
                  type="date"
                  className={ui.input}
                  value={application.nextFollowUpOn}
                  onChange={(event) =>
                    setApplication({ ...application, nextFollowUpOn: event.target.value })
                  }
                />
              </div>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="app-location-edit">
                  地點
                </label>
                <input
                  id="app-location-edit"
                  className={ui.input}
                  value={application.location}
                  onChange={(event) =>
                    setApplication({ ...application, location: event.target.value })
                  }
                />
              </div>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="app-degree-edit">
                  學位程度
                </label>
                <select
                  id="app-degree-edit"
                  className={ui.select}
                  value={application.degreeLevel}
                  onChange={(event) =>
                    setApplication({ ...application, degreeLevel: event.target.value })
                  }
                >
                  <option value="">未設定</option>
                  {DEGREE_LEVELS.map((value) => (
                    <option key={value} value={value}>
                      {value === 'phd' ? '博士' : '碩士'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className={ui.grid}>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="app-work-edit">
                  工作類型
                </label>
                <select
                  id="app-work-edit"
                  className={ui.select}
                  value={application.workType}
                  onChange={(event) =>
                    setApplication({ ...application, workType: event.target.value })
                  }
                >
                  <option value="">未設定</option>
                  {WORK_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {value === 'internship' ? '實習' : '全職'}
                    </option>
                  ))}
                </select>
              </div>
              <label className={ui.checkboxRow}>
                <input
                  type="checkbox"
                  checked={application.receiptVerified}
                  onChange={(event) =>
                    setApplication({
                      ...application,
                      receiptVerified: event.target.checked
                    })
                  }
                />
                已主動核實回執
              </label>
            </div>
            <p className={ui.muted}>
              提交日不會因修改階段而自動填寫；回執只在你主動勾選後才標記為已核實。
            </p>
            <div className={ui.actions}>
              <button className={ui.button} type="submit" disabled={saveApplication.isPending}>
                {saveApplication.isPending ? '儲存中…' : '儲存申請'}
              </button>
            </div>
          </form>

          <div className={ui.cardHeader} style={{ marginTop: 20 }}>
            <h3 className={ui.sectionTitle}>階段歷史</h3>
          </div>
          {history.data && history.data.data.length > 0 ? (
            <ul className={ui.list}>
              {history.data.data.map((entry) => (
                <li key={entry.id} className={ui.row}>
                  <span className={ui.rowTitle}>
                    {entry.fromStage
                      ? `${APPLICATION_STAGE_LABELS[entry.fromStage]} → `
                      : '建立 → '}
                    {APPLICATION_STAGE_LABELS[entry.toStage]}
                  </span>
                  <span className={ui.meta}>
                    {new Date(entry.changedAt).toLocaleString('zh-HK')}
                    {entry.note ? ` · ${entry.note}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={ui.empty}>尚未有階段變更紀錄。</p>
          )}
        </section>
      ) : null}

      {data.course && course ? (
        <section className={ui.card} aria-labelledby="course-heading">
          <div className={ui.cardHeader}>
            <h2 id="course-heading" className={ui.sectionTitle}>
              課程資料
            </h2>
          </div>
          <form
            className={ui.form}
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              saveCourse.mutate(course);
            }}
          >
            <div className={ui.gridThree}>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="course-code-edit">
                  課程編號
                </label>
                <input
                  id="course-code-edit"
                  className={ui.input}
                  value={course.courseCode}
                  onChange={(event) => setCourse({ ...course, courseCode: event.target.value })}
                />
              </div>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="course-term-edit">
                  學期
                </label>
                <input
                  id="course-term-edit"
                  className={ui.input}
                  value={course.term}
                  onChange={(event) => setCourse({ ...course, term: event.target.value })}
                />
              </div>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="course-instructor-edit">
                  導師
                </label>
                <input
                  id="course-instructor-edit"
                  className={ui.input}
                  value={course.instructorName}
                  onChange={(event) =>
                    setCourse({ ...course, instructorName: event.target.value })
                  }
                />
              </div>
            </div>
            <div className={ui.actions}>
              <button className={ui.button} type="submit" disabled={saveCourse.isPending}>
                {saveCourse.isPending ? '儲存中…' : '儲存課程'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className={ui.card}>
        <h2 className={ui.sectionTitle}>相關領域與人物</h2>
        <p className={ui.muted} style={{ marginTop: 6 }}>相關領域不可包含主領域；人物可關聯多個項目與活動。</p>
        <div className={ui.checkboxRow} style={{ marginTop: 12 }}>
          {AREA_IDS.filter((area) => area !== data.primaryAreaId).map((area) => (
            <label key={area}>
              <input
                type="checkbox"
                checked={relatedAreaIds.includes(area)}
                onChange={(event) =>
                  setRelatedAreaIds((current) =>
                    event.target.checked ? [...current, area] : current.filter((idValue) => idValue !== area)
                  )
                }
              />
              {AREA_NAME_BY_ID[area]}
            </label>
          ))}
        </div>
        <div className={ui.checkboxRow} style={{ marginTop: 12 }}>
          {(contacts.data?.data ?? []).map((contact) => (
            <label key={contact.id}>
              <input
                type="checkbox"
                checked={contactIds.includes(contact.id)}
                onChange={(event) =>
                  setContactIds((current) =>
                    event.target.checked
                      ? [...current, contact.id]
                      : current.filter((idValue) => idValue !== contact.id)
                  )
                }
              />
              {contact.name}
            </label>
          ))}
        </div>
        <div className={ui.actions} style={{ marginTop: 12 }}>
          <button className={`${ui.button} ${ui.secondary}`} type="button" disabled={saveRelations.isPending} onClick={() => saveRelations.mutate()}>
            {saveRelations.isPending ? '儲存中…' : '儲存關聯'}
          </button>
        </div>
        {saveRelations.error ? <p className={ui.error}>{saveRelations.error.message}</p> : null}
      </section>

      <section className={ui.card}>
        <div className={ui.cardHeader}>
          <h2 className={ui.sectionTitle}>項目任務</h2>
          <Link className={ui.inlineLink} to="/tasks">
            所有任務
          </Link>
        </div>
        {tasks.isPending ? <PageStatus compact kind="loading" title="正在讀取任務…" /> : null}
        {tasks.isError ? <PageStatus compact kind="error" title="無法讀取任務" /> : null}
        {tasks.data ? (
          <TaskList
            tasks={tasks.data.data}
            emptyTitle="此項目未有任務"
            emptyDescription="在新增任務時選擇此項目，任務會自動繼承主領域。"
          />
        ) : null}
      </section>
    </div>
  );
}