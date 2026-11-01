import { PageStatus } from '../../components/PageStatus';
import { useAreasQuery } from '../tasks/useTasks';
import styles from './AreaReference.module.css';

export function AreaReference() {
  const areas = useAreasQuery();

  return (
    <section className={styles.card} aria-labelledby="areas-heading">
      <div className={styles.header}>
        <h2 id="areas-heading" className={styles.heading}>
          七個領域
        </h2>
        <p className={styles.hint}>固定分類，由資料庫種子提供</p>
      </div>

      {areas.isPending ? (
        <PageStatus compact kind="loading" title="正在載入領域…" />
      ) : null}

      {areas.isError ? (
        <PageStatus
          compact
          kind="error"
          title="無法載入領域"
          description="領域資料來自 PostgreSQL，請確認服務狀態。"
          onRetry={() => void areas.refetch()}
        />
      ) : null}

      {areas.data ? (
        <ol className={styles.list}>
          {areas.data.data.map((area) => (
            <li key={area.id} className={styles.item}>
              <span className={styles.order} aria-hidden="true">
                {String(area.sortOrder).padStart(2, '0')}
              </span>
              <span className={styles.name}>{area.name}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
