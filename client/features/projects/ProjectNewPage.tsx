import { useMemo, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ApiEnvelope, ProjectDto } from '@shared/api-types';
import type { AreaId } from '@shared/areas';
import {
  APPLICATION_STAGES,
  APPLICATION_STAGE_LABELS,
  DEGREE_LEVELS,
  PROJECT_KINDS,
  PROJECT_KIND_LABELS,
  WORK_TYPES
} from '@shared/enums';
import { ApiError, apiRequest } from '../../api/client';
import { PageStatus } from '../../components/PageStatus';
import { useSessionQuery } from '../session/useSession';
import { useAreasQuery, useWorkspaceInvalidate } from '../workspace/hooks';
import ui from '../../components/ui.module.css';

export function ProjectNewPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const areas = useAreasQuery();
  const session = useSessionQuery();
  const invalidate = useWorkspaceInvalidate();
  const initialKind = (searchParams.get('kind') as ProjectDto['kind'] | null) ?? 'general';
  const initialArea = (searchParams.get('area') as AreaId | null) ?? null;

  const [kind, setKind] = useState<ProjectDto['kind']>(
    PROJECT_KINDS.includes(initialKind as (typeof PROJECT_KINDS)[number])
      ? initialKind
      : 'general'
  );
  const [title, setTitle] = useState('');
  const [areaId, setAreaId] = useState<AreaId | ''>(initialArea ?? '');
  const [dueOn, setDueOn] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [term, setTerm] = useState('');
  const [instructorName, setInstructorName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [roleOrProgram, setRoleOrProgram] = useState('');
  const [location, setLocation] = useState('');
  const [degreeLevel, setDegreeLevel] = useState('');
  const [workType, setWorkType] = useState('');
  const [stage, setStage] = useState<(typeof APPLICATION_STAGES)[number]>('exploring');
  const [appliedOn, setAppliedOn] = useState('');
  const [nextFollowUpOn, setNextFollowUpOn] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const effectiveArea = useMemo<AreaId | ''>(() => {
    if (kind === 'course') return 'study';
    if (kind === 'degree_application') return 'degree';
    if (kind === 'job_application') return areaId || 'career-hk';
    return areaId;
  }, [areaId, kind]);

  const create = useMutation({
    mutationFn: () => {
      const sessionData = session.data?.data;
      if (!sessionData?.csrfToken || !sessionData.workspaceEpoch) {
        throw new Error('登入狀態尚未就緒');
      }
      if (!effectiveArea) {
        throw new Error('請選擇主領域');
      }
      if (!title.trim()) {
        throw new Error('請輸入項目標題');
      }

      const body: Record<string, unknown> = {
        primaryAreaId: effectiveArea,
        title,
        kind,
        dueOn: dueOn || null,
        nextStep
      };

      if (kind === 'course') {
        body.course = { courseCode, term, instructorName };
      }
      if (kind === 'degree_application' || kind === 'job_application') {
        body.application = {
          applicationType: kind === 'degree_application' ? 'degree' : 'job',
          organizationName,
          roleOrProgram,
          degreeLevel: kind === 'degree_application' ? degreeLevel || null : null,
          workType: kind === 'job_application' ? workType || null : null,
          location,
          stage,
          appliedOn: appliedOn || null,
          nextFollowUpOn: nextFollowUpOn || null,
          notes
        };
      }

      return apiRequest<ApiEnvelope<ProjectDto>>('/projects', {
        method: 'POST',
        body,
        csrfToken: sessionData.csrfToken,
        workspaceEpoch: sessionData.workspaceEpoch
      });
    },
    onSuccess: async (response) => {
      await invalidate();
      navigate(`/projects/${response.data.id}`);
    }
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setError(null);
    create.mutate(undefined, {
      onError: (mutationError) => {
        setError(
          mutationError instanceof ApiError
            ? Object.values(mutationError.fieldErrors ?? {})[0] ?? mutationError.message
            : mutationError.message
        );
      }
    });
  };

  if (areas.isPending) {
    return <PageStatus kind="loading" title="正在載入領域…" />;
  }
  if (areas.isError) {
    return <PageStatus kind="error" title="無法載入領域" onRetry={() => void areas.refetch()} />;
  }

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <p className={ui.eyebrow}>新項目</p>
        <h1 className={ui.title}>建立項目</h1>
        <p className={ui.lede}>
          項目類型建立後不可修改。課程與申請的主領域有固定限制。
        </p>
      </header>

      <section className={ui.card}>
        <form className={ui.form} onSubmit={handleSubmit}>
          <div className={ui.gridThree}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="project-kind">
                類型
              </label>
              <select
                id="project-kind"
                className={ui.select}
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as ProjectDto['kind']);
                  setAreaId('');
                }}
              >
                {PROJECT_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {PROJECT_KIND_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="project-area">
                主領域
              </label>
              <select
                id="project-area"
                className={ui.select}
                value={effectiveArea}
                onChange={(event) => setAreaId(event.target.value as AreaId)}
                disabled={kind !== 'general' && kind !== 'job_application'}
              >
                <option value="">請選擇</option>
                {areas.data?.data.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="project-due">
                截止日期
              </label>
              <input
                id="project-due"
                type="date"
                className={ui.input}
                value={dueOn}
                onChange={(event) => setDueOn(event.target.value)}
              />
            </div>
          </div>

          <div className={ui.field}>
            <label className={ui.label} htmlFor="project-title">
              項目標題
            </label>
            <input
              id="project-title"
              className={ui.input}
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className={ui.field}>
            <label className={ui.label} htmlFor="project-next">
              下一步
            </label>
            <input
              id="project-next"
              className={ui.input}
              value={nextStep}
              maxLength={200}
              onChange={(event) => setNextStep(event.target.value)}
            />
          </div>

          {kind === 'course' ? (
            <div className={ui.gridThree}>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="course-code">
                  課程編號
                </label>
                <input
                  id="course-code"
                  className={ui.input}
                  value={courseCode}
                  onChange={(event) => setCourseCode(event.target.value)}
                />
              </div>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="course-term">
                  學期
                </label>
                <input
                  id="course-term"
                  className={ui.input}
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                />
              </div>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="course-instructor">
                  導師
                </label>
                <input
                  id="course-instructor"
                  className={ui.input}
                  value={instructorName}
                  onChange={(event) => setInstructorName(event.target.value)}
                />
              </div>
            </div>
          ) : null}

          {kind === 'degree_application' || kind === 'job_application' ? (
            <>
              <div className={ui.grid}>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="app-organization">
                    機構／學校
                  </label>
                  <input
                    id="app-organization"
                    className={ui.input}
                    value={organizationName}
                    onChange={(event) => setOrganizationName(event.target.value)}
                  />
                </div>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="app-role">
                    {kind === 'degree_application' ? '課程／學位' : '職位'}
                  </label>
                  <input
                    id="app-role"
                    className={ui.input}
                    value={roleOrProgram}
                    onChange={(event) => setRoleOrProgram(event.target.value)}
                  />
                </div>
              </div>
              <div className={ui.gridThree}>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="app-stage">
                    階段
                  </label>
                  <select
                    id="app-stage"
                    className={ui.select}
                    value={stage}
                    onChange={(event) =>
                      setStage(event.target.value as (typeof APPLICATION_STAGES)[number])
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
                  <label className={ui.label} htmlFor="app-applied">
                    實際提交日
                  </label>
                  <input
                    id="app-applied"
                    type="date"
                    className={ui.input}
                    value={appliedOn}
                    onChange={(event) => setAppliedOn(event.target.value)}
                  />
                </div>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="app-follow-up">
                    下次跟進
                  </label>
                  <input
                    id="app-follow-up"
                    type="date"
                    className={ui.input}
                    value={nextFollowUpOn}
                    onChange={(event) => setNextFollowUpOn(event.target.value)}
                  />
                </div>
              </div>
              <div className={ui.gridThree}>
                {kind === 'degree_application' ? (
                  <div className={ui.field}>
                    <label className={ui.label} htmlFor="app-degree">
                      學位程度
                    </label>
                    <select
                      id="app-degree"
                      className={ui.select}
                      value={degreeLevel}
                      onChange={(event) => setDegreeLevel(event.target.value)}
                    >
                      <option value="">未設定</option>
                      {DEGREE_LEVELS.map((value) => (
                        <option key={value} value={value}>
                          {value === 'phd' ? '博士' : '碩士'}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className={ui.field}>
                    <label className={ui.label} htmlFor="app-work">
                      工作類型
                    </label>
                    <select
                      id="app-work"
                      className={ui.select}
                      value={workType}
                      onChange={(event) => setWorkType(event.target.value)}
                    >
                      <option value="">未設定</option>
                      {WORK_TYPES.map((value) => (
                        <option key={value} value={value}>
                          {value === 'internship' ? '實習' : '全職'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="app-location">
                    地點
                  </label>
                  <input
                    id="app-location"
                    className={ui.input}
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                  />
                </div>
              </div>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="app-notes">
                  備註
                </label>
                <textarea
                  id="app-notes"
                  className={ui.textarea}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
              <p className={ui.muted}>
                未提交的申請請保持提交日空白；回執核實由項目詳情另外確認。
              </p>
            </>
          ) : null}

          {error ? <p className={ui.error}>{error}</p> : null}
          <div className={ui.actions}>
            <button className={ui.button} type="submit" disabled={create.isPending}>
              {create.isPending ? '建立中…' : '建立項目'}
            </button>
            {create.error && !error ? (
              <span className={ui.error}>{create.error.message}</span>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}