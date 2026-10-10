import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Settings, Trash2 } from 'lucide-react';
import { deleteApp, listApps, type AppBuilderAppResponse } from '../../data/appBuilderApi';
import { useAuth } from '../../contexts/AuthContext';
import { EmptyState } from '../../styles/design-system';
import './AppsPages.scss';

export function AppsGalleryPage() {
  const { t } = useTranslation('apps');
  const { canAccessPath } = useAuth();
  const canManage = canAccessPath('/apps');
  const [apps, setApps] = useState<AppBuilderAppResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setApps(await listApps(canManage ? undefined : { status: 'published' }));
  };

  useEffect(() => {
    void reload()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [canManage]);

  return (
    <div className="apps-page">
      <header className="page-header">
        <h1>{t('galleryTitle')}</h1>
        <p className="page-subtitle">{t('gallerySubtitle')}</p>
      </header>
      {loading ? <p>{t('loading')}</p> : null}
      {error ? <p className="apps-page__error" role="alert">{error}</p> : null}
      {!loading && !apps.length && !error ? (
        <EmptyState
          title={t('emptyGallery')}
          description={t('emptyGalleryHint')}
          action={
            <Link to="/console/kubernetes" className="btn btn-primary">
              {t('goToKubernetes')}
            </Link>
          }
        />
      ) : null}
      {!loading && apps.length > 0 ? (
        <div className="apps-page__grid">
          {apps.map((app) => {
            const openTo =
              app.status === 'published' ? `/apps/${app.id}` : `/apps/${app.id}/settings`;
            return (
              <div key={app.id} className="apps-page__card">
                <div className="apps-page__card-top">
                  <Link to={openTo} className="apps-page__card-icon" aria-hidden tabIndex={-1}>
                    <LayoutGrid size={26} strokeWidth={1.5} />
                  </Link>
                  {canManage ? (
                    <div className="apps-page__card-actions">
                      <Link
                        to={`/apps/${app.id}/settings`}
                        title={t('editSettings')}
                        aria-label={t('editSettings')}
                      >
                        <Settings size={15} />
                      </Link>
                      <button
                        type="button"
                        title={t('delete')}
                        aria-label={t('delete')}
                        onClick={() => {
                          if (!window.confirm(t('confirmDelete'))) return;
                          void deleteApp(app.id).then(reload);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ) : null}
                </div>
                <Link to={openTo} className="apps-page__card-body">
                  <h3>{app.name}</h3>
                  <div className="apps-page__card-badges">
                    <span className="apps-page__badge apps-page__badge--kind">{t('kindModule')}</span>
                    <span className="apps-page__badge">{app.status}</span>
                    {app.published_version ? (
                      <span className="apps-page__badge">v{app.published_version}</span>
                    ) : null}
                    {app.bindings_stale ? <span className="apps-page__badge">{t('stale')}</span> : null}
                  </div>
                  <span className="apps-page__card-meta">{app.api_name}</span>
                </Link>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
