import styles from './PageStatus.module.css';

export interface PageStatusProps {
  kind: 'loading' | 'error';
  title: string;
  description?: string;
  onRetry?: () => void;
  compact?: boolean;
}

export function PageStatus({ kind, title, description, onRetry, compact = false }: PageStatusProps) {
  return (
    <div
      className={compact ? styles.compact : styles.page}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {kind === 'loading' ? (
        <span className={styles.spinner} aria-hidden="true" />
      ) : (
        <span className={styles.errorMark} aria-hidden="true">
          !
        </span>
      )}
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {description ? <p className={styles.description}>{description}</p> : null}
        {onRetry ? (
          <button type="button" className={styles.retry} onClick={onRetry}>
            再試一次
          </button>
        ) : null}
      </div>
    </div>
  );
}
