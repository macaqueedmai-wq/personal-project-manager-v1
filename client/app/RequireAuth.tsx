import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { PageStatus } from '../components/PageStatus';
import { useSessionQuery } from '../features/session/useSession';

export function RequireAuth() {
  const session = useSessionQuery();
  const location = useLocation();

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

  if (!session.data.data.authenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
