import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard,
  FileStack,
  FileText,
  Database,
  Folder,
  FolderOpen,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';

import {
  documentChannels,
  articleChannels,
  defaultDocumentChannel,
  defaultArticleChannel,
  type ChannelNode,
} from '../../data/channels';
import './Sidebar.css';

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
  const onDocuments = location.pathname === '/documents' || location.pathname.startsWith('/documents/');
  const onArticles = location.pathname === '/articles' || location.pathname.startsWith('/articles/');

  const docChannel = onDocuments
    ? searchParams.get('channel') || defaultDocumentChannel
    : null;
  const artChannel = onArticles
    ? searchParams.get('channel') || defaultArticleChannel
    : null;

  const [docExpanded, setDocExpanded] = useState<Record<string, boolean>>({
    dc1: true,
    dc2: true,
    dc3: true,
  });
  const [artExpanded, setArtExpanded] = useState<Record<string, boolean>>({
    ac1: true,
    ac2: true,
    ac3: true,
  });

  const setDocumentChannel = (id: string) => {
    if (location.pathname.startsWith('/documents')) {
      navigate(`/documents?channel=${id}`);
    } else {
      setSearchParams({ channel: id });
    }
  };
  const setArticleChannel = (id: string) => {
    if (location.pathname.startsWith('/articles')) {
      navigate(`/articles?channel=${id}`);
    } else {
      setSearchParams({ channel: id });
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span className="sidebar-title">openKMS</span>
        </div>
      </div>
      <nav className="sidebar-nav">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
          }
        >
          <LayoutDashboard size={18} strokeWidth={1.75} />
          <span>Dashboard</span>
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
          {onDocuments && (
            <div className="sidebar-subnav">
              <SidebarChannelTree
                channels={documentChannels[0]?.children ?? []}
                selectedId={docChannel}
                expanded={docExpanded}
                onSelect={setDocumentChannel}
                onToggle={(id) => setDocExpanded((p) => ({ ...p, [id]: !p[id] }))}
              />
            </div>
          )}
        </div>
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
          {onArticles && (
            <div className="sidebar-subnav">
              <SidebarChannelTree
                channels={articleChannels[0]?.children ?? []}
                selectedId={artChannel}
                expanded={artExpanded}
                onSelect={setArticleChannel}
                onToggle={(id) => setArtExpanded((p) => ({ ...p, [id]: !p[id] }))}
              />
            </div>
          )}
        </div>
        <NavLink
          to="/knowledge-bases"
          className={({ isActive }) =>
            `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
          }
        >
          <Database size={18} strokeWidth={1.75} />
          <span>Knowledge Bases</span>
        </NavLink>
      </nav>
    </aside>
  );
}
