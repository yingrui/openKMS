import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Home as HomeIcon,
  FileStack,
  FileText,
  Database,
  BookOpen,
  Folder,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  ListTodo,
  Cpu,
  LayoutDashboard,
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
  Tags,
  FolderTree,
} from 'lucide-react';
import { useCallback, useEffect, useState, startTransition } from 'react';
import { useTranslation } from 'react-i18next';

import logo from '../../assets/logo.svg';
import { DEFAULT_SYSTEM_DISPLAY_NAME, effectiveSystemDisplayName, fetchSystemPublic } from '../../data/systemApi';
import { SYSTEM_SETTINGS_UPDATED_EVENT } from '../../utils/systemSettingsStorage';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentChannels } from '../../contexts/DocumentChannelsContext';
import { useArticleChannels } from '../../contexts/ArticleChannelsContext';
import { getAllExpandableChannelIds, getFirstLeafChannelId } from '../../data/channelUtils';
import type { ChannelNode } from '../../data/channelUtils';
import { useFeatureToggles } from '../../contexts/FeatureTogglesContext';
import './Sidebar.scss';

function SidebarChannelTree({
  channels,
  selectedId,
  expanded,
  onSelect,
  onToggle,
  depth = 0,
}: {
  channels: ChannelNode[];
  selectedId: string | null;
  expanded: Record<string, boolean>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  depth?: number;
}) {
  const { t } = useTranslation('layout');
  return (
    <ul className="sidebar-channel-tree" style={{ paddingLeft: depth > 0 ? 8 : 0 }}>
      {channels.map((ch) => (
        <li key={ch.id}>
          <div className={`sidebar-channel-item ${selectedId === ch.id ? 'selected' : ''}`}>
            {ch.children && ch.children.length > 0 ? (
              <button
                type="button"
                className="sidebar-channel-toggle"
                onClick={() => onToggle(ch.id)}
                aria-label={expanded[ch.id] ? t('collapseTree') : t('expandTree')}
              >
                <ChevronRight size={12} className={expanded[ch.id] ? 'expanded' : ''} />
              </button>
            ) : (
              <span className="sidebar-channel-spacer" />
            )}
            <button
              type="button"
              className="sidebar-channel-label"
              onClick={() => onSelect(ch.id)}
            >
              {ch.children && expanded[ch.id] ? (
                <FolderOpen size={14} />
              ) : (
                <Folder size={14} />
              )}
              <span>{ch.name}</span>
            </button>
          </div>
          {ch.children && expanded[ch.id] && (
            <SidebarChannelTree
              channels={ch.children}
              selectedId={selectedId}
              expanded={expanded}
              onSelect={onSelect}
              onToggle={onToggle}
              depth={depth + 1}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

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
  const { channels } = useDocumentChannels();
  const { channels: articleChannels } = useArticleChannels();
  const onDocuments = location.pathname === '/documents' || location.pathname.startsWith('/documents/');
  const onArticles = location.pathname === '/articles' || location.pathname.startsWith('/articles/');

  const defaultDocChannel = getFirstLeafChannelId(channels);
  const docChannelMatch = location.pathname.match(/^\/documents\/channels\/([^/]+)/);
  const docChannel = onDocuments
    ? (docChannelMatch?.[1] ?? defaultDocChannel)
    : null;
  const defaultArtChannel = getFirstLeafChannelId(articleChannels);
  const artChannelMatch = location.pathname.match(/^\/articles\/channels\/([^/]+)/);
  const artChannel = onArticles ? (artChannelMatch?.[1] ?? defaultArtChannel) : null;

  const [docExpanded, setDocExpanded] = useState<Record<string, boolean>>({});
  const [artExpanded, setArtExpanded] = useState<Record<string, boolean>>({});
  /** Empty until public system name is fetched (avoids flashing a default before the API responds). */
  const [sidebarBrandName, setSidebarBrandName] = useState('');

  const loadSidebarBrand = useCallback(async () => {
    try {
      const { system_name } = await fetchSystemPublic();
      setSidebarBrandName(effectiveSystemDisplayName(system_name));
    } catch {
      setSidebarBrandName(DEFAULT_SYSTEM_DISPLAY_NAME);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadSidebarBrand();
    });
  }, [loadSidebarBrand]);

  useEffect(() => {
    const onUpdated = () => void loadSidebarBrand();
    window.addEventListener(SYSTEM_SETTINGS_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(SYSTEM_SETTINGS_UPDATED_EVENT, onUpdated);
  }, [loadSidebarBrand]);

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

  const onOntology =
    location.pathname.startsWith('/ontology') ||
    location.pathname.startsWith('/objects') ||
    location.pathname.startsWith('/links') ||
    location.pathname.startsWith('/object-explorer');
  const onConsole = location.pathname.startsWith('/console');
  const { canAccessConsole, canAccessPath } = useAuth();
  const { toggles } = useFeatureToggles();

  const showOntologySection =
    (toggles.objectsAndLinks || toggles.hasNeo4jDataSource) &&
    (canAccessPath('/ontology') ||
      canAccessPath('/ontology/datasets') ||
      canAccessPath('/ontology/object-types') ||
      canAccessPath('/ontology/link-types') ||
      canAccessPath('/objects') ||
      canAccessPath('/links') ||
      canAccessPath('/object-explorer'));

  const showConsoleDataLabel =
    canAccessPath('/console/data-sources') ||
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
              {(canAccessPath('/console/data-security/groups') ||
                canAccessPath('/console/data-security/data-resources')) && (
                <>
                  <div className="sidebar-menu-label">{t('dataSecurity')}</div>
                  {canAccessPath('/console/data-security/groups') && (
                    <NavLink
                      to="/console/data-security/groups"
                      title={t('accessGroups')}
                      className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                    >
                      <Shield size={18} strokeWidth={1.75} />
                      <span>{t('accessGroups')}</span>
                    </NavLink>
                  )}
                  {canAccessPath('/console/data-security/data-resources') && (
                    <NavLink
                      to="/console/data-security/data-resources"
                      title={t('dataResources')}
                      className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                    >
                      <Tags size={18} strokeWidth={1.75} />
                      <span>{t('dataResources')}</span>
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
              <SidebarChannelTree
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
        {toggles.articles && canAccessPath('/articles') && (
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
                <SidebarChannelTree
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
        {toggles.wikiSpaces && canAccessPath('/wikis') && (
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
        {toggles.knowledge_map !== false &&
          (canAccessPath('/knowledge-map') || canAccessPath('/taxonomy')) && (
          <NavLink
            to="/knowledge-map"
            title={t('knowledgeMap')}
            className={({ isActive }) =>
              `sidebar-link ${
                isActive ||
                location.pathname === '/taxonomy' ||
                location.pathname.startsWith('/taxonomy/') ||
                location.pathname.startsWith('/knowledge-map/')
                  ? 'sidebar-link-active'
                  : ''
              }`
            }
          >
            <FolderTree size={18} strokeWidth={1.75} />
            <span>{t('knowledgeMap')}</span>
          </NavLink>
        )}
        {(canAccessPath('/glossaries') || showOntologySection) && (
          <div className="sidebar-menu-group">
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
            {showOntologySection && (
              <>
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
              </>
            )}
          </div>
        )}
        {toggles.knowledgeBases && canAccessPath('/knowledge-bases') && (
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
        {canAccessPath('/jobs') && (
        <NavLink
          to="/jobs"
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
