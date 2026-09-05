import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { deleteApp, listApps, type AppBuilderAppResponse } from '../../data/appBuilderApi';
import { EmptyState } from '../../styles/design-system';
import './AppBuilderPages.scss';

export function AppBuilderListPage() {
  const { t } = useTranslation('appBuilder');
  const [apps, setApps] = useState<AppBuilderAppResponse[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setApps(await listApps());
  };

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="app-builder-page">
      <header className="page-header app-builder-page__header">
        <div>
          <h1>{t('title')}</h1>
          <p className="page-subtitle">{t('subtitle')}</p>
        </div>
        <Link to="/app-builder/new" className="btn btn-primary">
          {t('newApp')}
        </Link>
      </header>

      {error ? <p className="app-builder-page__error" role="alert">{error}</p> : null}

      {!apps.length && !error ? (
        <EmptyState
          title={t('emptyList')}
          action={
            <Link to="/app-builder/new" className="btn btn-primary">
              {t('newApp')}
            </Link>
          }
        />
      ) : null}

      <ul className="app-builder-page__list">
        {apps.map((app) => (
          <li key={app.id} className="app-builder-page__row">
            <div>
              <strong>{app.name}</strong>
              <div className="app-builder-page__meta">
                {app.status}
                {app.bindings_stale ? ` · ${t('stale')}` : ''}
              </div>
            </div>
            <div className="app-builder-page__actions">
              <Link to={`/app-builder/${app.id}/design`} className="btn btn-secondary">
                {t('design')}
              </Link>
              <Link to={`/app-builder/${app.id}/settings`} className="btn btn-secondary">
                {t('settings')}
              </Link>
              {app.status === 'published' ? (
                <Link to={`/apps/${app.id}`} className="btn btn-secondary">
                  {t('open')}
                </Link>
              ) : null}
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  if (!window.confirm(t('confirmDelete'))) return;
                  void deleteApp(app.id).then(reload);
                }}
              >
                {t('delete')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
