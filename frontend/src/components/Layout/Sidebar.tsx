import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Home as HomeIcon,
  FileStack,
  FileText,
  Database,
  BookOpen,
  Folder,
  FolderOpen,
  ChevronRight,
  GitBranch,
  ListTodo,
  Cpu,
  LayoutDashboard,
  Settings,
  Users,
  ArrowLeft,
  ToggleLeft,
  Box,
  Link2,
  Table,
  Network,
  Compass,
  ClipboardList,
  Shield,
  KeyRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import logo from '../../assets/logo.svg';
import { useAuth } from '../../contexts/AuthContext';
import {
  PERM_CONSOLE_DATA_SOURCES,
  PERM_CONSOLE_DATASETS,
  PERM_CONSOLE_FEATURE_TOGGLES,
  PERM_CONSOLE_GROUPS,
  PERM_CONSOLE_LINK_TYPES,
  PERM_CONSOLE_OBJECT_TYPES,
  PERM_CONSOLE_PERMISSIONS,
  PERM_CONSOLE_SETTINGS,
  PERM_CONSOLE_USERS,
} from '../../config/permissions';
import { useDocumentChannels } from '../../contexts/DocumentChannelsContext';
import { getAllExpandableChannelIds, getFirstLeafChannelId } from '../../data/channelUtils';
import type { ChannelNode } from '../../data/channelUtils';
import { useFeatureToggles } from '../../contexts/FeatureTogglesContext';
import './Sidebar.css';

/** Article channels: placeholder (no backend yet) */
const articleChannels: ChannelNode[] = [];

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
                aria-label={expanded[ch.id] ? 'Collapse' : 'Expand'}
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

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { channels } = useDocumentChannels();
  const onDocuments = location.pathname === '/documents' || location.pathname.startsWith('/documents/');
  const onArticles = location.pathname === '/articles' || location.pathname.startsWith('/articles/');

  const defaultDocChannel = getFirstLeafChannelId(channels);
  const docChannelMatch = location.pathname.match(/^\/documents\/channels\/([^/]+)/);
  const docChannel = onDocuments
    ? (docChannelMatch?.[1] ?? defaultDocChannel)
    : null;
  const artChannel = onArticles
    ? searchParams.get('channel') || ''
    : null;

  const [docExpanded, setDocExpanded] = useState<Record<string, boolean>>({});
  const [artExpanded, setArtExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (onDocuments && channels.length > 0) {
      const expandableIds = getAllExpandableChannelIds(channels);
      setDocExpanded((prev) => {
        const next = { ...prev };
        for (const id of expandableIds) {
          next[id] = true;
        }
        return next;
      });
    }
  }, [onDocuments, channels]);

  const setDocumentChannel = (id: string) => {
    if (location.pathname.startsWith('/documents')) {
      navigate(`/documents/channels/${id}`);
    } else {
      navigate(`/documents/channels/${id}`);
    }
  };
  const setArticleChannel = (id: string) => {
    if (location.pathname.startsWith('/articles')) {
      navigate(`/articles?channel=${id}`);
    } else {
      setSearchParams({ channel: id });
    }
  };

  const onOntology = location.pathname.startsWith('/ontology') || location.pathname.startsWith('/objects') || location.pathname.startsWith('/links') || location.pathname.startsWith('/object-explorer');
  const onConsole = location.pathname.startsWith('/console');
  const { canAccessConsole, hasPermission } = useAuth();
  const { toggles } = useFeatureToggles();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <img src={logo} alt="" className="sidebar-logo-icon" />
          <span className="sidebar-title">openKMS</span>
        </div>
      </div>
      <nav className="sidebar-nav">
        {onConsole && canAccessConsole ? (
          <>
            <Link to="/" className="sidebar-link sidebar-link-exit">
              <ArrowLeft size={18} strokeWidth={1.75} />
              <span>Exit Console</span>
            </Link>
            <NavLink to="/console" end className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}>
              <LayoutDashboard size={18} strokeWidth={1.75} />
              <span>Overview</span>
            </NavLink>
            <div className="sidebar-menu-label">Permission management</div>
            {hasPermission(PERM_CONSOLE_PERMISSIONS) && (
              <NavLink
                to="/console/permission-management"
                className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
              >
                <KeyRound size={18} strokeWidth={1.75} />
                <span>Permissions</span>
              </NavLink>
            )}
            <div className="sidebar-menu-label">Data security</div>
            {hasPermission(PERM_CONSOLE_GROUPS) && (
              <NavLink
                to="/console/data-security/groups"
                className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
              >
                <Shield size={18} strokeWidth={1.75} />
                <span>Access groups</span>
              </NavLink>
            )}
            <div className="sidebar-menu-label">Console</div>
            {hasPermission(PERM_CONSOLE_DATA_SOURCES) && (
              <NavLink to="/console/data-sources" className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}>
                <Database size={18} strokeWidth={1.75} />
                <span>Data Sources</span>
              </NavLink>
            )}
            {hasPermission(PERM_CONSOLE_DATASETS) && (
              <NavLink to="/console/datasets" className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}>
                <Table size={18} strokeWidth={1.75} />
                <span>Datasets</span>
              </NavLink>
            )}
            {hasPermission(PERM_CONSOLE_OBJECT_TYPES) && (
              <NavLink to="/console/object-types" className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}>
                <Box size={18} strokeWidth={1.75} />
                <span>Object Types</span>
              </NavLink>
            )}
            {hasPermission(PERM_CONSOLE_LINK_TYPES) && (
              <NavLink to="/console/link-types" className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}>
                <Link2 size={18} strokeWidth={1.75} />
                <span>Link Types</span>
              </NavLink>
            )}
            {hasPermission(PERM_CONSOLE_SETTINGS) && (
              <NavLink to="/console/settings" className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}>
                <Settings size={18} strokeWidth={1.75} />
                <span>System Settings</span>
              </NavLink>
            )}
            {hasPermission(PERM_CONSOLE_USERS) && (
              <NavLink to="/console/users" className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}>
                <Users size={18} strokeWidth={1.75} />
                <span>Users &amp; roles</span>
              </NavLink>
            )}
            {hasPermission(PERM_CONSOLE_FEATURE_TOGGLES) && (
              <NavLink to="/console/feature-toggles" className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}>
                <ToggleLeft size={18} strokeWidth={1.75} />
                <span>Feature Toggles</span>
              </NavLink>
            )}
          </>
        ) : (
          <>
        <NavLink
          to="/"
          className={({ isActive }) =>
            `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
          }
        >
          <HomeIcon size={18} strokeWidth={1.75} />
          <span>Home</span>
        </NavLink>
        <div className="sidebar-menu-group">
          <NavLink
            to="/documents"
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
            }
          >
            <FileStack size={18} strokeWidth={1.75} />
            <span>Documents</span>
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
        {toggles.articles && (
          <div className="sidebar-menu-group">
            <NavLink
              to="/articles"
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
              }
            >
              <FileText size={18} strokeWidth={1.75} />
              <span>Articles</span>
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
        {(toggles.objectsAndLinks || toggles.hasNeo4jDataSource) && (
          <div className="sidebar-menu-group">
            <NavLink
              to="/ontology"
              className={({ isActive }) =>
                `sidebar-link ${isActive || onOntology ? 'sidebar-link-active' : ''}`
              }
            >
              <Network size={18} strokeWidth={1.75} />
              <span>Ontology</span>
            </NavLink>
            {onOntology && (
              <div className="sidebar-subnav">
                <NavLink
                  to="/objects"
                  className={({ isActive }) =>
                    `sidebar-link sidebar-sublink ${isActive ? 'sidebar-link-active' : ''}`
                  }
                >
                  <Box size={18} strokeWidth={1.75} />
                  <span>Objects</span>
                </NavLink>
              <NavLink
                to="/links"
                className={({ isActive }) =>
                  `sidebar-link sidebar-sublink ${isActive ? 'sidebar-link-active' : ''}`
                }
              >
                <Link2 size={18} strokeWidth={1.75} />
                <span>Links</span>
              </NavLink>
              <NavLink
                to="/object-explorer"
                className={({ isActive }) =>
                  `sidebar-link sidebar-sublink ${isActive ? 'sidebar-link-active' : ''}`
                }
              >
                <Compass size={18} strokeWidth={1.75} />
                <span>Object Explorer</span>
              </NavLink>
              </div>
            )}
          </div>
        )}
        <NavLink
          to="/glossaries"
          className={({ isActive }) =>
            `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
          }
        >
          <BookOpen size={18} strokeWidth={1.75} />
          <span>Glossaries</span>
        </NavLink>
        {toggles.knowledgeBases && (
          <NavLink
            to="/knowledge-bases"
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
            }
          >
            <Database size={18} strokeWidth={1.75} />
            <span>Knowledge Bases</span>
          </NavLink>
        )}
        {toggles.evaluationDatasets && (
          <NavLink
            to="/evaluation-datasets"
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
            }
          >
            <ClipboardList size={18} strokeWidth={1.75} />
            <span>Evaluation</span>
          </NavLink>
        )}
        <NavLink
          to="/pipelines"
          className={({ isActive }) =>
            `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
          }
        >
          <GitBranch size={18} strokeWidth={1.75} />
          <span>Pipelines</span>
        </NavLink>
        <NavLink
          to="/jobs"
          className={({ isActive }) =>
            `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
          }
        >
          <ListTodo size={18} strokeWidth={1.75} />
          <span>Jobs</span>
        </NavLink>
        <NavLink
          to="/models"
          className={({ isActive }) =>
            `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
          }
        >
          <Cpu size={18} strokeWidth={1.75} />
          <span>Models</span>
        </NavLink>
          </>
        )}
      </nav>
    </aside>
  );
}
