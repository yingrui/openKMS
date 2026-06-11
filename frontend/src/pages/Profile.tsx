import { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Loader2, UserCircle } from 'lucide-react';
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
    <div className="account-page">
      <header className="account-page-header">
        <h1 className="account-page-title">
          <UserCircle size={26} strokeWidth={1.75} aria-hidden />
          {t('title')}
        </h1>
        <p className="account-page-subtitle">
          <Trans
            i18nKey="subtitle"
            ns="profile"
            components={{
              settingsLink: <Link to="/settings" className="account-inline-link" />,
            }}
          />
        </p>
      </header>

      <div className="account-stack">
        {loading && (
          <section className="account-card">
            <div className="account-loading" role="status">
              <Loader2 size={22} className="account-spin" aria-hidden />
              <span>{t('loading')}</span>
            </div>
          </section>
        )}

        {!loading && error && (
          <section className="account-card">
            <p className="account-error">{error}</p>
            <button type="button" className="account-btn account-btn--secondary" onClick={() => void load()}>
              {t('tryAgain')}
            </button>
          </section>
        )}

        {!loading && me && (
          <section className="account-card" aria-labelledby="profile-account-heading">
            <div className="account-card-head">
              <span className="account-card-icon" aria-hidden>
                <UserCircle size={18} strokeWidth={1.75} />
              </span>
              <div>
                <h2 id="profile-account-heading" className="account-card-title">
                  {t('accountSectionTitle')}
                </h2>
                <p className="account-card-desc">{t('accountSectionIntro')}</p>
              </div>
            </div>

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
                  <code className="account-list-item-code">{me.id}</code>
                </dd>
              </div>
            </dl>
          </section>
        )}

        {!loading && me && toggles.agents ? <GitCredentialsSection /> : null}
      </div>
    </div>
  );
}
