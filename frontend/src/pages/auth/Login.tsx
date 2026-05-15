import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { config } from '../../config';
import { getStoredLocale } from '../../i18n/config';
import { formatApiErrorMessage } from '../../utils/apiError';
import { useAuth } from '../../contexts/AuthContext';
import './AuthLocal.css';

export function Login() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const { authMode, authModeReady, allowSignup, completeLocalSession } = useAuth();
  useEffect(() => {
    if (!authModeReady) return;
    if (authMode !== 'local') {
      navigate('/', { replace: true });
    }
  }, [authMode, authModeReady, navigate]);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [params] = useSearchParams();
  const notice = params.get('notice');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`${config.apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Language': getStoredLocale(),
        },
        credentials: 'include',
        body: JSON.stringify({ login, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(formatApiErrorMessage(data));
        return;
      }
      await completeLocalSession(data.access_token as string);
      navigate('/', { replace: true });
    } catch {
      setError(t('networkError'));
    } finally {
      setPending(false);
    }
  }

  if (!authModeReady) {
    return (
      <div className="auth-local-page">
        <div className="auth-local-card">
          <p className="auth-local-sub">{t('detectingAuth')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-local-page">
      <div className="auth-local-card">
        <Link to="/" className="auth-local-back">
          {t('backHome')}
        </Link>
        <h1>{t('signInTitle')}</h1>
        <p className="auth-local-sub">{t('signInSub')}</p>
        {notice === 'local_auth' && (
          <p className="auth-local-sub" style={{ color: 'var(--color-accent, #3b82f6)' }}>
            {t('noticeOidcDisabled')}
          </p>
        )}
        {notice === 'signup_disabled' && (
          <p className="auth-local-sub" style={{ color: 'var(--color-accent, #3b82f6)' }}>
            {t('noticeSignupDisabled')}
          </p>
        )}
        {error && <p className="auth-local-error">{error}</p>}
        <form onSubmit={onSubmit}>
          <div className="auth-local-field">
            <label htmlFor="login-username">{t('usernameLabel')}</label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              value={login}
              onChange={(ev) => setLogin(ev.target.value)}
              required
            />
          </div>
          <div className="auth-local-field">
            <label htmlFor="login-password">{t('passwordLabel')}</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              required
            />
          </div>
          <button type="submit" className="auth-local-submit" disabled={pending}>
            {pending ? t('signingIn') : t('signInButton')}
          </button>
        </form>
        {allowSignup && (
          <p className="auth-local-footer">
            {t('noAccount')} <Link to="/signup">{t('createOne')}</Link>
          </p>
        )}
      </div>
    </div>
  );
}
