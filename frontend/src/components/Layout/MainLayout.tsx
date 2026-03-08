import { Outlet, useLocation } from 'react-router-dom';
import { X, LogIn } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '../../contexts/AuthContext';
import '../../App.css';

export function MainLayout() {
  const location = useLocation();
  const { isAuthenticated, isLoading, authError, clearAuthError, retryAuth, login } = useAuth();
  const isHome = location.pathname === '/';
  const isDetailPage = location.pathname.startsWith('/documents/view') || location.pathname.startsWith('/articles/view') || location.pathname.startsWith('/knowledge-bases/');
  const showAuthRequired = !isLoading && !isAuthenticated && !isHome;

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
        {!showAuthRequired && (
        <div className={`app-content ${isDetailPage ? 'app-content--compact' : ''}`}>
          <Outlet />
        </div>
        )}
      </main>
    </div>
  );
}
