import { NavLink, useLocation, useSearchParams } from 'react-router-dom';
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
    <ul className="sidebar-channel-tree" style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
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
                <ChevronRight size={14} className={expanded[ch.id] ? 'expanded' : ''} />
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
                <FolderOpen size={16} />
              ) : (
                <Folder size={16} />
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
  const [searchParams, setSearchParams] = useSearchParams();
  const onDocuments = location.pathname === '/documents';
  const onArticles = location.pathname === '/articles';

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
    setSearchParams({ channel: id });
  };
  const setArticleChannel = (id: string) => {
    setSearchParams({ channel: id });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
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
          <LayoutDashboard size={20} strokeWidth={1.75} />
          <span>Dashboard</span>
        </NavLink>
        <div className="sidebar-menu-group">
          <NavLink
            to="/documents"
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
            }
          >
            <FileStack size={20} strokeWidth={1.75} />
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
            <FileText size={20} strokeWidth={1.75} />
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
          <Database size={20} strokeWidth={1.75} />
          <span>Knowledge Bases</span>
        </NavLink>
      </nav>
    </aside>
  );
}
