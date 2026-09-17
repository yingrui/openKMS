import { type CSSProperties, useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X, LogIn, Home, Menu } from 'lucide-react';
import { isConsoleShellPath } from '../../config/appModules';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '../../contexts/AuthContext';
import { SidebarLayoutProvider } from '../../contexts/SidebarLayoutContext';
import { OntologyNavRail, isOntologyAppPath } from '../ontology/OntologyNavRail';
import { GraphNavRail, isGraphAppPath } from '../graph/GraphNavRail';
import { AgentAssistantDock } from '../../pages/ontology/AgentAssistantDock';
import '../../App.scss';

/** 安利大健康知识库(全局 AI 助手默认接入)。 */
const ANLI_KB_ID = 'a3ca4923-ff1e-4798-864b-d52eb8903996';

const SIDEBAR_CONSOLE_WIDTH = '220px';

export function MainLayout() {
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
  const isObjectExplorerPage = location.pathname === '/object-explorer';

  // 安利 demo：主导航展开显示文字（原逻辑折叠成 56px 图标窄栏）。
  const sidebarCollapsed = false;
  // 移动端：窄屏时侧边栏收成抽屉，汉堡按钮切换；路由变化时自动关闭。
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);
  const onArticles =
    location.pathname === '/articles' || location.pathname.startsWith('/articles/');
  const onDocuments =
    location.pathname === '/documents' || location.pathname.startsWith('/documents/');
  const onMedia = location.pathname === '/media' || location.pathname.startsWith('/media/');
  const showChannelRail = onArticles || onDocuments || onMedia;
  const showOntologyRail = isOntologyAppPath(location.pathname);
  const showGraphRail = isGraphAppPath(location.pathname);
  const consoleShell = isConsoleShellPath(location.pathname);

  return (
    <div
      className={`app-layout ${consoleShell ? 'app-layout--console' : 'app-layout--sidebar-expanded'}${mobileNavOpen ? ' app-layout--mobile-nav-open' : ''}`}
      style={
        {
          // 安利 demo：主导航与控制台一样用展开宽度显示文字标签。
          ['--sidebar-width' as string]: SIDEBAR_CONSOLE_WIDTH,
        } as CSSProperties
      }
    >
      <Header />
      <button
        type="button"
        className="mobile-nav-toggle"
        aria-label="菜单"
        aria-expanded={mobileNavOpen}
        onClick={() => setMobileNavOpen((v) => !v)}
      >
        {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
      </button>
      {mobileNavOpen && (
        <div className="mobile-nav-overlay" onClick={() => setMobileNavOpen(false)} aria-hidden />
      )}
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
              className={`app-content ${isDetailPage ? 'app-content--compact' : ''}${isHome ? ' app-content--home' : ''}${isSearchPage ? ' app-content--search' : ''}${isObjectExplorerPage ? ' app-content--object-explorer' : ''}${showChannelRail ? ' app-content--with-channel-rail' : ''}${showOntologyRail || showGraphRail ? ' app-content--with-ontology-rail' : ''}`}
            >
              {showOntologyRail ? (
                <div className="ontology-section-layout">
                  <OntologyNavRail />
                  <div className="ontology-section-layout__main app-page-pane">
                    <Outlet />
                  </div>
                </div>
              ) : showGraphRail ? (
                <div className="ontology-section-layout">
                  <GraphNavRail />
                  <div className="ontology-section-layout__main app-page-pane">
                    <Outlet />
                  </div>
                </div>
              ) : (
                <Outlet />
              )}
            </div>
          </SidebarLayoutProvider>
        )}
        </main>
      </div>
      {!consoleShell && (
        <AgentAssistantDock
          kbId={ANLI_KB_ID}
          title="AI 知识助手"
          greeting="你好，我是安利企业知识助手,可基于已审核的知识库回答产品、成分、健康方案与合规等问题,并给出来源。"
          placeholder="问我产品、成分、健康方案…（回车发送）"
          quickPrompts={[
            '叶黄素对护眼有什么帮助？',
            '体重管理有哪些产品方案？',
            'InBody 体脂率指标怎么解读？',
            '缓解老花眼相关的成分有哪些？',
          ]}
        />
      )}
    </div>
  );
}
