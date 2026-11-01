import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { PageStatus } from '../../components/PageStatus';
import { useLoginMutation, useSessionQuery } from './useSession';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const session = useSessionQuery();
  const login = useLoginMutation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  if (session.isPending) {
    return <PageStatus kind="loading" title="正在確認登入狀態…" />;
  }

  if (session.isError) {
    return (
      <PageStatus
        kind="error"
        title="無法連接伺服器"
        description="請確認 API 與 PostgreSQL 已啟動，然後再試一次。"
        onRetry={() => void session.refetch()}
      />
    );
  }

  if (session.data.data.authenticated) {
    return <Navigate to="/" replace />;
  }

  const sessionExpired =
    searchParams.get('expired') === '1' || session.data.data.reason === 'expired';

  const serverError = login.error;
  let errorMessage: string | null = localError;
  if (serverError instanceof ApiError) {
    errorMessage =
      serverError.status === 429
        ? '嘗試次數過多，請稍後再試。'
        : serverError.message;
  } else if (serverError) {
    errorMessage = '登入失敗，請稍後再試。';
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    if (password.length === 0) {
      setLocalError('請輸入密碼。');
      return;
    }

    setLocalError(null);
    login.mutate(password, {
      onSuccess: () => navigate('/', { replace: true })
    });
  };

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brandRow}>
          <span className={styles.mark} aria-hidden="true">
            工
          </span>
          <p className={styles.brandName}>個人工作台</p>
        </div>

        <div className={styles.intro}>
          <p className={styles.eyebrow}>單人使用 · 香港時間</p>
          <h1 className={styles.title}>回到你的工作台</h1>
          <p className={styles.lede}>
            學業、申請、求職、健康、社交與外展，集中在同一個地方。這個帳戶只有你一人使用。
          </p>
        </div>

        {sessionExpired ? (
          <p className={styles.notice} role="status">
            登入已到期，請重新輸入密碼。
          </p>
        ) : null}

        {searchParams.get('restored') === '1' ? (
          <p className={styles.notice} role="status">
            還原已完成，所有舊登入已失效，請重新登入。
          </p>
        ) : null}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="login-password" className={styles.label}>
              擁有者密碼
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              className={styles.input}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={errorMessage ? true : undefined}
              aria-describedby={errorMessage ? 'login-error' : undefined}
              autoFocus
            />
          </div>

          {errorMessage ? (
            <p id="login-error" className={styles.error} role="alert">
              {errorMessage}
            </p>
          ) : null}

          <button type="submit" className={styles.submit} disabled={login.isPending}>
            {login.isPending ? '登入中…' : '登入'}
          </button>
        </form>

        <p className={styles.footnote}>
          沒有註冊、忘記密碼或第三方登入。密碼雜湊由本機設定檔管理。
        </p>
      </div>
    </main>
  );
}
