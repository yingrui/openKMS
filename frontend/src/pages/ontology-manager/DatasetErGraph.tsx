import { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import './dataset-er-graph.scss';

export type ErGraphNode = { id: string; name: string; joins: number };
export type ErGraphLink = { source: string; target: string; label: string };

/**
 * Force-directed ER graph: datasets are nodes, registered joins are directed edges.
 * Reuses `react-force-graph-2d` (already a dependency, used by Object Explorer).
 */
export function DatasetErGraph({
  nodes,
  links,
  onOpen,
  emptyLabel,
}: {
  nodes: ErGraphNode[];
  links: ErGraphLink[];
  onOpen: (id: string) => void;
  emptyLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  if (nodes.length === 0) {
    return <p className="entity-view__readonly">{emptyLabel}</p>;
  }

  return (
    <div ref={wrapRef} className="dataset-er-graph">
      {width > 0 && (
        <ForceGraph2D
          graphData={{ nodes, links }}
          width={width}
          height={460}
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
