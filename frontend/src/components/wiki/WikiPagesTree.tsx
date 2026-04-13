import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown, ChevronRight, FileText, Folder, Search } from 'lucide-react';
import type { WikiPageResponse } from '../../data/wikiSpacesApi';
import './WikiPagesTree.css';

export interface WikiTreeNode {
  segment: string;
  pathPrefix: string;
  page: WikiPageResponse | undefined;
  children: Map<string, WikiTreeNode>;
}

export function buildWikiTree(pages: WikiPageResponse[]): WikiTreeNode {
  const root: WikiTreeNode = {
    segment: '',
    pathPrefix: '',
    page: undefined,
    children: new Map(),
  };
  for (const p of pages) {
    const parts = p.path.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    let cur = root;
    let prefix = '';
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i];
      prefix = prefix ? `${prefix}/${seg}` : seg;
      if (!cur.children.has(seg)) {
        cur.children.set(seg, {
          segment: seg,
          pathPrefix: prefix,
          page: undefined,
          children: new Map(),
        });
      }
      cur = cur.children.get(seg)!;
      if (i === parts.length - 1) {
        cur.page = p;
      }
    }
  }
  return root;
}

function sortedChildEntries(node: WikiTreeNode): [string, WikiTreeNode][] {
  return [...node.children.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

interface WikiPagesTreeProps {
  spaceId: string;
  pages: WikiPageResponse[];
  currentPageId: string;
  loading?: boolean;
}

export function WikiPagesTree({ spaceId, pages, currentPageId, loading }: WikiPagesTreeProps) {
  const root = useMemo(() => buildWikiTree(pages), [pages]);
  const [openPrefixes, setOpenPrefixes] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState('');

  const expandAncestorsOf = useCallback((pagePath: string) => {
    const parts = pagePath.split('/').filter(Boolean);
    if (parts.length <= 1) return;
    setOpenPrefixes((prev) => {
      const next = new Set(prev);
      let prefix = '';
      for (let i = 0; i < parts.length - 1; i++) {
        prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
        next.add(prefix);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const cur = pages.find((p) => p.id === currentPageId);
    if (cur) expandAncestorsOf(cur.path);
  }, [currentPageId, pages, expandAncestorsOf]);

  const togglePrefix = (prefix: string) => {
    setOpenPrefixes((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      return next;
    });
  };

  const filterLower = filter.trim().toLowerCase();
  const nodeMatchesFilter = (n: WikiTreeNode): boolean => {
    if (!filterLower) return true;
    if (n.page && (n.page.title.toLowerCase().includes(filterLower) || n.pathPrefix.toLowerCase().includes(filterLower))) {
      return true;
    }
    for (const [, child] of n.children) {
      if (nodeMatchesFilter(child)) return true;
    }
    return false;
  };

  const renderNode = (node: WikiTreeNode, depth: number): ReactNode => {
    if (node.segment === '' && node.children.size === 0) {
      return <p className="wiki-pages-tree-empty">No pages in this space.</p>;
    }
    if (node.segment === '') {
      return <>{sortedChildEntries(node).map(([, child]) => renderNode(child, depth))}</>;
    }

    if (!nodeMatchesFilter(node)) return null;

    const hasKids = node.children.size > 0;
    const isOpen = openPrefixes.has(node.pathPrefix);

    return (
      <div key={node.pathPrefix} className="wiki-pages-tree-node">
        <div
          className={`wiki-pages-tree-row wiki-pages-tree-row--depth-${Math.min(depth, 8)}`}
          style={{ paddingLeft: `${10 + depth * 14}px` }}
        >
          {hasKids ? (
            <button
              type="button"
              className="wiki-pages-tree-chevron"
              aria-expanded={isOpen}
              aria-label={isOpen ? 'Collapse' : 'Expand'}
              onClick={() => togglePrefix(node.pathPrefix)}
            >
              {isOpen ? <ChevronDown size={16} strokeWidth={2} /> : <ChevronRight size={16} strokeWidth={2} />}
            </button>
          ) : (
            <span className="wiki-pages-tree-chevron-placeholder" aria-hidden />
          )}
          {hasKids ? (
            <Folder size={15} className="wiki-pages-tree-icon wiki-pages-tree-icon-folder" strokeWidth={2} />
          ) : (
            <FileText size={15} className="wiki-pages-tree-icon wiki-pages-tree-icon-file" strokeWidth={2} />
          )}
          {node.page ? (
            <NavLink
              to={`/wikis/${spaceId}/pages/${node.page.id}`}
              className={({ isActive: navActive }) =>
                `wiki-pages-tree-link${navActive ? ' wiki-pages-tree-link-active' : ''}`
              }
              title={node.pathPrefix}
            >
              <span className="wiki-pages-tree-label">{node.segment}</span>
            </NavLink>
          ) : (
            <span className="wiki-pages-tree-folder-label" title={node.pathPrefix}>
              {node.segment}
            </span>
          )}
        </div>
        {hasKids && isOpen ? (
          <div className="wiki-pages-tree-children">
            {sortedChildEntries(node).map(([, child]) => renderNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <aside className="wiki-pages-tree" aria-label="Pages in this wiki space">
      <div className="wiki-pages-tree-toolbar">
        <span className="wiki-pages-tree-title">Pages</span>
      </div>
      <div className="wiki-pages-tree-search">
        <Search size={15} className="wiki-pages-tree-search-icon" aria-hidden />
        <input
          type="search"
          placeholder="Filter pages…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter pages"
        />
      </div>
      <div className="wiki-pages-tree-scroll">
        {loading ? (
          <p className="wiki-pages-tree-muted">Loading…</p>
        ) : (
          renderNode(root, 0)
        )}
      </div>
    </aside>
  );
}
