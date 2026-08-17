import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  deleteOntologyApp,
  listOntologyApps,
  type OntologyAppResponse,
} from '../../data/ontologyAppsApi';
import './AppBuilderPages.scss';

export function AppBuilderListPage() {
  const { t } = useTranslation('appBuilder');
  const [apps, setApps] = useState<OntologyAppResponse[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setApps(await listOntologyApps());
  };

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="app-builder-page">
      <header className="page-header">
        <h1>{t('title')}</h1>
        <p className="page-subtitle">{t('subtitle')}</p>
      </header>

      <div className="app-builder-page__suggested">
        <h2>{t('suggestedBoard')}</h2>
        <p>{t('suggestedBoardHint')}</p>
        <Link to="/app-builder/new" className="btn btn-primary">
          {t('createBoard')}
        </Link>
      </div>

      {error ? <p className="app-builder-page__error">{error}</p> : null}

      <ul className="app-builder-page__list">
        {apps.map((app) => (
          <li key={app.id} className="app-builder-page__row">
            <div>
              <strong>{app.name}</strong>
              <div className="app-builder-page__meta">
                {app.api_name} · {app.status}
                {app.bindings_stale ? ` · ${t('stale')}` : ''}
              </div>
            </div>
            <div className="app-builder-page__actions">
              <Link to={`/app-builder/${app.id}/design`} className="btn btn-secondary">
                {t('design')}
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
                  void deleteOntologyApp(app.id).then(reload);
                }}
              >
                {t('delete')}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!apps.length ? <p className="app-builder-page__muted">{t('emptyList')}</p> : null}
    </div>
  );
}
