import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ApiEnvelope, ResourceDto, ResourceLinkDto } from '@shared/api-types';
import { ApiError, apiRequest } from '../../api/client';
import { PageStatus } from '../../components/PageStatus';
import {
  useContactsQuery,
  useEventsQuery,
  useProjectsQuery,
  useResourceLinksQuery,
  useResourceQuery,
  useTasksQuery,
  useWorkspaceInvalidate,
  useWriteContext
} from '../workspace/hooks';
import ui from '../../components/ui.module.css';

type LinkType = 'projectId' | 'taskId' | 'eventId' | 'contactId';

export function ResourceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const context = useWriteContext();
  const invalidate = useWorkspaceInvalidate();
  const resource = useResourceQuery(id);
  const links = useResourceLinksQuery(id);
  const projects = useProjectsQuery({ limit: '200' });
  const tasks = useTasksQuery({ limit: '200' });
  const events = useEventsQuery({ limit: '200' });
  const contacts = useContactsQuery({ limit: '200' });
  const [form, setForm] = useState<ResourceDto | null>(null);
  const [linkType, setLinkType] = useState<LinkType>('projectId');
  const [linkTargetId, setLinkTargetId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (resource.data) setForm(resource.data.data);
  }, [resource.data]);

  const save = useMutation({
    mutationFn: () => {
      if (!form || !context.csrfToken || !context.workspaceEpoch) throw new Error('登入狀態尚未就緒');
      return apiRequest<ApiEnvelope<ResourceDto>>(`/resources/${form.id}`, {
        method: 'PATCH',
        csrfToken: context.csrfToken,
        workspaceEpoch: context.workspaceEpoch,
        body: {
          version: form.version,
          title: form.title,
          kind: form.kind,
          target: form.target,
          versionLabel: form.versionLabel,
          notes: form.notes,
          tags: form.tags
        }
      });
    },
    onSuccess: async (response) => {
      setForm(response.data);
      setMessage('已儲存');
      await invalidate();
    }
  });

  const addLink = useMutation({
    mutationFn: () => {
      if (!form || !context.csrfToken || !context.workspaceEpoch) throw new Error('登入狀態尚未就緒');
      return apiRequest<ApiEnvelope<ResourceLinkDto>>(`/resources/${form.id}/links`, {
        method: 'POST',
        csrfToken: context.csrfToken,
        workspaceEpoch: context.workspaceEpoch,
        body: { version: form.version, [linkType]: linkTargetId }
      });
    },
    onSuccess: async () => {
      setLinkTargetId('');
      setMessage('已新增關聯');
      await invalidate();
    }
  });

  const removeLink = useMutation({
    mutationFn: (linkId: string) => {
      if (!form || !context.csrfToken || !context.workspaceEpoch) throw new Error('登入狀態尚未就緒');
      return apiRequest<ApiEnvelope<{ ok: true }>>(`/resources/${form.id}/links/${linkId}?version=${form.version}`, {
        method: 'DELETE',
        csrfToken: context.csrfToken,
        workspaceEpoch: context.workspaceEpoch
      });
    },
    onSuccess: async () => {
      setMessage('已移除關聯');
      await invalidate();
    }
  });

  const archive = useMutation({
    mutationFn: () => {
      if (!form || !context.csrfToken || !context.workspaceEpoch) throw new Error('登入狀態尚未就緒');
      return apiRequest<ApiEnvelope<ResourceDto>>(`/resources/${form.id}`, {
        method: 'PATCH',
        csrfToken: context.csrfToken,
        workspaceEpoch: context.workspaceEpoch,
        body: { version: form.version, archived: true }
      });
    },
    onSuccess: async () => {
      await invalidate();
      navigate('/resources');
    }
  });

  if (resource.isPending) return <PageStatus kind="loading" title="正在讀取文件連結…" />;
  if (resource.isError || !form) {
    return <PageStatus kind="error" title="找不到文件連結" onRetry={() => void resource.refetch()} />;
  }

  const error = save.error instanceof ApiError ? save.error.message : save.error?.message;
  const linkError = addLink.error instanceof ApiError ? addLink.error.message : addLink.error?.message;
  const update = (patch: Partial<ResourceDto>): void => setForm({ ...form, ...patch });
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    save.mutate();
  };

  const targetOptions: Array<{ id: string; label: string }> =
    linkType === 'projectId'
      ? (projects.data?.data ?? []).map((project) => ({ id: project.id, label: project.title }))
      : linkType === 'taskId'
        ? (tasks.data?.data ?? []).map((task) => ({ id: task.id, label: task.title }))
        : linkType === 'eventId'
          ? (events.data?.data ?? []).map((event) => ({ id: event.id, label: event.title }))
          : (contacts.data?.data ?? []).map((contact) => ({ id: contact.id, label: contact.name }));

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <p className={ui.eyebrow}>文件連結</p>
        <h1 className={ui.title}>{form.title}</h1>
        <div className={ui.actions}>
          <Link className={`${ui.button} ${ui.secondary}`} to="/resources">返回文件</Link>
          {form.kind === 'web_link' ? <a className={`${ui.button} ${ui.secondary}`} href={form.target} target="_blank" rel="noreferrer">開啟連結</a> : null}
          <button className={`${ui.button} ${ui.secondary}`} type="button" onClick={() => void navigator.clipboard?.writeText(form.target)}>複製路徑</button>
        </div>
        {form.kind === 'local_path' ? <p className={ui.muted}>本機路徑只保存文字；此應用不會讀取、驗證或上傳該檔案。</p> : null}
      </header>

      <div className={ui.grid}>
        <section className={ui.card}>
          <h2 className={ui.sectionTitle}>資料</h2>
          <form className={ui.form} onSubmit={submit} style={{ marginTop: 12 }}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="resource-edit-title">標題</label>
              <input id="resource-edit-title" className={ui.input} value={form.title} onChange={(e) => update({ title: e.target.value })} />
            </div>
            <div className={ui.filterRow}>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="resource-edit-kind">類型</label>
                <select id="resource-edit-kind" className={ui.select} value={form.kind} onChange={(e) => update({ kind: e.target.value as ResourceDto['kind'] })}>
                  <option value="web_link">網頁連結</option>
                  <option value="local_path">本機文字路徑</option>
                </select>
              </div>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="resource-edit-version">版本標籤</label>
                <input id="resource-edit-version" className={ui.input} value={form.versionLabel} onChange={(e) => update({ versionLabel: e.target.value })} />
              </div>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="resource-edit-target">連結／路徑</label>
              <input id="resource-edit-target" className={ui.input} value={form.target} onChange={(e) => update({ target: e.target.value })} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="resource-edit-notes">備註</label>
              <textarea id="resource-edit-notes" className={ui.textarea} value={form.notes} onChange={(e) => update({ notes: e.target.value })} />
            </div>
            <div className={ui.actions}>
              <button className={ui.button} type="submit" disabled={save.isPending}>{save.isPending ? '儲存中…' : '儲存'}</button>
              <button className={`${ui.button} ${ui.danger}`} type="button" disabled={archive.isPending} onClick={() => archive.mutate()}>封存</button>
              {message ? <span className={ui.muted}>{message}</span> : null}
            </div>
            {error ? <p className={ui.error}>{error}</p> : null}
          </form>
        </section>

        <section className={ui.card}>
          <h2 className={ui.sectionTitle}>關聯</h2>
          <p className={ui.muted} style={{ marginTop: 4 }}>連結可同時關聯項目、任務、活動及人物；解除只移除關係。</p>
          <div className={ui.form} style={{ marginTop: 12 }}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="link-type">對象類型</label>
              <select id="link-type" className={ui.select} value={linkType} onChange={(e) => { setLinkType(e.target.value as LinkType); setLinkTargetId(''); }}>
                <option value="projectId">項目</option>
                <option value="taskId">任務</option>
                <option value="eventId">活動</option>
                <option value="contactId">人物</option>
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="link-target">對象</label>
              <select id="link-target" className={ui.select} value={linkTargetId} onChange={(e) => setLinkTargetId(e.target.value)}>
                <option value="">選擇…</option>
                {targetOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>
            <button className={ui.button} type="button" disabled={!linkTargetId || addLink.isPending} onClick={() => addLink.mutate()}>{addLink.isPending ? '新增中…' : '新增關聯'}</button>
            {linkError ? <p className={ui.error}>{linkError}</p> : null}
          </div>

          <ul className={ui.list} style={{ marginTop: 16 }}>
            {(links.data?.data ?? []).length === 0 ? <li className={ui.empty}>尚未建立關聯。</li> : null}
            {(links.data?.data ?? []).map((link) => {
              const type = link.projectId ? '項目' : link.taskId ? '任務' : link.eventId ? '活動' : '人物';
              const target = link.projectId ?? link.taskId ?? link.eventId ?? link.contactId ?? '';
              const label =
                projects.data?.data.find((project) => project.id === target)?.title ??
                tasks.data?.data.find((task) => task.id === target)?.title ??
                events.data?.data.find((event) => event.id === target)?.title ??
                contacts.data?.data.find((contact) => contact.id === target)?.name ??
                target;
              return (
                <li key={link.id} className={ui.row}>
                  <span className={ui.rowTitle}>{type}：{label}</span>
                  <button className={`${ui.button} ${ui.danger}`} type="button" style={{ alignSelf: 'flex-start' }} onClick={() => removeLink.mutate(link.id)}>解除</button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}