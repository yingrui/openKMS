import { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { UserCircle } from 'lucide-react';
import { fetchAuthMe, type AuthMeResponse } from '../data/authApi';
import { GitCredentialsSection } from '../components/agents/GitCredentialsSection';
import { useFeatureToggles } from '../contexts/FeatureTogglesContext';
import './Profile.scss';

export function Profile() {
  const { t } = useTranslation('profile');
  const { toggles } = useFeatureToggles();
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
      setError(e instanceof Error ? e.message : t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="profile-page">
      <div className="page-header">
        <h1 className="profile-page-title">
          <UserCircle size={28} strokeWidth={1.75} aria-hidden />
          {t('title')}
        </h1>
        <p className="page-subtitle">
          <Trans
            i18nKey="subtitle"
            ns="profile"
            components={{
              settingsLink: <Link to="/settings" className="profile-settings-link" />,
            }}
          />
        </p>
      </div>

      {loading && (
        <div className="profile-card">
          <p className="page-subtitle openkms-mt-0">{t('loading')}</p>
        </div>
      )}

      {!loading && error && (
        <div className="profile-card">
          <p className="profile-error">{error}</p>
          <button type="button" className="profile-retry" onClick={() => void load()}>
            {t('tryAgain')}
          </button>
        </div>
      )}

      {!loading && me && (
        <div className="profile-card">
          <dl className="profile-dl">
            <div>
              <dt>{t('displayName')}</dt>
              <dd>{me.username}</dd>
            </div>
            <div>
              <dt>{t('email')}</dt>
              <dd>{me.email || t('emptyValue')}</dd>
            </div>
            <div>
              <dt>{t('administrator')}</dt>
              <dd>
                <span className={`profile-role ${me.is_admin ? 'profile-role--admin' : ''}`}>
                  {me.is_admin ? t('yes') : t('no')}
                </span>
              </dd>
            </div>
            <div>
              <dt>{t('roles')}</dt>
              <dd>
                {(me.roles ?? []).length === 0 ? (
                  t('emptyValue')
                ) : (
                  <ul className="profile-role-list" aria-label={t('rolesAria')}>
                    {[...(me.roles ?? [])]
                      .sort((a, b) => a.localeCompare(b))
                      .map((r) => (
                        <li key={r}>
                          <span className={`profile-role ${r === 'admin' ? 'profile-role--admin' : ''}`}>{r}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </dd>
            </div>
            <div>
              <dt>{t('accountId')}</dt>
              <dd>
                <code className="openkms-inline-code">{me.id}</code>
              </dd>
            </div>
          </dl>
        </div>
      )}
      {!loading && me && toggles.agents ? <GitCredentialsSection /> : null}
    </div>
  );
}
