import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { AREA_DEFINITIONS, AREA_NAME_BY_ID } from '@shared/areas';
import { useLogoutMutation } from '../features/session/useSession';
import styles from './AppShell.module.css';

export function AppShell() {
  const logout = useLogoutMutation();
  const navigate = useNavigate();

  const handleLogout = (): void => {
    logout.mutate(undefined, {
      onSettled: () => navigate('/login', { replace: true })
    });
  };

  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#main-content">
        跳至主要內容
      </a>

      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            工
          </span>
          <div className={styles.brandText}>
            <p className={styles.brandName}>個人工作台</p>
            <p className={styles.brandMeta}>七個領域，一個入口</p>
          </div>
        </div>

        <nav className={styles.nav} aria-label="主要導覽">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          >
            總覽
          </NavLink>
          <NavLink
            to="/inbox"
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          >
            收件箱
          </NavLink>
          <NavLink
            to="/tasks"
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          >
            所有任務
          </NavLink>
          <NavLink
            to="/calendar"
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          >
            日曆
          </NavLink>
          <NavLink
            to="/events"
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          >
            活動
          </NavLink>
          <NavLink
            to="/contacts"
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          >
            人物
          </NavLink>
          <NavLink
            to="/resources"
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          >
            文件連結
          </NavLink>
          <NavLink
            to="/habits"
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          >
            習慣
          </NavLink>
          <NavLink
            to="/health"
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          >
            健康
          </NavLink>
          <NavLink
            to="/search"
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          >
            搜尋
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          >
            設定與備份
          </NavLink>
          <p className={styles.navLabel}>七個領域</p>
          {AREA_DEFINITIONS.map((area) => (
            <NavLink
              key={area.id}
              to={`/areas/${area.id}`}
              className={({ isActive }) =>
                `${styles.navLink} ${styles.areaLink} ${isActive ? styles.active : ''}`
              }
            >
              {AREA_NAME_BY_ID[area.id]}
            </NavLink>
          ))}
        </nav>

        <div className={styles.footer}>
          <p className={styles.footerNote}>
            資料存於 PostgreSQL
            <br />
            香港時間 · 第一版
          </p>
          <button
            type="button"
            className={styles.logout}
            onClick={handleLogout}
            disabled={logout.isPending}
          >
            {logout.isPending ? '登出中…' : '登出'}
          </button>
        </div>
      </aside>

      <main id="main-content" className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
