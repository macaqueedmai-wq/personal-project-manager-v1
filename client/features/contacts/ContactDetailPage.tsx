import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ApiEnvelope, ContactDto, InteractionDto } from '@shared/api-types';
import { formatHongKongDateTime } from '@shared/dates';

const INTERACTION_KIND_LABELS: Record<InteractionDto['kind'], string> = {
  message: '訊息',
  call: '電話',
  meeting: '會面',
  other: '其他'
};
import { ApiError, apiRequest } from '../../api/client';
import { PageStatus } from '../../components/PageStatus';
import {
  useContactQuery,
  useInteractionsQuery,
  useProjectsQuery,
  useWorkspaceInvalidate,
  useWriteContext
} from '../workspace/hooks';
import ui from '../../components/ui.module.css';

function toInstant(value: string): string {
  return new Date(`${value}:00+08:00`).toISOString();
}

function toLocalInput(instant: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date(instant));
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function ContactDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const context = useWriteContext();
  const invalidate = useWorkspaceInvalidate();
  const contact = useContactQuery(id);
  const interactions = useInteractionsQuery(id);
  const projects = useProjectsQuery({ limit: '200' });
  const [form, setForm] = useState<ContactDto | null>(null);
  const [summary, setSummary] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [kind, setKind] = useState<InteractionDto['kind']>('message');
  const [projectId, setProjectId] = useState('');
  const [editingInteraction, setEditingInteraction] = useState<InteractionDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (contact.data) setForm(contact.data.data);
  }, [contact.data]);

  const save = useMutation({
    mutationFn: () => {
      if (!form || !context.csrfToken || !context.workspaceEpoch) throw new Error('登入狀態尚未就緒');
      return apiRequest<ApiEnvelope<ContactDto>>(`/contacts/${form.id}`, {
        method: 'PATCH',
        csrfToken: context.csrfToken,
        workspaceEpoch: context.workspaceEpoch,
        body: {
          version: form.version,
          name: form.name,
          organization: form.organization,
          role: form.role,
          email: form.email,
          phone: form.phone,
          profileUrl: form.profileUrl,
          relationshipTags: form.relationshipTags,
          howMet: form.howMet,
          notes: form.notes,
          nextContactOn: form.nextContactOn
        }
      });
    },
    onSuccess: async (response) => {
      setForm(response.data);
      setMessage('已儲存');
      await invalidate();
    }
  });

  const addInteraction = useMutation({
    mutationFn: () => {
      if (!context.csrfToken || !context.workspaceEpoch) throw new Error('登入狀態尚未就緒');
      return apiRequest<ApiEnvelope<InteractionDto>>(`/contacts/${id}/interactions`, {
        method: 'POST',
        csrfToken: context.csrfToken,
        workspaceEpoch: context.workspaceEpoch,
        body: {
          occurredAt: toInstant(occurredAt),
          kind,
          summary,
          projectId: projectId || null
        }
      });
    },
    onSuccess: async () => {
      setSummary('');
      setMessage('已新增互動');
      await invalidate();
    }
  });

  const saveInteraction = useMutation({
    mutationFn: () => {
      if (!editingInteraction || !form || !context.csrfToken || !context.workspaceEpoch) {
        throw new Error('登入狀態尚未就緒');
      }
      return apiRequest<ApiEnvelope<InteractionDto>>(`/interactions/${editingInteraction.id}`, {
        method: 'PATCH',
        csrfToken: context.csrfToken,
        workspaceEpoch: context.workspaceEpoch,
        body: {
          version: form.version,
          occurredAt: editingInteraction.occurredAt,
          kind: editingInteraction.kind,
          summary: editingInteraction.summary,
          projectId: editingInteraction.projectId
        }
      });
    },
    onSuccess: async () => {
      setEditingInteraction(null);
      setMessage('已更新互動');
      await invalidate();
    }
  });

  const archive = useMutation({
    mutationFn: () => {
      if (!form || !context.csrfToken || !context.workspaceEpoch) throw new Error('登入狀態尚未就緒');
      return apiRequest<ApiEnvelope<ContactDto>>(`/contacts/${form.id}`, {
        method: 'PATCH',
        csrfToken: context.csrfToken,
        workspaceEpoch: context.workspaceEpoch,
        body: { version: form.version, archived: true }
      });
    },
    onSuccess: async () => {
      await invalidate();
      navigate('/contacts');
    }
  });

  if (contact.isPending) return <PageStatus kind="loading" title="正在讀取人物…" />;
  if (contact.isError || !form) {
    return <PageStatus kind="error" title="找不到人物" onRetry={() => void contact.refetch()} />;
  }

  const error = save.error instanceof ApiError ? save.error.message : save.error?.message;
  const interactionError =
    addInteraction.error instanceof ApiError
      ? addInteraction.error.message
      : addInteraction.error?.message;
  const update = (patch: Partial<ContactDto>): void => setForm({ ...form, ...patch });
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    save.mutate();
  };
  const submitInteraction = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!summary.trim() || !occurredAt) {
      setMessage('請輸入互動時間及摘要');
      return;
    }
    addInteraction.mutate();
  };

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <p className={ui.eyebrow}>人物詳情</p>
        <h1 className={ui.title}>{form.name}</h1>
        <div className={ui.actions}>
          <Link className={`${ui.button} ${ui.secondary}`} to="/contacts">返回人物</Link>
          {form.lastInteractionAt ? <span className={ui.muted}>最近互動 {formatHongKongDateTime(form.lastInteractionAt)}</span> : null}
        </div>
      </header>

      <div className={ui.grid}>
        <section className={ui.card}>
          <h2 className={ui.sectionTitle}>基本資料</h2>
          <form className={ui.form} onSubmit={submit} style={{ marginTop: 12 }}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="contact-edit-name">姓名</label>
              <input id="contact-edit-name" className={ui.input} value={form.name} onChange={(e) => update({ name: e.target.value })} />
            </div>
            <div className={ui.filterRow}>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="contact-edit-org">機構</label>
                <input id="contact-edit-org" className={ui.input} value={form.organization} onChange={(e) => update({ organization: e.target.value })} />
              </div>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="contact-edit-role">職位／關係</label>
                <input id="contact-edit-role" className={ui.input} value={form.role} onChange={(e) => update({ role: e.target.value })} />
              </div>
            </div>
            <div className={ui.filterRow}>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="contact-edit-email">電郵</label>
                <input id="contact-edit-email" className={ui.input} value={form.email} onChange={(e) => update({ email: e.target.value })} />
              </div>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="contact-edit-phone">電話</label>
                <input id="contact-edit-phone" className={ui.input} value={form.phone} onChange={(e) => update({ phone: e.target.value })} />
              </div>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="contact-edit-profile">個人檔案連結</label>
              <input id="contact-edit-profile" type="url" className={ui.input} value={form.profileUrl} onChange={(e) => update({ profileUrl: e.target.value })} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="contact-edit-tags">關係標籤（逗號分隔）</label>
              <input id="contact-edit-tags" className={ui.input} value={form.relationshipTags.join(', ')} onChange={(e) => update({ relationshipTags: e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="contact-edit-next">下次聯絡</label>
              <input id="contact-edit-next" type="date" className={ui.input} value={form.nextContactOn ?? ''} onChange={(e) => update({ nextContactOn: e.target.value || null })} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="contact-edit-how">如何認識</label>
              <input id="contact-edit-how" className={ui.input} value={form.howMet} onChange={(e) => update({ howMet: e.target.value })} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="contact-edit-notes">備註</label>
              <textarea id="contact-edit-notes" className={ui.textarea} value={form.notes} onChange={(e) => update({ notes: e.target.value })} />
            </div>
            <div className={ui.actions}>
              <button className={ui.button} type="submit" disabled={save.isPending}>{save.isPending ? '儲存中…' : '儲存'}</button>
              <button className={`${ui.button} ${ui.danger}`} type="button" onClick={() => archive.mutate()} disabled={archive.isPending}>封存人物</button>
              {message ? <span className={ui.muted}>{message}</span> : null}
            </div>
            {error ? <p className={ui.error}>{error}</p> : null}
          </form>
        </section>

        <section className={ui.card}>
          <h2 className={ui.sectionTitle}>新增互動</h2>
          <form className={ui.form} onSubmit={submitInteraction} style={{ marginTop: 12 }}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="interaction-at">發生時間</label>
              <input id="interaction-at" type="datetime-local" className={ui.input} value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="interaction-kind">類型</label>
              <select id="interaction-kind" className={ui.select} value={kind} onChange={(e) => setKind(e.target.value as InteractionDto['kind'])}>
                {Object.entries(INTERACTION_KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="interaction-summary">摘要</label>
              <textarea id="interaction-summary" className={ui.textarea} value={summary} onChange={(e) => setSummary(e.target.value)} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="interaction-project">相關項目</label>
              <select id="interaction-project" className={ui.select} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">無</option>
                {projects.data?.data.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
              </select>
            </div>
            <button className={ui.button} type="submit" disabled={addInteraction.isPending}>{addInteraction.isPending ? '儲存中…' : '新增互動'}</button>
            {interactionError ? <p className={ui.error}>{interactionError}</p> : null}
          </form>
        </section>
      </div>

      <section className={ui.card}>
        <div className={ui.cardHeader}>
          <h2 className={ui.sectionTitle}>互動時間線</h2>
          <span className={ui.muted}>{interactions.data?.data.length ?? 0} 筆</span>
        </div>
        {interactions.isPending ? <PageStatus compact kind="loading" title="正在讀取互動…" /> : null}
        {interactions.data && interactions.data.data.length === 0 ? <p className={ui.empty}>還沒有互動紀錄。</p> : null}
        {interactions.data && interactions.data.data.length > 0 ? (
          <ul className={ui.list}>
            {interactions.data.data.map((interaction) => (
              <li key={interaction.id} className={ui.row}>
                <span className={ui.meta}>
                  <span className={ui.badge}>{INTERACTION_KIND_LABELS[interaction.kind]}</span>
                  <span>{formatHongKongDateTime(interaction.occurredAt)}</span>
                </span>
                {editingInteraction?.id === interaction.id ? (
                  <div className={ui.form}>
                    <input className={ui.input} value={editingInteraction.summary} onChange={(e) => setEditingInteraction({ ...editingInteraction, summary: e.target.value })} />
                    <input className={ui.input} type="datetime-local" value={toLocalInput(editingInteraction.occurredAt)} onChange={(e) => setEditingInteraction({ ...editingInteraction, occurredAt: toInstant(e.target.value) })} />
                    <div className={ui.actions}>
                      <button className={ui.button} type="button" onClick={() => saveInteraction.mutate()} disabled={saveInteraction.isPending}>儲存互動</button>
                      <button className={`${ui.button} ${ui.secondary}`} type="button" onClick={() => setEditingInteraction(null)}>取消</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p>{interaction.summary}</p>
                    <button className={ui.inlineLink} type="button" style={{ alignSelf: 'flex-start', background: 'none', border: 0, padding: 0 }} onClick={() => setEditingInteraction({ ...interaction })}>修改</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}