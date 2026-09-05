import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listApps, type AppBuilderAppResponse } from '../../data/appBuilderApi';
import './AppsPages.scss';

export function AppsGalleryPage() {
  const { t } = useTranslation('apps');
  const [apps, setApps] = useState<AppBuilderAppResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        setApps(await listApps({ status: 'published' }));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="apps-page">
      <header className="page-header">
        <h1>{t('galleryTitle')}</h1>
        <p className="page-subtitle">{t('gallerySubtitle')}</p>
      </header>
      {loading ? <p>{t('loading')}</p> : null}
      {error ? <p className="apps-page__error">{error}</p> : null}
      {!loading && !apps.length ? (
        <div className="apps-page__empty">
          <p>{t('emptyGallery')}</p>
          <Link to="/app-builder" className="btn btn-primary">
            {t('goToBuilder')}
          </Link>
        </div>
      ) : null}
      <ul className="apps-page__list">
        {apps.map((app) => (
          <li key={app.id}>
            <Link to={`/apps/${app.id}`} className="apps-page__card">
              <strong>{app.name}</strong>
              {app.published_version ? (
                <span className="apps-page__badge">v{app.published_version}</span>
              ) : null}
              <span className="apps-page__meta">{app.api_name}</span>
              {app.bindings_stale ? <span className="apps-page__badge">{t('stale')}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
