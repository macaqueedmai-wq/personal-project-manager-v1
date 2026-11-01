import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { SearchResultDto } from '@shared/api-types';
import { AREA_NAME_BY_ID } from '@shared/areas';
import { PageStatus } from '../../components/PageStatus';
import { useSearchQuery } from '../workspace/hooks';
import ui from '../../components/ui.module.css';

const TYPE_LABELS: Record<SearchResultDto['type'], string> = {
  task: '任務',
  project: '項目',
  application: '申請',
  event: '活動',
  contact: '人物',
  resource: '文件'
};

function resultLink(result: SearchResultDto): string {
  switch (result.type) {
    case 'task':
      return `/tasks/${result.id}`;
    case 'event':
      return `/events/${result.id}`;
    case 'contact':
      return `/contacts/${result.id}`;
    case 'resource':
      return `/resources/${result.id}`;
    default:
      return `/projects/${result.id}`;
  }
}

export function SearchPage() {
  const [q, setQ] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const results = useSearchQuery(q, includeArchived ? 'include' : 'exclude');
  const searched = q.trim().length > 0;

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <p className={ui.eyebrow}>全域搜尋</p>
        <h1 className={ui.title}>搜尋</h1>
        <p className={ui.lede}>搜尋任務、項目、申請、活動、人物及文件連結；預設排除封存資料。</p>
      </header>

      <section className={ui.card}>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="global-search">關鍵字</label>
          <input
            id="global-search"
            className={ui.input}
            value={q}
            autoFocus
            placeholder="名稱、機構、職位、備註…"
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        <div className={ui.checkboxRow} style={{ marginTop: 10 }}>
          <label>
            <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
            包含封存資料
          </label>
          {results.data?.meta?.total !== undefined ? <span className={ui.muted}>共 {results.data.meta.total} 項</span> : null}
        </div>
      </section>

      <section className={ui.card}>
        {!searched ? <p className={ui.empty}>輸入關鍵字開始搜尋。</p> : null}
        {searched && results.isPending ? <PageStatus compact kind="loading" title="正在搜尋…" /> : null}
        {searched && results.isError ? <PageStatus compact kind="error" title="搜尋失敗" onRetry={() => void results.refetch()} /> : null}
        {searched && results.data && results.data.data.length === 0 ? <p className={ui.empty}>找不到符合的資料。</p> : null}
        {searched && results.data && results.data.data.length > 0 ? (
          <ul className={ui.list}>
            {results.data.data.map((result) => (
              <li key={`${result.type}-${result.id}`} className={ui.row}>
                <Link className={`${ui.rowTitle} ${ui.rowLink}`} to={resultLink(result)}>{result.title}</Link>
                <span className={ui.meta}>
                  <span className={ui.badge}>{TYPE_LABELS[result.type]}</span>
                  <span>{result.subtitle}</span>
                  {result.areaId ? <span>{AREA_NAME_BY_ID[result.areaId]}</span> : null}
                  {result.archived ? <span className={ui.badgeMuted}>已封存</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}