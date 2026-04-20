import { useCallback, useLayoutEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Link2 } from 'lucide-react';
import type { TaxonomyNode } from '../data/taxonomyApi';
import './HomeTaxonomyPreview.css';

/** Every node id that has children — used for “expand all” and as the default on load. */
function collectExpandableNodeIds(nodes: TaxonomyNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (ns: TaxonomyNode[]) => {
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

function TaxonomyPreviewRow({
  node,
  depth,
  expanded,
  onToggle,
}: {
  node: TaxonomyNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const hasChildren = Boolean(node.children?.length);
  const isOpen = expanded.has(node.id);

  return (
    <li className="home-taxonomy-tree-item" role="treeitem" aria-expanded={hasChildren ? isOpen : undefined}>
      <div
        className="home-taxonomy-tree-row"
        style={{ ['--home-tax-depth' as string]: String(depth) }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="home-taxonomy-tree-toggle"
            aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle(node.id);
            }}
          >
            <ChevronRight size={16} className={isOpen ? 'home-taxonomy-chevron home-taxonomy-chevron--open' : 'home-taxonomy-chevron'} aria-hidden />
          </button>
        ) : (
          <span className="home-taxonomy-tree-toggle home-taxonomy-tree-toggle--spacer" aria-hidden />
        )}
        <Link to={`/taxonomy?node=${encodeURIComponent(node.id)}`} className="home-taxonomy-tree-link">
          <span className="home-taxonomy-tree-name">{node.name}</span>
          {node.link_count > 0 && (
            <span className="home-taxonomy-tree-badge" title="Refer-tos to channels or wiki spaces">
              <Link2 size={12} aria-hidden />
              {node.link_count}
            </span>
          )}
        </Link>
      </div>
      {hasChildren && isOpen && (
        <ul className="home-taxonomy-tree-children" role="group">
          {node.children!.map((ch) => (
            <TaxonomyPreviewRow key={ch.id} node={ch} depth={depth + 1} expanded={expanded} onToggle={onToggle} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function HomeTaxonomyPreview({
  tree,
  treeLoading,
  summaryLoading,
  error,
  nodeCount,
  linkCount,
}: {
  tree: TaxonomyNode[] | null;
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
    <div className="home-taxonomy-preview">
      <div className="home-taxonomy-preview-toolbar">
        <div className="home-taxonomy-preview-stats">
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
          <div className="home-taxonomy-preview-toolbar-actions">
            <button type="button" className="home-taxonomy-tool-btn" onClick={expandAll}>
              Expand all
            </button>
            <button type="button" className="home-taxonomy-tool-btn" onClick={collapseAll}>
              Collapse all
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="home-error home-taxonomy-preview-error" role="alert">
          {error}
        </p>
      )}

      <div className="home-taxonomy-tree-scroll" aria-label="Taxonomy terms preview">
        {treeLoading && !tree?.length ? (
          <p className="home-muted home-taxonomy-tree-placeholder">Loading tree…</p>
        ) : !tree?.length ? (
          <p className="home-muted home-taxonomy-tree-placeholder">No taxonomy terms yet. Add terms on the taxonomy page.</p>
        ) : (
          <ul className="home-taxonomy-tree-root" role="tree">
            {tree.map((n) => (
              <TaxonomyPreviewRow key={n.id} node={n} depth={0} expanded={expanded} onToggle={toggle} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
