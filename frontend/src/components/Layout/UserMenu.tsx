import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, LogIn, LogOut, Settings, User, UserCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { isConsoleShellPath } from '../../config/appModules';
import './UserMenu.scss';

interface Props {
  /**
   * `down` drops the menu below the button (header). `up` opens it above and to the
   * right, for the collapsed left rail where the button is pinned to the bottom.
   */
  placement?: 'down' | 'up';
}

/** Account entry point: login for guests, otherwise profile / settings / console / log out. */
export function UserMenu({ placement = 'down' }: Props) {
  const { t } = useTranslation('layout');
  const location = useLocation();
  const { isAuthenticated, isLoading, user, canAccessConsole, login, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (!isLoading && !isAuthenticated) {
    return (
      <button type="button" onClick={login} className="user-menu-login" aria-label={t('logIn')}>
        <LogIn size={20} strokeWidth={1.75} />
        <span className="user-menu-login-label ds-compact-label">{t('logIn')}</span>
      </button>
    );
  }

  return (
    <div className={`user-menu user-menu--${placement}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="user-menu-btn"
        aria-label={t('userMenu')}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <User size={20} strokeWidth={1.75} />
      </button>
      {open ? (
        <div className="user-menu-dropdown">
          <div className="user-menu-dropdown-header">
            <span className="user-menu-name">{user?.name ?? user?.username ?? t('fallbackUser')}</span>
            <span className="user-menu-email">{user?.email ?? ''}</span>
          </div>
          <div className="user-menu-divider" />
          <Link to="/profile" className="user-menu-item" onClick={() => setOpen(false)}>
            <UserCircle size={18} />
            <span>{t('profile')}</span>
          </Link>
          <Link to="/settings" className="user-menu-item" onClick={() => setOpen(false)}>
            <Settings size={18} />
            <span>{t('settings')}</span>
          </Link>
          {canAccessConsole && !isConsoleShellPath(location.pathname) ? (
            <Link to="/console" className="user-menu-item" onClick={() => setOpen(false)}>
              <LayoutDashboard size={18} aria-hidden />
              <span>{t('console')}</span>
            </Link>
          ) : null}
          <div className="user-menu-divider" />
          <button type="button" className="user-menu-item user-menu-item--danger" onClick={logout}>
            <LogOut size={18} />
            <span>{t('logOut')}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
