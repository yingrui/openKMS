import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Home as HomeIcon,
  FileStack,
  FileText,
  Database,
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
} from 'lucide-react';
import { useState } from 'react';

import logo from '../../assets/logo.svg';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentChannels } from '../../contexts/DocumentChannelsContext';
import { getFirstLeafChannelId } from '../../data/channelUtils';
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

  const onConsole = location.pathname.startsWith('/console');
  const { isAdmin } = useAuth();
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
        {onConsole && isAdmin ? (
          <>
            <Link to="/" className="sidebar-link sidebar-link-exit">
              <ArrowLeft size={18} strokeWidth={1.75} />
              <span>Exit Console</span>
            </Link>
            <NavLink to="/console" end className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}>
              <LayoutDashboard size={18} strokeWidth={1.75} />
              <span>Overview</span>
            </NavLink>
            <NavLink to="/console/settings" className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}>
              <Settings size={18} strokeWidth={1.75} />
              <span>Settings</span>
            </NavLink>
            <NavLink to="/console/users" className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}>
              <Users size={18} strokeWidth={1.75} />
              <span>Users & Roles</span>
            </NavLink>
            <NavLink to="/console/feature-toggles" className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}>
              <ToggleLeft size={18} strokeWidth={1.75} />
              <span>Feature Toggles</span>
            </NavLink>
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
