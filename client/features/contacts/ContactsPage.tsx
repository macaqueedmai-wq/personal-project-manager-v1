import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { ApiEnvelope, ContactDto } from '@shared/api-types';
import { ApiError, apiRequest } from '../../api/client';
import { PageStatus } from '../../components/PageStatus';
import { useContactsQuery, useWorkspaceInvalidate, useWriteContext } from '../workspace/hooks';
import ui from '../../components/ui.module.css';

export function ContactsPage() {
  const context = useWriteContext();
  const invalidate = useWorkspaceInvalidate();
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState('exclude');
  const contacts = useContactsQuery({ q, archived, limit: '200' });
  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [nextContactOn, setNextContactOn] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      if (!context.csrfToken || !context.workspaceEpoch) throw new Error('登入狀態尚未就緒');
      return apiRequest<ApiEnvelope<ContactDto>>('/contacts', {
        method: 'POST',
        csrfToken: context.csrfToken,
        workspaceEpoch: context.workspaceEpoch,
        body: { name, organization, role, email, nextContactOn: nextContactOn || null }
      });
    },
    onSuccess: async (response) => {
      setName('');
      setOrganization('');
      setRole('');
      setEmail('');
      setNextContactOn('');
      setMessage(`已新增「${response.data.name}」`);
      await invalidate();
    }
  });

  const error = create.error instanceof ApiError ? create.error.message : create.error?.message;
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!name.trim()) {
      setMessage('請輸入姓名');
      return;
    }
    create.mutate();
  };

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <p className={ui.eyebrow}>人物 · 互動 · 聯絡提醒</p>
        <h1 className={ui.title}>人物</h1>
        <p className={ui.lede}>記錄聯絡方式、互動時間線與下一次聯絡日期；提醒不會自動發信。</p>
      </header>

      <section className={ui.card}>
        <div className={ui.cardHeader}>
          <h2 className={ui.sectionTitle}>新增人物</h2>
          <span className={ui.muted}>只填姓名也可以</span>
        </div>
        <form className={ui.form} onSubmit={submit}>
          <div className={ui.filterRow}>
            <div className={ui.field} style={{ flex: '2 1 220px' }}>
              <label className={ui.label} htmlFor="contact-name">姓名</label>
              <input id="contact-name" className={ui.input} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="contact-org">機構</label>
              <input id="contact-org" className={ui.input} value={organization} onChange={(e) => setOrganization(e.target.value)} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="contact-role">職位／關係</label>
              <input id="contact-role" className={ui.input} value={role} onChange={(e) => setRole(e.target.value)} />
            </div>
          </div>
          <div className={ui.filterRow}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="contact-email">電郵</label>
              <input id="contact-email" className={ui.input} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="contact-next">下次聯絡</label>
              <input id="contact-next" type="date" className={ui.input} value={nextContactOn} onChange={(e) => setNextContactOn(e.target.value)} />
            </div>
          </div>
          <div className={ui.actions}>
            <button className={ui.button} type="submit" disabled={create.isPending}>{create.isPending ? '儲存中…' : '新增人物'}</button>
            {message ? <span className={ui.muted}>{message}</span> : null}
          </div>
          {error ? <p className={ui.error}>{error}</p> : null}
        </form>
      </section>

      <section className={ui.card}>
        <div className={ui.filterRow} style={{ marginBottom: 12 }}>
          <div className={ui.field} style={{ flex: '2 1 220px' }}>
            <label className={ui.label} htmlFor="contact-search">搜尋</label>
            <input id="contact-search" className={ui.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="姓名、機構、職位" />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="contact-archived">封存</label>
            <select id="contact-archived" className={ui.select} value={archived} onChange={(e) => setArchived(e.target.value)}>
              <option value="exclude">不顯示封存</option>
              <option value="only">只顯示封存</option>
              <option value="all">全部</option>
            </select>
          </div>
        </div>
        {contacts.isPending ? <PageStatus compact kind="loading" title="正在讀取人物…" /> : null}
        {contacts.isError ? <PageStatus compact kind="error" title="無法讀取人物" onRetry={() => void contacts.refetch()} /> : null}
        {contacts.data && contacts.data.data.length === 0 ? <p className={ui.empty}>沒有符合條件的人物。</p> : null}
        {contacts.data && contacts.data.data.length > 0 ? (
          <ul className={ui.list}>
            {contacts.data.data.map((contact) => (
              <li key={contact.id} className={ui.row}>
                <Link className={`${ui.rowTitle} ${ui.rowLink}`} to={`/contacts/${contact.id}`}>{contact.name}</Link>
                <span className={ui.meta}>
                  {contact.organization ? <span>{contact.organization}</span> : null}
                  {contact.role ? <span>{contact.role}</span> : null}
                  {contact.nextContactOn ? <span className={ui.badge}>下次聯絡 {contact.nextContactOn}</span> : null}
                  {contact.archivedAt ? <span className={ui.badgeMuted}>已封存</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}