import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Home as HomeIcon,
  FileStack,
  FileText,
  HardDrive,
  Image,
  Database,
  BookOpen,
  ChevronLeft,
  GitBranch,
  ListTodo,
  Cpu,
  LayoutDashboard,
  HeartPulse,
  Settings,
  Users,
  Menu,
  ToggleLeft,
  Box,
  Link2,
  Table,
  Network,
  Compass,
  ClipboardList,
  Shield,
  KeyRound,
  Library,
  FolderTree,
  Plug,
  Bot,
} from 'lucide-react';
import { useEffect, useState, startTransition } from 'react';
import { useTranslation } from 'react-i18next';

import logo from '../../assets/logo.svg';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentChannels } from '../../contexts/DocumentChannelsContext';
import { useArticleChannels } from '../../contexts/ArticleChannelsContext';
import { useMediaChannels } from '../../contexts/MediaChannelsContext';
import { useSystemPublic } from '../../contexts/SystemPublicContext';
import { getAllExpandableChannelIds, getFirstLeafChannelId } from '../../data/channelUtils';
import { ChannelTree } from '../channels/ChannelTree';
import { useFeatureToggles } from '../../contexts/FeatureTogglesContext';
import './Sidebar.scss';

function OntologyChildNavLinks({ canAccessPath }: { canAccessPath: (path: string) => boolean }) {
  const { t } = useTranslation('layout');
  return (
    <>
      {canAccessPath('/ontology/datasets') && (
        <NavLink
          to="/ontology/datasets"
          className={({ isActive }) =>
            `sidebar-link sidebar-sublink ${isActive ? 'sidebar-link-active' : ''}`
          }
        >
          <Table size={18} strokeWidth={1.75} />
          <span>{t('datasets')}</span>
        </NavLink>
      )}
      {canAccessPath('/ontology/object-types') && (
        <NavLink
          to="/ontology/object-types"
          className={({ isActive }) =>
            `sidebar-link sidebar-sublink ${isActive ? 'sidebar-link-active' : ''}`
          }
        >
          <Box size={18} strokeWidth={1.75} />
          <span>{t('objectTypes')}</span>
        </NavLink>
      )}
      {canAccessPath('/ontology/link-types') && (
        <NavLink
          to="/ontology/link-types"
          className={({ isActive }) =>
            `sidebar-link sidebar-sublink ${isActive ? 'sidebar-link-active' : ''}`
          }
        >
          <Link2 size={18} strokeWidth={1.75} />
          <span>{t('linkTypes')}</span>
        </NavLink>
      )}
      {canAccessPath('/objects') && (
        <NavLink
          to="/objects"
          className={({ isActive }) =>
            `sidebar-link sidebar-sublink ${isActive ? 'sidebar-link-active' : ''}`
          }
        >
          <Box size={18} strokeWidth={1.75} />
          <span>{t('objects')}</span>
        </NavLink>
      )}
      {canAccessPath('/links') && (
        <NavLink
          to="/links"
          className={({ isActive }) =>
            `sidebar-link sidebar-sublink ${isActive ? 'sidebar-link-active' : ''}`
          }
        >
          <Link2 size={18} strokeWidth={1.75} />
          <span>{t('links')}</span>
        </NavLink>
      )}
      {canAccessPath('/object-explorer') && (
        <NavLink
          to="/object-explorer"
          className={({ isActive }) =>
            `sidebar-link sidebar-sublink ${isActive ? 'sidebar-link-active' : ''}`
          }
        >
          <Compass size={18} strokeWidth={1.75} />
          <span>{t('objectExplorer')}</span>
        </NavLink>
      )}
    </>
  );
}

export type SidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  const { t } = useTranslation('layout');
  const location = useLocation();
  const navigate = useNavigate();
  const { channels, ensureLoaded: ensureDocumentChannels } = useDocumentChannels();
  const { channels: articleChannels, ensureLoaded: ensureArticleChannels } = useArticleChannels();
  const { channels: mediaChannels, ensureLoaded: ensureMediaChannels } = useMediaChannels();
  const { systemName: sidebarBrandName } = useSystemPublic();
  const onDocuments = location.pathname === '/documents' || location.pathname.startsWith('/documents/');
  const onArticles = location.pathname === '/articles' || location.pathname.startsWith('/articles/');
  const onMedia = location.pathname === '/media' || location.pathname.startsWith('/media/');

  const defaultDocChannel = getFirstLeafChannelId(channels);
  const docChannelMatch = location.pathname.match(/^\/documents\/channels\/([^/]+)/);
  const docChannel = onDocuments
    ? (docChannelMatch?.[1] ?? defaultDocChannel)
    : null;
  const defaultArtChannel = getFirstLeafChannelId(articleChannels);
  const artChannelMatch = location.pathname.match(/^\/articles\/channels\/([^/]+)/);
  const artChannel = onArticles ? (artChannelMatch?.[1] ?? defaultArtChannel) : null;
  const defaultMediaChannel = getFirstLeafChannelId(mediaChannels);
  const mediaChannelMatch = location.pathname.match(/^\/media\/channels\/([^/]+)/);
  const mediaChannel = onMedia ? (mediaChannelMatch?.[1] ?? defaultMediaChannel) : null;

  const [docExpanded, setDocExpanded] = useState<Record<string, boolean>>({});
  const [artExpanded, setArtExpanded] = useState<Record<string, boolean>>({});
  const [mediaExpanded, setMediaExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (onDocuments) void ensureDocumentChannels();
  }, [onDocuments, ensureDocumentChannels]);

  useEffect(() => {
    if (onArticles) void ensureArticleChannels();
  }, [onArticles, ensureArticleChannels]);

  useEffect(() => {
    if (onMedia) void ensureMediaChannels();
  }, [onMedia, ensureMediaChannels]);

  useEffect(() => {
    if (onDocuments && channels.length > 0) {
      const expandableIds = getAllExpandableChannelIds(channels);
      startTransition(() => {
        setDocExpanded((prev) => {
          const next = { ...prev };
          for (const id of expandableIds) {
            next[id] = true;
          }
          return next;
        });
      });
    }
  }, [onDocuments, channels]);

  useEffect(() => {
    if (onArticles && articleChannels.length > 0) {
      const expandableIds = getAllExpandableChannelIds(articleChannels);
      startTransition(() => {
        setArtExpanded((prev) => {
          const next = { ...prev };
          for (const id of expandableIds) {
            next[id] = true;
          }
          return next;
        });
      });
    }
  }, [onArticles, articleChannels]);

  useEffect(() => {
    if (onMedia && mediaChannels.length > 0) {
      const expandableIds = getAllExpandableChannelIds(mediaChannels);
      startTransition(() => {
        setMediaExpanded((prev) => {
          const next = { ...prev };
          for (const id of expandableIds) {
            next[id] = true;
          }
          return next;
        });
      });
    }
  }, [onMedia, mediaChannels]);

  const setDocumentChannel = (id: string) => {
    if (location.pathname.startsWith('/documents')) {
      navigate(`/documents/channels/${id}`);
    } else {
      navigate(`/documents/channels/${id}`);
    }
  };
  const setArticleChannel = (id: string) => {
    navigate(`/articles/channels/${id}`);
  };
  const setMediaChannel = (id: string) => {
    navigate(`/media/channels/${id}`);
  };

  const onOntology =
    location.pathname.startsWith('/ontology') ||
    location.pathname.startsWith('/objects') ||
    location.pathname.startsWith('/links') ||
    location.pathname.startsWith('/object-explorer');
  const onConsole = location.pathname.startsWith('/console');
  const { canAccessConsole, canAccessPath } = useAuth();
  const { toggles } = useFeatureToggles();

  const showOntologySection =
    canAccessPath('/ontology') ||
    canAccessPath('/ontology/datasets') ||
    canAccessPath('/ontology/object-types') ||
    canAccessPath('/ontology/link-types') ||
    canAccessPath('/objects') ||
    canAccessPath('/links') ||
    canAccessPath('/object-explorer');

  const showConsoleDataLabel =
    canAccessPath('/console/data-sources') ||
    canAccessPath('/console/storage') ||
    canAccessPath('/console/settings') ||
    canAccessPath('/console/users') ||
    canAccessPath('/console/feature-toggles');

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`} aria-label={t('mainNavigation')}>
      <div className={`sidebar-header${collapsed ? ' sidebar-header--collapsed' : ''}`}>
        <div className={`sidebar-logo${collapsed ? ' sidebar-logo--collapsed' : ''}`}>
          <img src={logo} alt="" className="sidebar-logo-icon" />
          {!collapsed && (
            <span className="sidebar-title" title={sidebarBrandName || undefined}>
              {sidebarBrandName}
            </span>
          )}
        </div>
        <button
          type="button"
          className="sidebar-collapse-toggle"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-controls="sidebar-primary-nav"
          aria-label={collapsed ? t('expandSidebar') : t('collapseSidebar')}
          title={collapsed ? t('expandSidebar') : t('collapseSidebar')}
        >
          {collapsed ? <Menu size={20} strokeWidth={2} /> : <ChevronLeft size={20} strokeWidth={2} />}
        </button>
      </div>
      <nav
        id="sidebar-primary-nav"
        className={`sidebar-nav ${onConsole && canAccessConsole ? 'sidebar-nav--console' : ''}${collapsed ? ' sidebar-nav--collapsed' : ''}`}
      >
        {onConsole && canAccessConsole ? (
            <div className="sidebar-nav-console-scroll">
              {canAccessPath('/console') && (
                <NavLink
                  to="/console"
                  end
                  title={t('overview')}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                >
                  <LayoutDashboard size={18} strokeWidth={1.75} />
                  <span>{t('overview')}</span>
                </NavLink>
              )}
              {canAccessPath('/console/health') && (
                <NavLink
                  to="/console/health"
                  title={t('health')}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                >
                  <HeartPulse size={18} strokeWidth={1.75} />
                  <span>{t('health')}</span>
                </NavLink>
              )}
              {canAccessPath('/console/permission-management') && (
                <>
                  <div className="sidebar-menu-label">{t('permissionManagement')}</div>
                  <NavLink
                    to="/console/permission-management"
                    title={t('permissions')}
                    className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                  >
                    <KeyRound size={18} strokeWidth={1.75} />
                    <span>{t('permissions')}</span>
                  </NavLink>
                </>
              )}
              {(canAccessPath('/console/data-security/issues') ||
                canAccessPath('/console/data-security/groups')) && (
                <>
                  <div className="sidebar-menu-label">{t('dataSecurity')}</div>
                  {canAccessPath('/console/data-security/issues') && (
                    <NavLink
                      to="/console/data-security/issues"
                      title={t('dataSecurityIssues')}
                      className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                    >
                      <Shield size={18} strokeWidth={1.75} />
                      <span>{t('dataSecurityIssues')}</span>
                    </NavLink>
                  )}
                  {canAccessPath('/console/data-security/groups') && (
                    <NavLink
                      to="/console/data-security/groups"
                      title={t('accessGroups')}
                      className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                    >
                      <Users size={18} strokeWidth={1.75} />
                      <span>{t('accessGroups')}</span>
                    </NavLink>
                  )}
                </>
              )}
              {showConsoleDataLabel && <div className="sidebar-menu-label">{t('consoleSection')}</div>}
              {canAccessPath('/console/data-sources') && (
                <NavLink
                  to="/console/data-sources"
                  title={t('dataSources')}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                >
                  <Database size={18} strokeWidth={1.75} />
                  <span>{t('dataSources')}</span>
                </NavLink>
              )}
              {canAccessPath('/console/storage') && (
                <NavLink
                  to="/console/storage"
                  title={t('objectStorage')}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                >
                  <HardDrive size={18} strokeWidth={1.75} />
                  <span>{t('objectStorage')}</span>
                </NavLink>
              )}
              {canAccessPath('/console/settings') && (
                <NavLink
                  to="/console/settings"
                  title={t('systemSettings')}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                >
                  <Settings size={18} strokeWidth={1.75} />
                  <span>{t('systemSettings')}</span>
                </NavLink>
              )}
              {canAccessPath('/console/users') && (
                <NavLink
                  to="/console/users"
                  title={t('usersAndRoles')}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                >
                  <Users size={18} strokeWidth={1.75} />
                  <span>{t('usersAndRoles')}</span>
                </NavLink>
              )}
              {canAccessPath('/console/feature-toggles') && (
                <NavLink
                  to="/console/feature-toggles"
                  title={t('featureToggles')}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                >
                  <ToggleLeft size={18} strokeWidth={1.75} />
                  <span>{t('featureToggles')}</span>
                </NavLink>
              )}
            </div>
        ) : (
          <>
        <NavLink
          to="/"
          title={t('home')}
          className={({ isActive }) =>
            `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
          }
        >
          <HomeIcon size={18} strokeWidth={1.75} />
          <span>{t('home')}</span>
        </NavLink>
        {toggles.agents && canAccessPath('/agents') && (
          <NavLink
            to="/agents"
            title={t('agents')}
            className={({ isActive }) =>
              `sidebar-link ${
                isActive ||
                /^\/agents\/skills$/.test(location.pathname) ||
                /^\/projects\/[^/]+(\/(sessions\/[^/]+|settings))?$/.test(location.pathname)
                  ? 'sidebar-link-active'
                  : ''
              }`
            }
          >
            <Bot size={18} strokeWidth={1.75} />
            <span>{t('agents')}</span>
          </NavLink>
        )}
        {canAccessPath('/articles') && (
          <div className="sidebar-menu-group">
            <NavLink
              to="/articles"
              title={t('articles')}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
              }
            >
              <FileText size={18} strokeWidth={1.75} />
              <span>{t('articles')}</span>
            </NavLink>
            {onArticles && articleChannels.length > 0 && (
              <div className="sidebar-subnav">
                <ChannelTree
                  channels={articleChannels}
                  selectedId={artChannel}
                  expanded={artExpanded}
                  onSelect={setArticleChannel}
                  onToggle={(id) => setArtExpanded((p) => ({ ...p, [id]: !p[id] }))}
                />
              </div>
            )}
          </div>
        )}
        {toggles.media && canAccessPath('/media') && (
          <div className="sidebar-menu-group">
            <NavLink
              to="/media"
              title={t('media')}
              className={({ isActive }) =>
                `sidebar-link ${isActive || onMedia ? 'sidebar-link-active' : ''}`
              }
            >
              <Image size={18} strokeWidth={1.75} />
              <span>{t('media')}</span>
            </NavLink>
            {onMedia && mediaChannels.length > 0 && (
              <div className="sidebar-subnav">
                <ChannelTree
                  channels={mediaChannels}
                  selectedId={mediaChannel}
                  expanded={mediaExpanded}
                  onSelect={setMediaChannel}
                  onToggle={(id) => setMediaExpanded((p) => ({ ...p, [id]: !p[id] }))}
                />
              </div>
            )}
          </div>
        )}
        {canAccessPath('/documents') && (
        <div className="sidebar-menu-group">
          <NavLink
            to="/documents"
            title={t('documents')}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
            }
          >
            <FileStack size={18} strokeWidth={1.75} />
            <span>{t('documents')}</span>
          </NavLink>
          {onDocuments && channels.length > 0 && (
            <div className="sidebar-subnav">
              <ChannelTree
                channels={channels}
                selectedId={docChannel}
                expanded={docExpanded}
                onSelect={setDocumentChannel}
                onToggle={(id) => setDocExpanded((p) => ({ ...p, [id]: !p[id] }))}
              />
            </div>
          )}
        </div>
        )}
        {canAccessPath('/wikis') && (
          <NavLink
            to="/wikis"
            title={t('wikiSpaces')}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
            }
          >
            <Library size={18} strokeWidth={1.75} />
            <span>{t('wikiSpaces')}</span>
          </NavLink>
        )}
        {canAccessPath('/knowledge-bases') && (
          <NavLink
            to="/knowledge-bases"
            title={t('knowledgeBases')}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
            }
          >
            <Database size={18} strokeWidth={1.75} />
            <span>{t('knowledgeBases')}</span>
          </NavLink>
        )}
        {toggles.evaluations && canAccessPath('/evaluations') && (
          <NavLink
            to="/evaluations"
            title={t('evaluation')}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
            }
          >
            <ClipboardList size={18} strokeWidth={1.75} />
            <span>{t('evaluation')}</span>
          </NavLink>
        )}
        {showOntologySection && (
          <div className="sidebar-menu-group">
            {canAccessPath('/ontology') && (
              <NavLink
                to="/ontology"
                title={t('ontology')}
                className={({ isActive }) =>
                  `sidebar-link ${isActive || onOntology ? 'sidebar-link-active' : ''}`
                }
              >
                <Network size={18} strokeWidth={1.75} />
                <span>{t('ontology')}</span>
              </NavLink>
            )}
            {onOntology && (
              <div className="sidebar-subnav">
                <OntologyChildNavLinks canAccessPath={canAccessPath} />
              </div>
            )}
          </div>
        )}
        {canAccessPath('/glossaries') && (
          <NavLink
            to="/glossaries"
            title={t('glossaries')}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
            }
          >
            <BookOpen size={18} strokeWidth={1.75} />
            <span>{t('glossaries')}</span>
          </NavLink>
        )}
        {canAccessPath('/knowledge-map') && (
          <NavLink
            to="/knowledge-map"
            title={t('knowledgeMap')}
            className={({ isActive }) =>
              `sidebar-link ${
                isActive || location.pathname.startsWith('/knowledge-map/')
                  ? 'sidebar-link-active'
                  : ''
              }`
            }
          >
            <FolderTree size={18} strokeWidth={1.75} />
            <span>{t('knowledgeMap')}</span>
          </NavLink>
        )}
        {toggles.connectors && canAccessPath('/connectors') && (
          <NavLink
            to="/connectors"
            title={t('connectors')}
            className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
          >
            <Plug size={18} strokeWidth={1.75} />
            <span>{t('connectors')}</span>
          </NavLink>
        )}
        {canAccessPath('/pipelines') && (
        <NavLink
          to="/pipelines"
          title={t('pipelines')}
          className={({ isActive }) =>
            `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
          }
        >
          <GitBranch size={18} strokeWidth={1.75} />
          <span>{t('pipelines')}</span>
        </NavLink>
        )}
        {(canAccessPath('/job-runs') || canAccessPath('/jobs')) && (
        <NavLink
          to="/job-runs"
          title={t('jobs')}
          className={({ isActive }) =>
            `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
          }
        >
          <ListTodo size={18} strokeWidth={1.75} />
          <span>{t('jobs')}</span>
        </NavLink>
        )}
        {canAccessPath('/models') && (
        <NavLink
          to="/models"
          title={t('models')}
          className={({ isActive }) =>
            `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
          }
        >
          <Cpu size={18} strokeWidth={1.75} />
          <span>{t('models')}</span>
        </NavLink>
        )}
          </>
        )}
      </nav>
    </aside>
  );
}
