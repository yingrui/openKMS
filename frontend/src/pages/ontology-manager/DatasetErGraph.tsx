import { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import './dataset-er-graph.scss';

export type ErGraphNode = { id: string; name: string; joins: number };
export type ErGraphLink = { source: string; target: string; label: string };

/** Space kept below a `fill` graph so it does not butt against the viewport edge. */
const BOTTOM_GAP = 24;

/**
 * Force-directed ER graph: datasets are nodes, registered joins are directed edges.
 * Reuses `react-force-graph-2d` (already a dependency, used by Object Explorer).
 */
export function DatasetErGraph({
  nodes,
  links,
  onOpen,
  emptyLabel,
  fill = false,
}: {
  nodes: ErGraphNode[];
  links: ErGraphLink[];
  onOpen: (id: string) => void;
  emptyLabel: string;
  /** Fill the viewport below the graph (auto-adjusting to the page chrome). */
  fill?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      // `fill` → height is the space left in the viewport below the graph's top,
      // so it reaches the bottom no matter the header/tabs/toolbar height.
      const height = fill
        ? Math.max(320, window.innerHeight - el.getBoundingClientRect().top - BOTTOM_GAP)
        : el.clientHeight;
      setSize({ width, height });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [fill]);

  if (nodes.length === 0) {
    return <p className="entity-view__readonly">{emptyLabel}</p>;
  }

  return (
    <div
      ref={wrapRef}
      className={`dataset-er-graph${fill ? ' dataset-er-graph--fill' : ''}`}
    >
      {size.width > 0 && size.height > 0 && (
        <ForceGraph2D
          graphData={{ nodes, links }}
          width={size.width}
          height={size.height}
          nodeLabel="name"
          linkLabel="label"
          linkDirectionalArrowLength={6}
          linkCurvature={0.15}
          linkColor={() => 'var(--color-text-muted)'}
          onNodeClick={(node) => onOpen((node as ErGraphNode).id)}
          cooldownTicks={120}
        />
      )}
    </div>
  );
}
