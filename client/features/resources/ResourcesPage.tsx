import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { ApiEnvelope, ResourceDto } from '@shared/api-types';
import { ApiError, apiRequest } from '../../api/client';
import { PageStatus } from '../../components/PageStatus';
import { useResourcesQuery, useWorkspaceInvalidate, useWriteContext } from '../workspace/hooks';
import ui from '../../components/ui.module.css';

export function ResourcesPage() {
  const context = useWriteContext();
  const invalidate = useWorkspaceInvalidate();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const resources = useResourcesQuery({ q, kind, archived: 'exclude', limit: '200' });
  const [title, setTitle] = useState('');
  const [newKind, setNewKind] = useState<ResourceDto['kind']>('web_link');
  const [target, setTarget] = useState('');
  const [versionLabel, setVersionLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      if (!context.csrfToken || !context.workspaceEpoch) throw new Error('登入狀態尚未就緒');
      return apiRequest<ApiEnvelope<ResourceDto>>('/resources', {
        method: 'POST',
        csrfToken: context.csrfToken,
        workspaceEpoch: context.workspaceEpoch,
        body: { title, kind: newKind, target, versionLabel, notes }
      });
    },
    onSuccess: async () => {
      setTitle('');
      setTarget('');
      setVersionLabel('');
      setNotes('');
      setMessage('已新增文件連結');
      await invalidate();
    }
  });

  const error = create.error instanceof ApiError ? create.error.message : create.error?.message;
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!title.trim() || !target.trim()) {
      setMessage('請輸入標題及連結／路徑');
      return;
    }
    create.mutate();
  };

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <p className={ui.eyebrow}>文件 · 連結 · 版本</p>
        <h1 className={ui.title}>文件連結</h1>
        <p className={ui.lede}>
          網頁連結只接受 http/https；本機路徑僅保存及複製文字，不會由伺服器讀檔。備份不包含連結指向的實體文件。
        </p>
      </header>

      <section className={ui.card}>
        <div className={ui.cardHeader}>
          <h2 className={ui.sectionTitle}>新增文件連結</h2>
        </div>
        <form className={ui.form} onSubmit={submit}>
          <div className={ui.filterRow}>
            <div className={ui.field} style={{ flex: '2 1 260px' }}>
              <label className={ui.label} htmlFor="resource-title">標題</label>
              <input id="resource-title" className={ui.input} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="resource-kind">類型</label>
              <select id="resource-kind" className={ui.select} value={newKind} onChange={(e) => setNewKind(e.target.value as ResourceDto['kind'])}>
                <option value="web_link">網頁連結</option>
                <option value="local_path">本機文字路徑</option>
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="resource-version">版本標籤</label>
              <input id="resource-version" className={ui.input} value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} />
            </div>
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="resource-target">{newKind === 'web_link' ? '網址' : '路徑文字'}</label>
            <input id="resource-target" className={ui.input} value={target} placeholder={newKind === 'web_link' ? 'https://…' : 'C:\\Example\\CV.pdf'} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="resource-notes">備註</label>
            <textarea id="resource-notes" className={ui.textarea} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className={ui.actions}>
            <button className={ui.button} type="submit" disabled={create.isPending}>{create.isPending ? '儲存中…' : '新增'}</button>
            {message ? <span className={ui.muted}>{message}</span> : null}
          </div>
          {error ? <p className={ui.error}>{error}</p> : null}
        </form>
      </section>

      <section className={ui.card}>
        <div className={ui.filterRow} style={{ marginBottom: 12 }}>
          <div className={ui.field} style={{ flex: '2 1 220px' }}>
            <label className={ui.label} htmlFor="resource-search">搜尋</label>
            <input id="resource-search" className={ui.input} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="resource-filter-kind">類型</label>
            <select id="resource-filter-kind" className={ui.select} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">全部</option>
              <option value="web_link">網頁連結</option>
              <option value="local_path">本機文字路徑</option>
            </select>
          </div>
        </div>
        {resources.isPending ? <PageStatus compact kind="loading" title="正在讀取文件連結…" /> : null}
        {resources.isError ? <PageStatus compact kind="error" title="無法讀取文件連結" onRetry={() => void resources.refetch()} /> : null}
        {resources.data && resources.data.data.length === 0 ? <p className={ui.empty}>沒有符合條件的文件連結。</p> : null}
        {resources.data && resources.data.data.length > 0 ? (
          <ul className={ui.list}>
            {resources.data.data.map((resource) => (
              <li key={resource.id} className={ui.row}>
                <Link className={`${ui.rowTitle} ${ui.rowLink}`} to={`/resources/${resource.id}`}>{resource.title}</Link>
                <span className={ui.meta}>
                  <span className={ui.badge}>{resource.kind === 'web_link' ? '網頁' : '本機路徑'}</span>
                  <span style={{ overflowWrap: 'anywhere' }}>{resource.target}</span>
                  {resource.versionLabel ? <span>{resource.versionLabel}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}