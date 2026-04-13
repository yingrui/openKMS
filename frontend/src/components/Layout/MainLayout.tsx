import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { X, LogIn, Home } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '../../contexts/AuthContext';
import '../../App.css';

export function MainLayout() {
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
  const isDetailPage =
    location.pathname.startsWith('/documents/view') ||
    location.pathname.startsWith('/articles/view') ||
    location.pathname.startsWith('/knowledge-bases/') ||
    location.pathname.startsWith('/wikis/');
  const showAuthRequired = !isLoading && !isAuthenticated && !isHome;
  const showPathDenied =
    !isLoading && isAuthenticated && permissionPatternsReady && !canAccessPath(location.pathname);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">
        <Header />
        {showAuthRequired && (
          <div className="auth-required-message" role="alert">
            <h2 className="auth-required-title">Authentication Required</h2>
            <p className="auth-required-text">
              You need to be logged in to access this page. Please sign in with your account to continue.
            </p>
            <button type="button" onClick={login} className="auth-required-btn">
              <LogIn size={20} />
              <span>Sign in</span>
            </button>
          </div>
        )}
        {authError && (
          <div className="auth-error-banner" role="alert">
            <span>{authError}</span>
            <div className="auth-error-banner-actions">
              <button
                type="button"
                onClick={retryAuth}
                className="auth-error-banner-retry"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={clearAuthError}
                className="auth-error-banner-dismiss"
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
        {!showAuthRequired && showPathDenied && (
          <div className="auth-required-message" role="alert">
            <h2 className="auth-required-title">Access denied</h2>
            <p className="auth-required-text">
              You do not have permission to open this page. Ask an administrator for the appropriate access, or go
              back to home.
            </p>
            <button type="button" onClick={() => navigate('/', { replace: true })} className="auth-required-btn">
              <Home size={20} />
              <span>Home</span>
            </button>
          </div>
        )}
        {!showAuthRequired && !showPathDenied && (
          <div className={`app-content ${isDetailPage ? 'app-content--compact' : ''}`}>
            <Outlet />
          </div>
        )}
      </main>
    </div>
  );
}
