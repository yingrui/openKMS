import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Database,
  FileStack,
  FolderTree,
  Loader2,
  MessageCircleQuestion,
  Upload,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { HomeStaticLanding } from '../components/HomeStaticLanding';
import { AppCatalogGrid } from '../components/Layout/AppCatalogGrid';
import { fetchHomeHub, siteHasContent, type HomeHubResponse } from '../data/homeHubApi';
import { useVisibleLauncherModules } from '../hooks/useAppModules';
import './Home.scss';
import '../components/Layout/AppCatalogGrid.scss';

type QuickStartCard = {
  id: string;
  icon: typeof Upload;
  titleKey: string;
  descKey: string;
  visible: boolean;
  onClick: () => void;
};

export function Home() {
  const { t } = useTranslation('home');
  const { isAuthenticated, login, hasPermission } = useAuth();
  const navigate = useNavigate();
  const launcherModules = useVisibleLauncherModules();
  const [hub, setHub] = useState<HomeHubResponse | null>(null);
  const [hubError, setHubError] = useState<string | null>(null);
  const [hubLoading, setHubLoading] = useState(false);

  const loadHub = useCallback(async () => {
    setHubLoading(true);
    setHubError(null);
    try {
      const data = await fetchHomeHub();
      setHub(data);
    } catch (e) {
      setHub(null);
      setHubError(e instanceof Error ? e.message : t('hubLoadError'));
    } finally {
      setHubLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isAuthenticated) void loadHub();
    else {
      setHub(null);
      setHubError(null);
    }
  }, [isAuthenticated, loadHub]);

  if (!isAuthenticated) {
    return <HomeStaticLanding onSignIn={login} />;
  }

  const canDocuments = hasPermission('documents:read') || hasPermission('all');
  const canKb = hasPermission('knowledge_bases:read') || hasPermission('all');
  const canKm = hasPermission('knowledge_map:read') || hasPermission('all');
  const showWelcome = !hubLoading && !siteHasContent(hub?.site_summary);
  const hasApps = launcherModules.length > 0;

  const cards: QuickStartCard[] = [
    {
      id: 'upload',
      icon: Upload,
      titleKey: 'quickStartUploadTitle',
      descKey: 'quickStartUploadDesc',
      visible: canDocuments,
      onClick: () => void navigate('/documents'),
    },
    {
      id: 'create-kb',
      icon: Database,
      titleKey: 'quickStartCreateKbTitle',
      descKey: 'quickStartCreateKbDesc',
      visible: canKb,
      onClick: () => void navigate('/knowledge-bases'),
    },
    {
      id: 'ask',
      icon: MessageCircleQuestion,
      titleKey: 'quickStartAskTitle',
      descKey: 'quickStartAskDesc',
      visible: canKb,
      onClick: () => void navigate('/knowledge-bases'),
    },
    {
      id: 'km',
      icon: FolderTree,
      titleKey: 'quickStartKmTitle',
      descKey: 'quickStartKmDesc',
      visible: canKm,
      onClick: () => void navigate('/knowledge-map'),
    },
  ].filter((c) => c.visible);

  return (
    <div className="home home--operations app-page-shell">
      {hubLoading && (
        <p className="home-muted home-ops-loading">
          <Loader2 className="home-ops-spinner" size={18} aria-hidden />
          {t('loading')}
        </p>
      )}
      {hubError && (
        <p className="home-error" role="alert">
          {hubError}
        </p>
      )}

      {showWelcome && (
        <section className="home-welcome" aria-label={t('welcomeTitle')}>
          <div className="home-welcome-icon" aria-hidden>
            <FileStack size={24} strokeWidth={1.5} />
          </div>
          <h1 className="home-welcome-title">{t('welcomeTitle')}</h1>
          <p className="home-muted home-welcome-body">{t('welcomeBody')}</p>
        </section>
      )}

      {cards.length > 0 && (
        <section className="home-quick-start app-page-section" aria-label={t('quickStartHeading')}>
          {showWelcome ? (
            <h2 className="home-section-heading">{t('quickStartHeading')}</h2>
          ) : (
            <h1 className="home-section-heading">{t('quickStartHeading')}</h1>
          )}
          <div className="home-quick-start-grid">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.id}
                  type="button"
                  className="home-quick-start-card"
                  onClick={card.onClick}
                >
                  <span className="home-quick-start-card-icon" aria-hidden>
                    <Icon size={20} strokeWidth={1.75} />
                  </span>
                  <span className="home-quick-start-card-title">{t(card.titleKey)}</span>
                  <span className="home-quick-start-card-desc">{t(card.descKey)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {hasApps && (
        <section className="home-apps app-page-section" aria-label={t('appsHeading')}>
          <header className="home-apps-header">
            {showWelcome || cards.length > 0 ? (
              <h2 className="home-section-heading">{t('appsHeading')}</h2>
            ) : (
              <h1 className="home-section-heading">{t('appsHeading')}</h1>
            )}
            <p className="page-subtitle home-apps-intro">{t('appsIntro')}</p>
          </header>
          <AppCatalogGrid
            variant="home"
            modules={launcherModules}
            onSelect={(mod) => void navigate(mod.homePath)}
          />
        </section>
      )}
    </div>
  );
}
