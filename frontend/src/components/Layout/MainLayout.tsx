import { type ReactNode, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { X, LogIn, Home } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isConsoleShellPath } from '../../config/appModules';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '../../contexts/AuthContext';
import { SidebarLayoutProvider } from '../../contexts/SidebarLayoutContext';
import { MobileShellProvider, useMobileShell } from '../../contexts/MobileShellContext';
import { ManagerNavRail } from '../ontology/ManagerNavRail';
import { ExplorerNavRail } from '../ontology/ExplorerNavRail';
import { FunctionEditorNavRail } from '../ontology/FunctionEditorNavRail';
import {
  getOntologySubApp,
  isFunctionEditorWorkspacePath,
  isObjectExplorerExplorePath,
  isOntologySuitePath,
} from '../ontology/getOntologySubApp';
import '../../App.scss';

function OntologyRail({ subApp }: { subApp: ReturnType<typeof getOntologySubApp> }) {
  if (subApp === 'ontology-manager') return <ManagerNavRail />;
  if (subApp === 'object-explorer') return <ExplorerNavRail />;
  if (subApp === 'function-editor') return <FunctionEditorNavRail />;
  return null;
}

function OntologySection({
  subApp,
  children,
}: {
  subApp: ReturnType<typeof getOntologySubApp>;
  children: ReactNode;
}) {
  const { t } = useTranslation('layout');
  const { ontologyRailOpen, setOntologyRailAvailable, closeRails } = useMobileShell();

  useEffect(() => {
    setOntologyRailAvailable(true);
    return () => setOntologyRailAvailable(false);
  }, [setOntologyRailAvailable]);

  return (
    <div className="ontology-section-layout">
      {ontologyRailOpen ? (
        <button
          type="button"
          className="mobile-rail-backdrop"
          aria-label={t('closeNavRail')}
          onClick={closeRails}
        />
      ) : null}
      <div
        className={`ontology-section-layout__rail${ontologyRailOpen ? ' is-open' : ''}`}
        id="ontology-nav-rail-drawer"
      >
        <OntologyRail subApp={subApp} />
      </div>
      <div className="ontology-section-layout__main app-page-pane">{children}</div>
    </div>
  );
}

function MainLayoutInner() {
  const { t } = useTranslation('layout');
  const location = useLocation();
  const navigate = useNavigate();
  const {
    isAuthenticated,
    isLoading,
    authError,
    clearAuthError,
    retryAuth,
    login,
    canAccessPath,
    permissionPatternsReady,
  } = useAuth();
  const isHome = location.pathname === '/';
  const showAuthRequired = !isLoading && !isAuthenticated && !isHome;
  const showPathDenied =
    !isLoading && isAuthenticated && permissionPatternsReady && !canAccessPath(location.pathname);

  const isAgentsWorkspace =
    /^\/projects\/[^/]+\/sessions\/[^/]+$/.test(location.pathname) ||
    /^\/projects\/[^/]+\/sessions\/[^/]+\/review$/.test(location.pathname) ||
    /^\/projects\/[^/]+$/.test(location.pathname);
  const isDetailPage =
    location.pathname.startsWith('/documents/view') ||
    location.pathname.startsWith('/articles/view') ||
    location.pathname.startsWith('/knowledge-bases/') ||
    location.pathname.startsWith('/wikis/') ||
    isAgentsWorkspace;
  const isSearchPage = location.pathname === '/search';

  const ontologySubApp = getOntologySubApp(location.pathname);
  const showOntologyRail = isOntologySuitePath(location.pathname) && !isFunctionEditorWorkspacePath(location.pathname);
  const isExplorePage = isObjectExplorerExplorePath(location.pathname);
  const isEditorWorkspace = isFunctionEditorWorkspacePath(location.pathname);

  const sidebarCollapsed = true;
  const onArticles =
    location.pathname === '/articles' || location.pathname.startsWith('/articles/');
  const onDocuments =
    location.pathname === '/documents' || location.pathname.startsWith('/documents/');
  const onMedia = location.pathname === '/media' || location.pathname.startsWith('/media/');
  const showChannelRail = onArticles || onDocuments || onMedia;
  const consoleShell = isConsoleShellPath(location.pathname);

  let ontologyRailModifier = '';
  if (ontologySubApp === 'ontology-manager') ontologyRailModifier = ' app-content--with-ontology-manager-rail';
  else if (ontologySubApp === 'object-explorer') ontologyRailModifier = ' app-content--with-object-explorer-rail';
  else if (ontologySubApp === 'function-editor') ontologyRailModifier = ' app-content--with-function-editor-rail';

  let ontologyOutlet: ReactNode = <Outlet />;
  if (showOntologyRail) {
    ontologyOutlet = (
      <OntologySection subApp={ontologySubApp}>
        <Outlet />
      </OntologySection>
    );
  }

  return (
    <div
      className={`app-layout ${consoleShell ? 'app-layout--console' : 'app-layout--sidebar-collapsed'}`}
    >
      <Header />
      <div className="app-shell-body">
        <Sidebar />
        <main className="app-main">
        {showAuthRequired && (
          <div className="auth-required-message" role="alert">
            <h2 className="auth-required-title">{t('authRequiredTitle')}</h2>
            <p className="auth-required-text">{t('authRequiredBody')}</p>
            <button type="button" onClick={login} className="auth-required-btn">
              <LogIn size={20} />
              <span>{t('logIn')}</span>
            </button>
          </div>
        )}
        {authError && (
          <div className="auth-error-banner" role="alert">
            <span>{authError}</span>
            <div className="auth-error-banner-actions">
              <button type="button" onClick={retryAuth} className="auth-error-banner-retry">
                {t('authErrorRetry')}
              </button>
              <button
                type="button"
                onClick={clearAuthError}
                className="auth-error-banner-dismiss"
                aria-label={t('dismiss')}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
        {!showAuthRequired && showPathDenied && (
          <div className="auth-required-message" role="alert">
            <h2 className="auth-required-title">{t('accessDeniedTitle')}</h2>
            <p className="auth-required-text">{t('accessDeniedBody')}</p>
            <button type="button" onClick={() => navigate('/', { replace: true })} className="auth-required-btn">
              <Home size={20} />
              <span>{t('home')}</span>
            </button>
          </div>
        )}
        {!showAuthRequired && !showPathDenied && (
          <SidebarLayoutProvider sidebarCollapsed={sidebarCollapsed}>
            <div
              className={`app-content ${isDetailPage ? 'app-content--compact' : ''}${isHome ? ' app-content--home' : ''}${isSearchPage ? ' app-content--search' : ''}${isExplorePage ? ' app-content--object-explorer' : ''}${isEditorWorkspace ? ' app-content--function-editor-workspace' : ''}${showChannelRail ? ' app-content--with-channel-rail' : ''}${ontologyRailModifier}`}
            >
              {ontologyOutlet}
            </div>
          </SidebarLayoutProvider>
        )}
        </main>
      </div>
    </div>
  );
}

export function MainLayout() {
  return (
    <MobileShellProvider>
      <MainLayoutInner />
    </MobileShellProvider>
  );
}
