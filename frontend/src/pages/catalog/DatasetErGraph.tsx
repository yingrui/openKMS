import { useMemo } from 'react';
import './dataset-er-graph.scss';

export type ErGraphNode = { id: string; name: string; joins: number };
export type ErGraphLink = { source: string; target: string; label: string };

/** Box metrics: one dataset is one box, edges are drawn between box centres. */
const BOX_WIDTH = 188;
const BOX_HEIGHT = 64;
const GAP_X = 72;
const GAP_Y = 56;
const PADDING = 24;

/**
 * ER diagram of the catalog's datasets: one box per dataset (name + how many joins it carries), one line per
 * registered join. Deterministic layout, drawn with DOM + SVG so every stroke and fill is a theme token —
 * a canvas graph cannot read CSS variables, which is why its lines and labels came out black.
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
  /** Let the diagram claim the page's remaining height instead of a fixed box. */
  fill?: boolean;
}) {
  const { boxes, width, height } = useMemo(() => {
    const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
    const byId = new Map<string, { x: number; y: number }>();
    nodes.forEach((node, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      byId.set(node.id, {
        x: PADDING + column * (BOX_WIDTH + GAP_X),
        y: PADDING + row * (BOX_HEIGHT + GAP_Y),
      });
    });
    const rows = Math.ceil(nodes.length / columns);
    return {
      boxes: nodes.map((node) => ({ node, ...byId.get(node.id)! })),
      byId,
      width: PADDING * 2 + columns * BOX_WIDTH + (columns - 1) * GAP_X,
      height: PADDING * 2 + rows * BOX_HEIGHT + (rows - 1) * GAP_Y,
    } as { boxes: { node: ErGraphNode; x: number; y: number }[]; width: number; height: number };
  }, [nodes]);

  if (nodes.length === 0) {
    return <p className="entity-view__readonly">{emptyLabel}</p>;
  }

  const positions = new Map(boxes.map((box) => [box.node.id, box]));
  const edges = links.flatMap((link) => {
    const from = positions.get(link.source);
    const to = positions.get(link.target);
    if (!from || !to) return [];
    return [
      {
        key: `${link.source}->${link.target}`,
        x1: from.x + BOX_WIDTH / 2,
        y1: from.y + BOX_HEIGHT / 2,
        x2: to.x + BOX_WIDTH / 2,
        y2: to.y + BOX_HEIGHT / 2,
        label: link.label,
      },
    ];
  });

  return (
    <div className={`dataset-er-graph${fill ? ' dataset-er-graph--fill' : ''}`}>
      <div className="dataset-er-graph__canvas" style={{ width, height }}>
        <svg className="dataset-er-graph__edges" width={width} height={height} aria-hidden>
          {edges.map((edge) => (
            <g key={edge.key}>
              <line
                className="dataset-er-graph__edge"
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
              />
              <circle className="dataset-er-graph__edge-end" cx={edge.x2} cy={edge.y2} r={3} />
            </g>
          ))}
        </svg>
        {boxes.map((box) => (
          <button
            key={box.node.id}
            type="button"
            className="dataset-er-graph__node"
            style={{ left: box.x, top: box.y, width: BOX_WIDTH, height: BOX_HEIGHT }}
            onClick={() => onOpen(box.node.id)}
            title={box.node.name}
          >
            <span className="dataset-er-graph__node-name">{box.node.name}</span>
            <span className="dataset-er-graph__node-meta">{box.node.joins}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
