import { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUp, Bot, FileStack, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useFeatureToggles } from '../contexts/FeatureTogglesContext';
import { HomeStaticLanding } from '../components/HomeStaticLanding';
import { AppCatalogGrid } from '../components/Layout/AppCatalogGrid';
import { fetchHomeHub, siteHasContent, type HomeHubResponse } from '../data/homeHubApi';
import { createProjectConversation, projectWorkspacePath } from '../data/projectsApi';
import { useVisibleLauncherModules } from '../hooks/useAppModules';
import './Home.scss';
import '../components/Layout/AppCatalogGrid.scss';

export function Home() {
  const { t } = useTranslation('home');
  const { isAuthenticated, login, canAccessPath } = useAuth();
  const { toggles } = useFeatureToggles();
  const navigate = useNavigate();
  const launcherModules = useVisibleLauncherModules();
  const agentsEnabled = Boolean(toggles.agents) && canAccessPath('/agents');

  const [hub, setHub] = useState<HomeHubResponse | null>(null);
  const [hubError, setHubError] = useState<string | null>(null);
  const [hubLoading, setHubLoading] = useState(false);

  const [draft, setDraft] = useState('');
  const [starting, setStarting] = useState(false);

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

  const showWelcome = !hubLoading && !siteHasContent(hub?.site_summary);
  const hasApps = launcherModules.length > 0;
  const defaultProject = hub?.default_agent_project ?? null;
  // Wait for the hub so the setup card never flashes before a saved default arrives.
  const agentReady = !hubLoading && hub !== null;

  const onStartChat = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || !defaultProject || starting) return;
    setStarting(true);
    try {
      const conv = await createProjectConversation(defaultProject.id);
      navigate(projectWorkspacePath(defaultProject.id, conv.id), {
        state: { homeDraft: text },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('agentStartFailed'));
      setStarting(false);
    }
  };

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

      {agentsEnabled ? (
        <section
          className="home-agent app-page-section"
          aria-label={t('agentSectionAria')}
        >
          {showWelcome ? (
            <h2 className="home-agent-hero">{defaultProject ? t('agentHeroTitle') : t('quickStartHeading')}</h2>
          ) : (
            <h1 className="home-agent-hero">{defaultProject ? t('agentHeroTitle') : t('quickStartHeading')}</h1>
          )}

          {agentReady && !defaultProject ? (
            <div className="home-quick-start-grid home-quick-start-grid--single">
              <button
                type="button"
                className="home-quick-start-card"
                onClick={() => void navigate('/agents', { state: { chooseHomeDefault: true } })}
              >
                <span className="home-quick-start-card-icon" aria-hidden>
                  <Bot size={20} strokeWidth={1.75} />
                </span>
                <span className="home-quick-start-card-title">{t('agentSetupCardTitle')}</span>
                <span className="home-quick-start-card-desc">{t('agentSetupCardDesc')}</span>
              </button>
            </div>
          ) : !agentReady || !defaultProject ? null : (
            <div className="home-agent-composer-wrap">
              <form className="home-agent-composer" onSubmit={(ev) => void onStartChat(ev)}>
                <textarea
                  className="home-agent-composer-input"
                  placeholder={t('agentComposerPlaceholder')}
                  value={draft}
                  onChange={(ev) => setDraft(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' && !ev.shiftKey) {
                      ev.preventDefault();
                      void onStartChat();
                    }
                  }}
                  rows={2}
                  disabled={starting}
                  aria-label={t('agentComposerPlaceholder')}
                />
                <button
                  type="submit"
                  className="home-agent-composer-send"
                  disabled={starting || !draft.trim()}
                  aria-label={t('agentSendAria')}
                >
                  {starting ? (
                    <Loader2 size={18} className="home-ops-spinner" aria-hidden />
                  ) : (
                    <ArrowUp size={18} strokeWidth={2.25} aria-hidden />
                  )}
                </button>
              </form>
              <p className="home-muted home-agent-composer-hint">
                <Trans
                  i18nKey="agentComposerHint"
                  ns="home"
                  values={{ project: defaultProject.name }}
                  components={{
                    projectLink: (
                      <Link
                        to={`/projects/${defaultProject.id}`}
                        className="home-agent-composer-project-link"
                      />
                    ),
                  }}
                />
              </p>
            </div>
          )}
        </section>
      ) : null}

      {hasApps && (
        <section className="home-apps app-page-section" aria-label={t('appsHeading')}>
          <header className="home-apps-header">
            {showWelcome || agentsEnabled ? (
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
