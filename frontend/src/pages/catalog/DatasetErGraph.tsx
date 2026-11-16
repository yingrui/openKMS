import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './dataset-er-graph.scss';

export type ErGraphNode = {
  id: string;
  name: string;
  /** How many registered joins touch this dataset. */
  joins: number;
  /** Key / join columns shown inside the box, in table order. */
  columns?: string[];
};
export type ErGraphLink = {
  source: string;
  target: string;
  label: string;
  /** The join's target side is optional (`0..1`); a required join is `1..1`. */
  targetOptional?: boolean;
};

const BOX_WIDTH = 208;
const ROW_HEIGHT = 18;
const BOX_HEAD = 46;
const BOX_FOOT = 24;
const GAP_X = 80;
const GAP_Y = 64;
const PADDING = 24;
const MAX_COLUMNS = 6;
const DRAG_THRESHOLD = 4;

type Position = { x: number; y: number };

const boxHeight = (columns: number) =>
  BOX_HEAD + Math.min(columns, MAX_COLUMNS) * ROW_HEIGHT + BOX_FOOT;

/**
 * ER diagram of the catalog's datasets: one box per dataset with the columns its joins use, one line per
 * registered join, crow's foot on the many side. Boxes can be dragged — a catalog is read by looking at one
 * neighbourhood, so the reader decides the arrangement and it stays for the session.
 *
 * DOM + SVG rather than a canvas: every stroke and fill is a theme token (a canvas cannot read one, which is
 * why the previous graph's lines and boxes came out black).
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
  const { t } = useTranslation('ontology');
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const dragRef = useRef<{
    id: string;
    dx: number;
    dy: number;
    startX: number;
    startY: number;
  } | null>(null);
  /* Set while a drag actually moves the box, so the pointer-up click does not also open the dataset. */
  const movedRef = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  /* A grid until the reader moves something; the grid is deterministic so a catalog always opens the same way. */
  const grid = useMemo(() => {
    const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
    const out: Record<string, Position> = {};
    let y = PADDING;
    nodes.forEach((node, index) => {
      const column = index % columns;
      if (column === 0 && index > 0) {
        const previousRow = nodes.slice(index - columns, index);
        y += Math.max(...previousRow.map((n) => boxHeight(n.columns?.length ?? 0))) + GAP_Y;
      }
      out[node.id] = { x: PADDING + column * (BOX_WIDTH + GAP_X), y };
    });
    return out;
  }, [nodes]);

  useEffect(() => {
    setPositions(grid);
  }, [grid]);

  useEffect(() => {
    if (!dragRef.current) return;
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > DRAG_THRESHOLD) {
        movedRef.current = true;
      }
      if (!movedRef.current) return;
      setPositions((current) => ({
        ...current,
        [drag.id]: {
          x: Math.max(0, event.clientX - rect.left - drag.dx),
          y: Math.max(0, event.clientY - rect.top - drag.dy),
        },
      }));
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  if (nodes.length === 0) {
    return <p className="entity-view__readonly">{emptyLabel}</p>;
  }

  const startDrag = (event: React.PointerEvent, id: string) => {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    dragRef.current = {
      id,
      dx: event.clientX - box.left,
      dy: event.clientY - box.top,
      startX: event.clientX,
      startY: event.clientY,
    };
    movedRef.current = false;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const width = Math.max(
    ...nodes.map((node) => (positions[node.id]?.x ?? 0) + BOX_WIDTH),
  ) + PADDING;
  const height = Math.max(
    ...nodes.map((node) => (positions[node.id]?.y ?? 0) + boxHeight(node.columns?.length ?? 0)),
  ) + PADDING;

  const edges = links.flatMap((link) => {
    const from = positions[link.source];
    const to = positions[link.target];
    const fromNode = nodes.find((node) => node.id === link.source);
    const toNode = nodes.find((node) => node.id === link.target);
    if (!from || !to || !fromNode || !toNode) return [];
    return [
      {
        key: `${link.source}->${link.target}`,
        x1: from.x + BOX_WIDTH / 2,
        y1: from.y + boxHeight(fromNode.columns?.length ?? 0) / 2,
        x2: to.x + BOX_WIDTH / 2,
        y2: to.y + boxHeight(toNode.columns?.length ?? 0) / 2,
        label: link.label,
        targetOptional: link.targetOptional,
      },
    ];
  });

  return (
    <div className={`dataset-er-graph${fill ? ' dataset-er-graph--fill' : ''}`}>
      <div ref={canvasRef} className="dataset-er-graph__canvas" style={{ width, height }}>
        <svg className="dataset-er-graph__edges" width={width} height={height} aria-hidden>
          {edges.map((edge) => {
            const angle = Math.atan2(edge.y2 - edge.y1, edge.x2 - edge.x1);
            const foot = Array.from({ length: 3 }, (_, i) => {
              const spread = (i - 1) * 0.32;
              return {
                x: edge.x1 + Math.cos(angle + spread) * 12,
                y: edge.y1 + Math.sin(angle + spread) * 12,
              };
            });
            return (
              <g key={edge.key}>
                <line
                  className="dataset-er-graph__edge"
                  x1={edge.x1}
                  y1={edge.y1}
                  x2={edge.x2}
                  y2={edge.y2}
                />
                {/* many side: crow's foot */}
                {foot.map((point, i) => (
                  <line
                    key={i}
                    className="dataset-er-graph__edge-end"
                    x1={edge.x1}
                    y1={edge.y1}
                    x2={point.x}
                    y2={point.y}
                  />
                ))}
                {/* one side: a bar, dashed when the join is optional */}
                <line
                  className="dataset-er-graph__edge-end"
                  x1={edge.x2 - Math.cos(angle) * 8}
                  y1={edge.y2 - Math.sin(angle) * 8}
                  x2={edge.x2 - Math.cos(angle) * 8 + Math.cos(angle + Math.PI / 2) * 6}
                  y2={edge.y2 - Math.sin(angle) * 8 + Math.sin(angle + Math.PI / 2) * 6}
                />
                {edge.label ? (
                  <text
                    className="dataset-er-graph__edge-label"
                    x={(edge.x1 + edge.x2) / 2}
                    y={(edge.y1 + edge.y2) / 2 - 8}
                    textAnchor="middle"
                  >
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {nodes.map((node) => {
          const position = positions[node.id] ?? grid[node.id];
          const columns = (node.columns ?? []).slice(0, MAX_COLUMNS);
          return (
            <button
              key={node.id}
              type="button"
              className="dataset-er-graph__node"
              style={{
                left: position.x,
                top: position.y,
                width: BOX_WIDTH,
                height: boxHeight(node.columns?.length ?? 0),
              }}
              onPointerDown={(event) => startDrag(event, node.id)}
              onClick={() => {
                if (movedRef.current) {
                  movedRef.current = false;
                  return;
                }
                onOpen(node.id);
              }}
              title={node.name}
            >
              <span className="dataset-er-graph__node-name">{node.name}</span>
              <span className="dataset-er-graph__node-meta">
                {t('dataModel.erJoins', { count: node.joins })}
              </span>
              {columns.length > 0 ? (
                <span className="dataset-er-graph__node-columns">
                  {columns.map((column) => (
                    <span key={column} className="dataset-er-graph__node-column">
                      {column}
                    </span>
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
