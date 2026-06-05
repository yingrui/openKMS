import { useCallback, useState, type CSSProperties } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X, LogIn, Home } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '../../contexts/AuthContext';
import '../../App.scss';

const SIDEBAR_COLLAPSED_KEY = 'openkms_nav_sidebar_collapsed';

function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function MainLayout() {
  const { t } = useTranslation('layout');
  const location = useLocation();
  const navigate = useNavigate();
  const {
    isAuthenticated,
    isLoading,
    authError,
    clearAuthError,
    retryAuth,
    login,
    canAccessPath,
    permissionPatternsReady,
  } = useAuth();
  const isHome = location.pathname === '/';
  const showAuthRequired = !isLoading && !isAuthenticated && !isHome;
  const showPathDenied =
    !isLoading && isAuthenticated && permissionPatternsReady && !canAccessPath(location.pathname);

  const isAgentsWorkspace = /^\/agents\/[^/]+$/.test(location.pathname);
  const isDetailPage =
    location.pathname.startsWith('/documents/view') ||
    location.pathname.startsWith('/articles/view') ||
    location.pathname.startsWith('/knowledge-bases/') ||
    location.pathname.startsWith('/wikis/') ||
    isAgentsWorkspace;
  const isSearchPage = location.pathname === '/search';
  const isObjectExplorerPage = location.pathname === '/object-explorer';

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarCollapsed());

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        if (next) {
          window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, '1');
        } else {
          window.localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
        }
      } catch {
        /* ignore quota / private mode */
      }
      return next;
    });
  }, []);

  return (
    <div
      className={`app-layout${sidebarCollapsed ? ' app-layout--sidebar-collapsed' : ''}`}
      style={
        sidebarCollapsed
          ? ({ ['--sidebar-width' as string]: '56px' } as CSSProperties)
          : undefined
      }
    >
      <Sidebar collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebarCollapsed} />
      <main className="app-main">
        <Header />
        {showAuthRequired && (
          <div className="auth-required-message" role="alert">
            <h2 className="auth-required-title">{t('authRequiredTitle')}</h2>
            <p className="auth-required-text">{t('authRequiredBody')}</p>
            <button type="button" onClick={login} className="auth-required-btn">
              <LogIn size={20} />
              <span>{t('logIn')}</span>
            </button>
          </div>
        )}
        {authError && (
          <div className="auth-error-banner" role="alert">
            <span>{authError}</span>
            <div className="auth-error-banner-actions">
              <button type="button" onClick={retryAuth} className="auth-error-banner-retry">
                {t('authErrorRetry')}
              </button>
              <button
                type="button"
                onClick={clearAuthError}
                className="auth-error-banner-dismiss"
                aria-label={t('dismiss')}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
        {!showAuthRequired && showPathDenied && (
          <div className="auth-required-message" role="alert">
            <h2 className="auth-required-title">{t('accessDeniedTitle')}</h2>
            <p className="auth-required-text">{t('accessDeniedBody')}</p>
            <button type="button" onClick={() => navigate('/', { replace: true })} className="auth-required-btn">
              <Home size={20} />
              <span>{t('home')}</span>
            </button>
          </div>
        )}
        {!showAuthRequired && !showPathDenied && (
          <div
            className={`app-content ${isDetailPage ? 'app-content--compact' : ''}${isHome ? ' app-content--home' : ''}${isSearchPage ? ' app-content--search' : ''}${isObjectExplorerPage ? ' app-content--object-explorer' : ''}`}
          >
            <Outlet />
          </div>
        )}
      </main>
    </div>
  );
}
