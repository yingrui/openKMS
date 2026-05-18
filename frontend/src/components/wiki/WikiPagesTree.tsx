import { useCallback, useEffect, useMemo, useState, startTransition, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { ChevronDown, ChevronRight, FileText, Folder, Search, Sparkles, Type } from 'lucide-react';
import type { WikiPageListItem } from '../../data/wikiSpacesApi';
import { buildWikiTree, type WikiTreeNode } from './wikiTreeUtils';
import './WikiPagesTree.css';

function sortedChildEntries(node: WikiTreeNode): [string, WikiTreeNode][] {
  return [...node.children.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

const EMPTY_IDS = new Set<string>();

interface WikiPagesTreeProps {
  spaceId: string;
  pages: WikiPageListItem[];
  /** When omitted (e.g. graph tab), folder expand still works from prior navigation. */
  currentPageId?: string;
  loading?: boolean;
  filterText: string;
  onFilterTextChange: (value: string) => void;
  /** Title or path substring matches (server). */
  stringMatchIds?: ReadonlySet<string>;
  /** Embedding similarity matches (server). */
  semanticMatchIds?: ReadonlySet<string>;
  pageTreeMatchPending?: boolean;
}

export function WikiPagesTree({
  spaceId,
  pages,
  currentPageId,
  loading,
  filterText,
  onFilterTextChange,
  stringMatchIds,
  semanticMatchIds,
  pageTreeMatchPending,
}: WikiPagesTreeProps) {
  const { t } = useTranslation('explore');
  const root = useMemo(() => buildWikiTree(pages), [pages]);
  const [openPrefixes, setOpenPrefixes] = useState<Set<string>>(() => new Set());

  const stringSet = stringMatchIds ?? EMPTY_IDS;
  const semanticSet = semanticMatchIds ?? EMPTY_IDS;

  const apiMatchUnion = useMemo(() => {
    const u = new Set<string>();
    stringSet.forEach((id) => u.add(id));
    semanticSet.forEach((id) => u.add(id));
    return u;
  }, [stringSet, semanticSet]);

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
    if (!currentPageId) return;
    const cur = pages.find((p) => p.id === currentPageId);
    if (cur) {
      startTransition(() => expandAncestorsOf(cur.path));
    }
  }, [currentPageId, pages, expandAncestorsOf]);

  const togglePrefix = (prefix: string) => {
    setOpenPrefixes((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      return next;
    });
  };

  const filterLower = filterText.trim().toLowerCase();
  const filterLen2Plus = filterLower.length >= 2;
  const hasApiMatches = apiMatchUnion.size > 0;

  const nodeMatchesFilter = (n: WikiTreeNode): boolean => {
    if (!filterLower && !hasApiMatches) return true;
    if (n.page) {
      if (filterLower) {
        if (
          n.page.title.toLowerCase().includes(filterLower) ||
          n.pathPrefix.toLowerCase().includes(filterLower)
        ) {
          return true;
        }
      }
      if (hasApiMatches && apiMatchUnion.has(n.page.id)) return true;
    }
    for (const [, child] of n.children) {
      if (nodeMatchesFilter(child)) return true;
    }
    return false;
  };

  const renderMatchBadges = (pageId: string): ReactNode => {
    if (!filterLen2Plus) return null;
    const s = stringSet.has(pageId);
    const m = semanticSet.has(pageId);
    if (!s && !m) return null;
    return (
      <span className="wiki-pages-tree-match-badges">
        {s ? (
          <span className="wiki-pages-tree-match-badge wiki-pages-tree-match-badge--string" title={t('wiki.workspace.pageTreeBadgeString')}>
            <Type size={11} strokeWidth={2.25} aria-hidden />
            <span className="sr-only">{t('wiki.workspace.pageTreeBadgeString')}</span>
          </span>
        ) : null}
        {m ? (
          <span className="wiki-pages-tree-match-badge wiki-pages-tree-match-badge--semantic" title={t('wiki.workspace.pageTreeBadgeSemantic')}>
            <Sparkles size={11} strokeWidth={2.25} aria-hidden />
            <span className="sr-only">{t('wiki.workspace.pageTreeBadgeSemantic')}</span>
          </span>
        ) : null}
      </span>
    );
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
              <span className="wiki-pages-tree-link-inner">
                <span className="wiki-pages-tree-label">{node.segment}</span>
                {renderMatchBadges(node.page.id)}
              </span>
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
      <div className="wiki-pages-tree-search">
        <Search size={15} className="wiki-pages-tree-search-icon" aria-hidden />
        <input
          type="search"
          placeholder={t('wiki.workspace.pageTreeFilterPlaceholder')}
          value={filterText}
          onChange={(e) => onFilterTextChange(e.target.value)}
          aria-label={t('wiki.workspace.pageTreeFilterAria')}
          disabled={loading}
        />
      </div>
      <div className="wiki-pages-tree-scroll">
        {loading ? (
          <p className="wiki-pages-tree-muted">Loading…</p>
        ) : (
          <>
            {pageTreeMatchPending && filterLen2Plus ? (
              <p className="wiki-pages-tree-muted wiki-pages-tree-semantic-hint" role="status">
                {t('wiki.workspace.pageTreeMatchSearching')}
              </p>
            ) : null}
            {renderNode(root, 0)}
          </>
        )}
      </div>
    </aside>
  );
}
