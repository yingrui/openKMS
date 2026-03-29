import { useCallback, useEffect, useState } from 'react';
import { UserCircle } from 'lucide-react';
import { fetchAuthMe, type AuthMeResponse } from '../data/authApi';
import { useAuth } from '../contexts/AuthContext';
import './Profile.css';

export function Profile() {
  const { authMode, authModeReady } = useAuth();
  const [me, setMe] = useState<AuthMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuthMe();
      setMe(data);
    } catch (e) {
      setMe(null);
      setError(e instanceof Error ? e.message : 'Could not load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signInLabel =
    authModeReady && authMode === 'local' ? 'Local account (username and password)' : 'Organization sign-in (OpenID Connect)';

  return (
    <div className="profile-page">
      <div className="page-header">
        <h1 className="profile-page-title">
          <UserCircle size={28} strokeWidth={1.75} aria-hidden />
          Profile
        </h1>
        <p className="page-subtitle">Your account details as recognized by openKMS.</p>
      </div>

      {loading && (
        <div className="profile-card">
          <p className="page-subtitle" style={{ margin: 0 }}>
            Loading…
          </p>
        </div>
      )}

      {!loading && error && (
        <div className="profile-card">
          <p className="profile-error">{error}</p>
          <button type="button" className="profile-retry" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}

      {!loading && me && (
        <div className="profile-card">
          <dl className="profile-dl">
            <div>
              <dt>Display name</dt>
              <dd>{me.username}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{me.email || '—'}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>
                <span className={`profile-role ${me.is_admin ? 'profile-role--admin' : ''}`}>
                  {me.is_admin ? 'Administrator' : 'User'}
                </span>
              </dd>
            </div>
            <div>
              <dt>Account ID</dt>
              <dd>
                <code style={{ fontSize: '0.9em' }}>{me.id}</code>
              </dd>
            </div>
            {authModeReady && (
              <div>
                <dt>Sign-in method</dt>
                <dd>{signInLabel}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
