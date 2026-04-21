import { useCallback, useLayoutEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Link2 } from 'lucide-react';
import type { KnowledgeMapNode } from '../data/knowledgeMapApi';
import './HomeKnowledgeMapPreview.css';

/** Every node id that has children — used for “expand all” and as the default on load. */
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

function KnowledgeMapPreviewRow({
  node,
  depth,
  expanded,
  onToggle,
}: {
  node: KnowledgeMapNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
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
            <ChevronRight size={16} className={isOpen ? 'home-knowledge-map-chevron home-knowledge-map-chevron--open' : 'home-knowledge-map-chevron'} aria-hidden />
          </button>
        ) : (
          <span className="home-knowledge-map-tree-toggle home-knowledge-map-tree-toggle--spacer" aria-hidden />
        )}
        <Link to={`/knowledge-map?node=${encodeURIComponent(node.id)}`} className="home-knowledge-map-tree-link">
          <span className="home-knowledge-map-tree-name">{node.name}</span>
          {node.link_count > 0 && (
            <span className="home-knowledge-map-tree-badge" title="Refer-tos to channels or wiki spaces">
              <Link2 size={12} aria-hidden />
              {node.link_count}
            </span>
          )}
        </Link>
      </div>
      {hasChildren && isOpen && (
        <ul className="home-knowledge-map-tree-children" role="group">
          {node.children!.map((ch) => (
            <KnowledgeMapPreviewRow key={ch.id} node={ch} depth={depth + 1} expanded={expanded} onToggle={onToggle} />
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
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useLayoutEffect(() => {
    if (!tree?.length) {
      setExpanded(new Set());
      return;
    }
    setExpanded(collectExpandableNodeIds(tree));
  }, [tree]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!tree?.length) return;
    setExpanded(collectExpandableNodeIds(tree));
  }, [tree]);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  return (
    <div className="home-knowledge-map-preview">
      <div className="home-knowledge-map-preview-toolbar">
        <div className="home-knowledge-map-preview-stats">
          {nodeCount != null && linkCount != null ? (
            <span className="home-muted">
              {nodeCount} term{nodeCount === 1 ? '' : 's'} · {linkCount} refer-to{linkCount === 1 ? '' : 's'}
            </span>
          ) : summaryLoading ? (
            <span className="home-muted">Loading summary…</span>
          ) : (
            <span className="home-muted">Summary unavailable.</span>
          )}
        </div>
        {tree && tree.length > 0 && (
          <div className="home-knowledge-map-preview-toolbar-actions">
            <button type="button" className="home-knowledge-map-tool-btn" onClick={expandAll}>
              Expand all
            </button>
            <button type="button" className="home-knowledge-map-tool-btn" onClick={collapseAll}>
              Collapse all
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="home-error home-knowledge-map-preview-error" role="alert">
          {error}
        </p>
      )}

      <div className="home-knowledge-map-tree-scroll" aria-label="Knowledge Map preview">
        {treeLoading && !tree?.length ? (
          <p className="home-muted home-knowledge-map-tree-placeholder">Loading tree…</p>
        ) : !tree?.length ? (
          <p className="home-muted home-knowledge-map-tree-placeholder">
            No terms yet. Add them on the Knowledge Map page.
          </p>
        ) : (
          <ul className="home-knowledge-map-tree-root" role="tree">
            {tree.map((n) => (
              <KnowledgeMapPreviewRow key={n.id} node={n} depth={0} expanded={expanded} onToggle={toggle} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
