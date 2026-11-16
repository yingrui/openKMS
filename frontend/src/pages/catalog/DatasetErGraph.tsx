import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  RotateCcw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { layoutEr } from './erLayout';
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
  /** The columns the join is written on — the line runs field to field, not box to box. */
  fromColumn?: string;
  toColumn?: string;
  /** A required join draws a solid line; an optional one dashes it. */
  required?: boolean;
};

const BOX_WIDTH = 208;
const ROW_HEIGHT = 18;
const BOX_HEAD = 46;
const BOX_FOOT = 24;
const GAP_X = 80;
const GAP_Y = 64;
const PADDING = 24;
const MAX_COLUMNS = 6;
/** A collapsed box: the dataset's name only, so the picture becomes the logical view of who joins whom. */
const COLLAPSED_HEIGHT = 40;
const DRAG_THRESHOLD = 4;
const ROW_HEIGHT_ESTIMATE = ROW_HEIGHT;

type Position = { x: number; y: number };

const boxHeight = (columns: number) =>
  BOX_HEAD + Math.min(columns, MAX_COLUMNS) * ROW_HEIGHT + BOX_FOOT;

const boxHeightFor = (node: { columns?: string[] }, collapsed: boolean) =>
  collapsed ? COLLAPSED_HEIGHT : boxHeight(node.columns?.length ?? 0);

/**
 * The y of a column's row inside a box. Measured from the DOM when the row has rendered — the head is a name, a
 * count and a gap whose heights come from the type scale, so arithmetic on constants drifts by a few pixels and
 * the lines land between rows. The estimate is only the first frame's answer.
 */
const columnAnchorY = (
  top: number,
  height: number,
  node: ErGraphNode,
  column: string | undefined,
  rowOffsets: Record<string, Record<string, number>>,
) => {
  /* A collapsed box shows no rows, so there is no row to point at — its middle is the honest answer. */
  if (height <= COLLAPSED_HEIGHT) return top + height / 2;
  const measured = column ? rowOffsets[node.id]?.[column] : undefined;
  if (measured !== undefined) return top + measured;
  const index = column ? (node.columns ?? []).indexOf(column) : -1;
  if (index < 0 || index >= MAX_COLUMNS) return top + height / 2;
  return top + BOX_HEAD + index * ROW_HEIGHT_ESTIMATE + ROW_HEIGHT_ESTIMATE / 2;
};

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
  /* Set once a drag actually moves the box; a pointer-down that never moves does not rearrange anything. */
  const movedRef = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [rowOffsets, setRowOffsets] = useState<Record<string, Record<string, number>>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () =>
      setSize({
        width: el.clientWidth,
        /* `fill` → the space left in the viewport below the diagram, so it reaches the page's bottom edge. */
        height: fill
          ? Math.max(320, window.innerHeight - el.getBoundingClientRect().top - 24)
          : el.clientHeight,
      });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [fill]);

  /* Relationships decide the arrangement: a dataset that owns the key sits under the one it points at, so the
     picture reads top-down along the joins. The reader can still drag any box away from it. */
  const layout = useMemo(
    () =>
      layoutEr(nodes, links, {
        boxWidth: BOX_WIDTH,
        gapX: GAP_X,
        gapY: GAP_Y,
        padding: PADDING,
        height: (node) => boxHeightFor(node, collapsed.has(node.id)),
      }),
    [nodes, links, collapsed],
  );
  const grid = layout.positions;

  useEffect(() => {
    setPositions(grid);
  }, [grid]);

  /* Row centres relative to each box's top, so an edge meets its field rather than the space next to it. */
  useEffect(() => {
    const next: Record<string, Record<string, number>> = {};
    for (const [id, element] of nodeRefs.current) {
      const rows: Record<string, number> = {};
      element.querySelectorAll<HTMLElement>('[data-column]').forEach((row) => {
        const name = row.dataset.column;
        if (name) rows[name] = row.offsetTop + row.offsetHeight / 2;
      });
      next[id] = rows;
    }
    setRowOffsets((current) =>
      JSON.stringify(current) === JSON.stringify(next) ? current : next,
    );
  });

  useEffect(() => {
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
          x: Math.min(
            Math.max(0, event.clientX - rect.left - drag.dx),
            Math.max(0, rect.width - BOX_WIDTH),
          ),
          y: Math.min(
            Math.max(0, event.clientY - rect.top - drag.dy),
            Math.max(0, rect.height - BOX_HEAD - BOX_FOOT),
          ),
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

  /* Hovering a box is the question the diagram is asked most: "what does this one touch?" */
  const connected = useMemo(() => {
    if (!hovered) return null;
    const ids = new Set<string>([hovered]);
    for (const link of links) {
      if (link.source === hovered) ids.add(link.target);
      if (link.target === hovered) ids.add(link.source);
    }
    return ids;
  }, [hovered, links]);

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
  };

  const contentWidth =
    Math.max(...nodes.map((node) => (positions[node.id]?.x ?? 0) + BOX_WIDTH)) + PADDING;
  const contentHeight =
    Math.max(
      ...nodes.map(
        (node) => (positions[node.id]?.y ?? 0) + boxHeightFor(node, collapsed.has(node.id)),
      ),
    ) + PADDING;
  const width = Math.max(contentWidth, size.width);
  const height = Math.max(contentHeight, size.height);

  const collapsible = nodes.filter((node) => (node.columns?.length ?? 0) > 0).map((node) => node.id);

  const edges = links.flatMap((link) => {
    const from = positions[link.source];
    const to = positions[link.target];
    const fromNode = nodes.find((node) => node.id === link.source);
    const toNode = nodes.find((node) => node.id === link.target);
    if (!from || !to || !fromNode || !toNode) return [];
    /* Leave the box at the row's edge, so the line reads as leaving that field rather than the box's centre. */
    const fromHeight = boxHeightFor(fromNode, collapsed.has(fromNode.id));
    const toHeight = boxHeightFor(toNode, collapsed.has(toNode.id));
    const fromY = columnAnchorY(from.y, fromHeight, fromNode, link.fromColumn, rowOffsets);
    const toY = columnAnchorY(to.y, toHeight, toNode, link.toColumn, rowOffsets);
    const toLeft = to.x + BOX_WIDTH / 2 < from.x + BOX_WIDTH / 2;
    return [
      {
        key: `${link.source}-${link.fromColumn ?? ''}->${link.target}-${link.toColumn ?? ''}`,
        x1: toLeft ? from.x : from.x + BOX_WIDTH,
        y1: fromY,
        x2: toLeft ? to.x + BOX_WIDTH : to.x,
        y2: toY,
        /* Horizontal control points: the line leaves the row and enters the other row level, so it reads as
           field → field rather than box → box. */
        direction: toLeft ? -1 : 1,
        required: link.required !== false,
        dimmed: connected !== null && !(link.source === hovered || link.target === hovered),
      },
    ];
  });

  return (
    <div ref={wrapRef} className={`dataset-er-graph${fill ? ' dataset-er-graph--fill' : ''}`}>
      <div className="dataset-er-graph__toolbar" role="group" aria-label={t('dataModel.erToolbar')}>
        <button
          type="button"
          className="dataset-er-graph__tool"
          onClick={() =>
            setCollapsed((current) =>
              current.size === collapsible.length
                ? new Set<string>()
                : new Set<string>(collapsible),
            )
          }
        >
          {collapsed.size === collapsible.length ? (
            <ChevronsDownUp size={14} aria-hidden />
          ) : (
            <ChevronsUpDown size={14} aria-hidden />
          )}
          <span>
            {collapsed.size === collapsible.length
              ? t('dataModel.erExpandAll')
              : t('dataModel.erCollapseAll')}
          </span>
        </button>
        <button
          type="button"
          className="dataset-er-graph__tool"
          onClick={() => setPositions(grid)}
        >
          <RotateCcw size={14} aria-hidden />
          <span>{t('dataModel.erResetLayout')}</span>
        </button>
        <span className="dataset-er-graph__legend" title={t('dataModel.erLegendHint')}>
          {/* Left edge = the dataset; the line runs off to the right, exactly as it does on the canvas. */}
          <span className="dataset-er-graph__legend-item">
            <svg width="36" height="12" aria-hidden>
              <line x1="16" y1="6" x2="4" y2="1" className="dataset-er-graph__edge-end" />
              <line x1="16" y1="6" x2="4" y2="6" className="dataset-er-graph__edge-end" />
              <line x1="16" y1="6" x2="4" y2="11" className="dataset-er-graph__edge-end" />
              <circle cx="22" cy="6" r="2.5" className="dataset-er-graph__edge-end" fill="none" />
              <line x1="26" y1="6" x2="34" y2="6" className="dataset-er-graph__edge-end" />
            </svg>
            {t('dataModel.erMany')}
          </span>
          <span className="dataset-er-graph__legend-item">
            <svg width="36" height="12" aria-hidden>
              <line x1="4" y1="1" x2="4" y2="11" className="dataset-er-graph__edge-end" />
              <line x1="9" y1="1" x2="9" y2="11" className="dataset-er-graph__edge-end" />
              <line x1="13" y1="6" x2="34" y2="6" className="dataset-er-graph__edge-end" />
            </svg>
            {t('dataModel.erOneOnly')}
          </span>
          <span className="dataset-er-graph__legend-item">
            <svg width="36" height="12" aria-hidden>
              <line x1="4" y1="1" x2="4" y2="11" className="dataset-er-graph__edge-end" />
              <circle cx="12" cy="6" r="2.5" className="dataset-er-graph__edge-end" fill="none" />
              <line x1="16" y1="6" x2="34" y2="6" className="dataset-er-graph__edge-end" />
            </svg>
            {t('dataModel.erZeroOrOne')}
          </span>
        </span>
      </div>
      <div ref={canvasRef} className="dataset-er-graph__canvas" style={{ width, height }}>
        <svg className="dataset-er-graph__edges" width={width} height={height} aria-hidden>
          {edges.map((edge) => {
            /* The crow's foot: three toes touching the entity, meeting on the line side. */
            const vertex = { x: edge.x1 + edge.direction * 12, y: edge.y1 };
            const foot = [edge.y1 - 5, edge.y1, edge.y1 + 5].map((y) => ({ x: edge.x1, y }));
            const bend = Math.max(36, Math.abs(edge.x2 - edge.x1) / 2);
            const path = `M ${edge.x1} ${edge.y1} C ${edge.x1 + edge.direction * bend} ${edge.y1}, ${
              edge.x2 - edge.direction * bend
            } ${edge.y2}, ${edge.x2} ${edge.y2}`;
            return (
              <g key={edge.key}>
                <path
                  className={`dataset-er-graph__edge${edge.required ? '' : ' dataset-er-graph__edge--optional'}${
                    edge.dimmed ? ' dataset-er-graph__edge--dim' : ''
                  }`}
                  d={path}
                  fill="none"
                />
                {/* from side: crow's foot behind a circle — a dataset may have no relationships at all. */}
                <circle
                  className="dataset-er-graph__edge-end"
                  cx={edge.x1 + edge.direction * 20}
                  cy={edge.y1}
                  r={3}
                  fill="none"
                />
                {foot.map((point, i) => (
                  <line
                    key={i}
                    className="dataset-er-graph__edge-end"
                    x1={vertex.x}
                    y1={vertex.y}
                    x2={point.x}
                    y2={point.y}
                  />
                ))}
                {/* to side: one and only one is two bars; zero or one is a circle and a bar. */}
                <line
                  className="dataset-er-graph__edge-end"
                  x1={edge.x2 - edge.direction * 9}
                  y1={edge.y2 - 5}
                  x2={edge.x2 - edge.direction * 9}
                  y2={edge.y2 + 5}
                />
                {edge.required ? (
                  <line
                    className="dataset-er-graph__edge-end"
                    x1={edge.x2 - edge.direction * 15}
                    y1={edge.y2 - 5}
                    x2={edge.x2 - edge.direction * 15}
                    y2={edge.y2 + 5}
                  />
                ) : (
                  <circle
                    className="dataset-er-graph__edge-end"
                    cx={edge.x2 - edge.direction * 15}
                    cy={edge.y2}
                    r={3}
                    fill="none"
                  />
                )}
              </g>
            );
          })}
        </svg>
        {nodes.map((node) => {
          const position = positions[node.id] ?? grid[node.id];
          const columns = (node.columns ?? []).slice(0, MAX_COLUMNS);
          return (
            <div
              key={node.id}
              ref={(element) => {
                if (element) nodeRefs.current.set(node.id, element);
                else nodeRefs.current.delete(node.id);
              }}
              className={`dataset-er-graph__node${
                collapsed.has(node.id) ? ' dataset-er-graph__node--collapsed' : ''
              }${node.joins === 0 ? ' dataset-er-graph__node--isolated' : ''}${
                connected !== null && !connected.has(node.id)
                  ? ' dataset-er-graph__node--dim'
                  : ''
              }`}
              style={{
                left: position.x,
                top: position.y,
                width: BOX_WIDTH,
                height: boxHeightFor(node, collapsed.has(node.id)),
              }}
              onPointerDown={(event) => startDrag(event, node.id)}
              onPointerEnter={() => setHovered(node.id)}
              onPointerLeave={() => setHovered(null)}
            >
              <span className="dataset-er-graph__node-head">
                {columns.length > 0 ? (
                  <button
                    type="button"
                    className="dataset-er-graph__node-toggle"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() =>
                      setCollapsed((current) => {
                        const next = new Set(current);
                        if (next.has(node.id)) next.delete(node.id);
                        else next.add(node.id);
                        return next;
                      })
                    }
                    title={t(
                      collapsed.has(node.id) ? 'dataModel.erExpand' : 'dataModel.erCollapse',
                    )}
                    aria-label={t(
                      collapsed.has(node.id) ? 'dataModel.erExpand' : 'dataModel.erCollapse',
                    )}
                    aria-expanded={!collapsed.has(node.id)}
                  >
                    {collapsed.has(node.id) ? (
                      <ChevronRight size={13} aria-hidden />
                    ) : (
                      <ChevronDown size={13} aria-hidden />
                    )}
                  </button>
                ) : null}
                <span className="dataset-er-graph__node-name">{node.name}</span>
                <button
                  type="button"
                  className="dataset-er-graph__node-open"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onOpen(node.id)}
                  title={t('dataModel.erOpen')}
                  aria-label={`${t('dataModel.erOpen')} ${node.name}`}
                >
                  <ArrowUpRight size={14} aria-hidden />
                </button>
              </span>
              {collapsed.has(node.id) ? null : (
                <span className="dataset-er-graph__node-meta">
                  {t('dataModel.erJoins', { count: node.joins })}
                </span>
              )}
              {!collapsed.has(node.id) && columns.length > 0 ? (
                <span className="dataset-er-graph__node-columns">
                  {columns.map((column) => (
                    <span
                      key={column}
                      data-column={column}
                      className="dataset-er-graph__node-column"
                    >
                      {column}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
