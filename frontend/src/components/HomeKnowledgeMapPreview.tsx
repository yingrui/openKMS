import { useCallback, useDeferredValue, useLayoutEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Link2, Search, X } from 'lucide-react';
import type { KnowledgeMapNode } from '../data/knowledgeMapApi';
import './HomeKnowledgeMapPreview.css';

/** Every node id that has children — used for “expand all” and when syncing expand state to the visible tree. */
function collectExpandableNodeIds(nodes: KnowledgeMapNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (ns: KnowledgeMapNode[]) => {
    for (const n of ns) {
      if (n.children?.length) {
        ids.add(n.id);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return ids;
}

function filterKnowledgeMapTree(nodes: KnowledgeMapNode[], q: string): KnowledgeMapNode[] {
  const t = q.trim().toLowerCase();
  if (!t) return nodes;
  const out: KnowledgeMapNode[] = [];
  for (const n of nodes) {
    const selfMatch = n.name.toLowerCase().includes(t);
    const childFiltered = n.children?.length ? filterKnowledgeMapTree(n.children, q) : [];
    if (selfMatch) {
      out.push({ ...n, children: n.children ?? [] });
    } else if (childFiltered.length) {
      out.push({ ...n, children: childFiltered });
    }
  }
  return out;
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  const t = query.trim();
  if (!t) return <>{name}</>;
  const lower = name.toLowerCase();
  const idx = lower.indexOf(t.toLowerCase());
  if (idx < 0) return <>{name}</>;
  return (
    <>
      {name.slice(0, idx)}
      <mark className="home-km-search-hit">{name.slice(idx, idx + t.length)}</mark>
      {name.slice(idx + t.length)}
    </>
  );
}

function KnowledgeMapPreviewRow({
  node,
  depth,
  expanded,
  onToggle,
  searchQuery,
}: {
  node: KnowledgeMapNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  searchQuery: string;
}) {
  const hasChildren = Boolean(node.children?.length);
  const isOpen = expanded.has(node.id);

  return (
    <li className="home-knowledge-map-tree-item" role="treeitem" aria-expanded={hasChildren ? isOpen : undefined}>
      <div
        className="home-knowledge-map-tree-row"
        style={{ ['--home-knowledge-map-depth' as string]: String(depth) }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="home-knowledge-map-tree-toggle"
            aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle(node.id);
            }}
          >
            <ChevronRight
              size={16}
              className={isOpen ? 'home-knowledge-map-chevron home-knowledge-map-chevron--open' : 'home-knowledge-map-chevron'}
              aria-hidden
            />
          </button>
        ) : (
          <span className="home-knowledge-map-tree-toggle home-knowledge-map-tree-toggle--spacer" aria-hidden />
        )}
        <Link to={`/knowledge-map?node=${encodeURIComponent(node.id)}`} className="home-knowledge-map-tree-link">
          <span className="home-knowledge-map-tree-name">
            <HighlightedName name={node.name} query={searchQuery} />
          </span>
          {node.link_count > 0 && (
            <span className="home-knowledge-map-tree-badge" title="Linked channels or wiki spaces">
              <Link2 size={12} aria-hidden />
              {node.link_count}
            </span>
          )}
        </Link>
      </div>
      {hasChildren && isOpen && (
        <ul className="home-knowledge-map-tree-children" role="group">
          {node.children!.map((ch) => (
            <KnowledgeMapPreviewRow
              key={ch.id}
              node={ch}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              searchQuery={searchQuery}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function HomeKnowledgeMapPreview({
  tree,
  treeLoading,
  summaryLoading,
  error,
  nodeCount,
  linkCount,
}: {
  tree: KnowledgeMapNode[] | null;
  treeLoading: boolean;
  summaryLoading: boolean;
  error: string | null;
  nodeCount: number | null;
  linkCount: number | null;
}) {
  const [searchRaw, setSearchRaw] = useState('');
  const deferredSearch = useDeferredValue(searchRaw);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const displayTree = useMemo(
    () => filterKnowledgeMapTree(tree ?? [], deferredSearch),
    [tree, deferredSearch],
  );

  useLayoutEffect(() => {
    if (!tree?.length) {
      setExpanded(new Set());
      return;
    }
    setExpanded(collectExpandableNodeIds(displayTree.length ? displayTree : tree));
  }, [tree, displayTree]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!displayTree?.length) return;
    setExpanded(collectExpandableNodeIds(displayTree));
  }, [displayTree]);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  const clearSearch = useCallback(() => setSearchRaw(''), []);

  const searchActive = deferredSearch.trim().length > 0;
  const noSearchHits = Boolean(tree?.length && searchActive && displayTree.length === 0);

  return (
    <div className="home-knowledge-map-preview">
      <div className="home-km-hero">
        <div className="home-km-stats" aria-live="polite">
          {nodeCount != null && linkCount != null ? (
            <>
              <span className="home-km-stat">
                <span className="home-km-stat-value">{nodeCount}</span>
                <span className="home-km-stat-label">nodes</span>
              </span>
              <span className="home-km-stat-divider" aria-hidden />
              <span className="home-km-stat">
                <span className="home-km-stat-value">{linkCount}</span>
                <span className="home-km-stat-label">links</span>
              </span>
            </>
          ) : summaryLoading ? (
            <span className="home-km-stats-muted">Loading overview…</span>
          ) : (
            <span className="home-km-stats-muted">Overview unavailable</span>
          )}
        </div>

        <label className="home-km-search">
          <Search className="home-km-search-icon" size={18} aria-hidden />
          <input
            type="search"
            className="home-km-search-input"
            placeholder="Find a topic in the map…"
            value={searchRaw}
            onChange={(e) => setSearchRaw(e.target.value)}
            aria-label="Filter Knowledge Map by name"
            autoComplete="off"
            spellCheck={false}
          />
          {searchRaw ? (
            <button type="button" className="home-km-search-clear" onClick={clearSearch} aria-label="Clear search">
              <X size={16} />
            </button>
          ) : null}
        </label>

        {tree && tree.length > 0 ? (
          <div className="home-km-toolbar-actions">
            <button type="button" className="home-km-tool-btn" onClick={expandAll}>
              Expand all
            </button>
            <button type="button" className="home-km-tool-btn" onClick={collapseAll}>
              Collapse all
            </button>
          </div>
        ) : null}
      </div>

      {error && (
        <p className="home-error home-knowledge-map-preview-error" role="alert">
          {error}
        </p>
      )}

      <div className="home-knowledge-map-tree-scroll" aria-label="Knowledge Map preview">
        {treeLoading && !tree?.length ? (
          <div className="home-km-placeholder">
            <div className="home-km-skeleton home-km-skeleton--title" />
            <div className="home-km-skeleton" />
            <div className="home-km-skeleton home-km-skeleton--short" />
            <div className="home-km-skeleton" />
          </div>
        ) : !tree?.length ? (
          <div className="home-km-placeholder home-km-placeholder--empty">
            <p className="home-km-placeholder-title">Your map is empty</p>
            <p className="home-muted">Add nodes on the Knowledge Map page to see them here and link them to channels.</p>
          </div>
        ) : noSearchHits ? (
          <div className="home-km-placeholder home-km-placeholder--empty">
            <p className="home-km-placeholder-title">No matches</p>
            <p className="home-muted">Nothing in the map matches “{deferredSearch.trim()}”. Try another word or clear the search.</p>
            <button type="button" className="home-km-linkish" onClick={clearSearch}>
              Clear search
            </button>
          </div>
        ) : (
          <ul className="home-knowledge-map-tree-root" role="tree">
            {displayTree.map((n) => (
              <KnowledgeMapPreviewRow
                key={n.id}
                node={n}
                depth={0}
                expanded={expanded}
                onToggle={toggle}
                searchQuery={deferredSearch}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
