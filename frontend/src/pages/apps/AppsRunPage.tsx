import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchOntologyAppRun, type OntologyAppRunResponse } from '../../data/ontologyAppsApi';
import { OntologyAppA2uiSurface } from './OntologyAppA2uiSurface';
import { useAuth } from '../../contexts/AuthContext';
import './AppsPages.scss';

export function AppsRunPage() {
  const { appId = '' } = useParams();
  const { t } = useTranslation('apps');
  const { canAccessPath } = useAuth();
  const canEdit = canAccessPath('/app-builder');
  const [app, setApp] = useState<OntologyAppRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setApp(await fetchOntologyAppRun(appId));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [appId]);

  if (error) {
    return (
      <div className="apps-page">
        <p className="apps-page__error">{error}</p>
        <Link to="/apps">{t('backToGallery')}</Link>
      </div>
    );
  }
  if (!app) return <div className="apps-page">{t('loading')}</div>;

  return (
    <div className="apps-page apps-page--run">
      <header className="apps-page__run-header">
        <div>
          <Link to="/apps" className="apps-page__back">
            {t('backToGallery')}
          </Link>
          <h1>{app.name}</h1>
        </div>
        {canEdit ? (
          <Link to={`/app-builder/${app.id}/design`} className="btn btn-secondary">
            {t('editInBuilder')}
          </Link>
        ) : null}
      </header>
      {app.bindings_stale ? (
        <div className="apps-page__banner" role="status">
          {t('staleBanner')}
          {canEdit ? (
            <Link to={`/app-builder/${app.id}/design`}>{t('repair')}</Link>
          ) : null}
        </div>
      ) : null}
      <OntologyAppA2uiSurface a2uiMessages={app.a2ui_messages} />
    </div>
  );
}
