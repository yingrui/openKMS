import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { config } from '../config';
import { useAuth } from '../contexts/AuthContext';
import './AuthLocal.css';

export function Signup() {
  const navigate = useNavigate();
  const { authMode, authModeReady, allowSignup, completeLocalSession } = useAuth();
  useEffect(() => {
    if (!authModeReady) return;
    if (authMode !== 'local') {
      navigate('/', { replace: true });
      return;
    }
    if (!allowSignup) {
      navigate('/login?notice=signup_disabled', { replace: true });
    }
  }, [authMode, authModeReady, allowSignup, navigate]);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`${config.apiUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = data.detail;
        setError(typeof d === 'string' ? d : Array.isArray(d) ? d.map((x: { msg?: string }) => x.msg).join(' ') : 'Sign up failed');
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
        <h1>Create account</h1>
        <p className="auth-local-sub">Register for openKMS (local auth mode).</p>
        {error && <p className="auth-local-error">{error}</p>}
        <form onSubmit={onSubmit}>
          <div className="auth-local-field">
            <label htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              required
            />
          </div>
          <div className="auth-local-field">
            <label htmlFor="signup-username">Username</label>
            <input
              id="signup-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(ev) => setUsername(ev.target.value)}
              required
              minLength={2}
            />
          </div>
          <div className="auth-local-field">
            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              required
              minLength={8}
            />
          </div>
          <button type="submit" className="auth-local-submit" disabled={pending}>
            {pending ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <p className="auth-local-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
