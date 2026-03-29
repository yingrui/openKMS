import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { config } from '../config';
import { useAuth } from '../contexts/AuthContext';
import './AuthLocal.css';

export function Login() {
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
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ login, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.detail === 'string' ? data.detail : 'Login failed');
        return;
      }
      await completeLocalSession(data.access_token as string);
      navigate('/', { replace: true });
    } catch {
      setError('Network error');
    } finally {
      setPending(false);
    }
  }

  if (!authModeReady) {
    return (
      <div className="auth-local-page">
        <div className="auth-local-card">
          <p className="auth-local-sub">Detecting sign-in method…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-local-page">
      <div className="auth-local-card">
        <Link to="/" className="auth-local-back">
          ← Back to home
        </Link>
        <h1>Sign in</h1>
        <p className="auth-local-sub">Use your openKMS account (local auth mode).</p>
        {notice === 'local_auth' && (
          <p className="auth-local-sub" style={{ color: 'var(--color-accent, #3b82f6)' }}>
            OIDC login is disabled. Sign in here instead.
          </p>
        )}
        {notice === 'signup_disabled' && (
          <p className="auth-local-sub" style={{ color: 'var(--color-accent, #3b82f6)' }}>
            New account registration is disabled on this server.
          </p>
        )}
        {error && <p className="auth-local-error">{error}</p>}
        <form onSubmit={onSubmit}>
          <div className="auth-local-field">
            <label htmlFor="login-username">Username or email</label>
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
            <label htmlFor="login-password">Password</label>
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
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {allowSignup && (
          <p className="auth-local-footer">
            No account? <Link to="/signup">Create one</Link>
          </p>
        )}
      </div>
    </div>
  );
}
