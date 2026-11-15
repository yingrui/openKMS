/**
 * The metric relationship view, as a canvas you walk rather than a form you fill in.
 *
 * Design decisions, and the reasoning that matters more than the pixels:
 *
 * 1. **No picker.** Nobody starts from "choose a metric from a dropdown to see its lineage"; they start from
 *    a metric they are looking at. So the breadcrumb is the navigation (`整个模型 › 分货满足率`), a node is
 *    the affordance (`打开` chevron on hover, click to drill), and the panorama is the breadcrumb root.
 * 2. **Selection, not navigation, is the first click.** Clicking a node *selects* it — the detail panel on
 *    the right answers "what is this, what is it made of, what depends on it, what is asserted about it"
 *    without losing the picture. Drilling (making it the root) is the second step, so the graph never
 *    jumps away from under the pointer.
 * 3. **The picture is a surface, not a static diagram.** Pan by dragging, zoom with the wheel or the
 *    floating controls, fit on demand — at eleven nodes and at two hundred. Wheel zoom is safe here because
 *    this view does not page-scroll: the pane is the canvas.
 * 4. **Two edge kinds, two languages.** Definitions are solid and only labelled when the weight is not 1
 *    (printing `× 1` on every edge is noise); assertions are dashed, carry their tolerance, take the colour
 *    of their last verdict, and are clickable — the edge *is* the way into the rule.
 * 5. **Everything is a design token.** Node cards are DOM-like SVG groups with our type scale and theme
 *    colours, so dark mode and both languages come for free (canvas-drawn graphs lose all of that).
 */
import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Maximize2, Minus, Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusChip } from '../../../styles/design-system';
import type { MetricGraph, MetricGraphEdge, MetricGraphNode } from '../../../data/metricsApi';
import { layout, NODE_H, NODE_W, type Placed } from './metricGraphLayout';
import { neighborhood } from './metricSubgraph';
import '../../../styles/settings-page.scss';
import '../../../styles/metrics.scss';

const PAD = 48;
const MIN_ZOOM_SCALE = 0.45;

type ViewBox = { x: number; y: number; w: number; h: number };

function fitView(width: number, height: number): ViewBox {
  return { x: -PAD, y: -PAD, w: width + PAD * 2, h: height + PAD * 2 };
}

/** Which metrics a node touches, both ways — the set that stays lit while it is hovered. */
function neighbours(graph: MetricGraph, id: string): Set<string> {
  const out = new Set<string>([id]);
  for (const edge of graph.edges) {
    if (edge.from === id) out.add(edge.to);
    if (edge.to === id) out.add(edge.from);
  }
  return out;
}

function nodeSignals(graph: MetricGraph, node: MetricGraphNode) {
  const assertions = graph.edges.filter(
    (edge) => edge.kind === 'assertion' && (edge.from === node.id || edge.to === node.id),
  );
  return {
    assertions,
    failing: assertions.some((edge) => edge.health === 'fail'),
    asserted: assertions.length > 0,
  };
}

export function MetricDependencyGraph({ graph }: { graph: MetricGraph }) {
  const { t } = useTranslation('ontology');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [view, setView] = useState<ViewBox | null>(null);
  const dragging = useRef<{ x: number; y: number; vb: ViewBox } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const drawn = neighborhood(graph, focusId);
  const { placed, width, height } = layout(drawn);
  const canvas = view ?? fitView(width, height);
  const at = new Map(placed.map((node) => [node.id, node]));

  const focusName = focusId ? (at.get(focusId)?.name ?? graph.nodes.find((n) => n.id === focusId)?.name) : null;
  const selected = selectedId ? at.get(selectedId) : null;
  const lit = hoverId ? neighbours(drawn, hoverId) : selectedId ? neighbours(drawn, selectedId) : null;

  const goTo = useCallback(
    (id: string | null) => {
      setFocusId(id);
      setSelectedId(null);
      setHoverId(null);
      setView(null);
    },
    [],
  );
  const zoom = (factor: number) => {
    setView((current) => {
      const vb = current ?? fitView(width, height);
      const cx = vb.x + vb.w / 2;
      const cy = vb.y + vb.h / 2;
      const w = Math.min(Math.max(vb.w * factor, width / 6), (width + PAD * 4) * 2);
      const h = w * (vb.h / vb.w);
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    });
  };

  const svgRef = useRef<SVGSVGElement | null>(null);
  const onWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    if (!event.ctrlKey && !event.metaKey && Math.abs(event.deltaY) < 2) return;
    // Zoom around the pointer so the node under the cursor stays under the cursor.
    const rect = svgRef.current?.getBoundingClientRect();
    setView((current) => {
      const vb = current ?? fitView(width, height);
      const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12;
      const w = Math.min(Math.max(vb.w * factor, width * MIN_ZOOM_SCALE), (width + PAD * 4) * 2);
      const h = w * (vb.h / vb.w);
      const px = rect ? (event.clientX - rect.left) / rect.width : 0.5;
      const py = rect ? (event.clientY - rect.top) / rect.height : 0.5;
      return { x: vb.x + (vb.w - w) * px, y: vb.y + (vb.h - h) * py, w, h };
    });
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.target !== event.currentTarget) return; // a node or an edge keeps its own click
    dragging.current = { x: event.clientX, y: event.clientY, vb: canvas };
    setIsDragging(true);
    (event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragging.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    const dx = ((event.clientX - drag.x) / rect.width) * drag.vb.w;
    const dy = ((event.clientY - drag.y) / rect.height) * drag.vb.h;
    setView({ ...drag.vb, x: drag.vb.x - dx, y: drag.vb.y - dy });
  };
  const endDrag = () => {
    dragging.current = null;
    setIsDragging(false);
  };

  const edgeLabel = (edge: MetricGraphEdge, nodeOf: (id: string) => Placed | undefined) => {
    if (edge.kind === 'derived') return edge.weight === 1 ? null : `× ${edge.weight}`;
    if (edge.tolerance?.rel) {
      return `±${(edge.tolerance.rel * 100).toLocaleString(undefined, { maximumFractionDigits: 4 })}%`;
    }
    if (edge.tolerance?.abs) return `±${edge.tolerance.abs}`;
    return nodeOf(edge.to) ? '=' : null;
  };

  // Cheap enough to derive on every render, and clearer than memoizing over a re-created edge list.
  const detailEdges = {
    components: selected
      ? drawn.edges.filter((edge) => edge.kind === 'derived' && edge.from === selected.id)
      : [],
    dependents: selected
      ? drawn.edges.filter((edge) => edge.kind === 'derived' && edge.to === selected.id)
      : [],
    assertions: selected
      ? drawn.edges.filter(
          (edge) => edge.kind === 'assertion' && (edge.from === selected.id || edge.to === selected.id),
        )
      : [],
  };

  return (
    <div className="metric-dag">
      <div className="metric-dag__bar">
        <nav className="metric-dag__crumbs" aria-label={t('dataModel.graphCrumbs')}>
          <button type="button" className="metric-dag__crumb" onClick={() => goTo(null)}>
            {t('dataModel.graphRoot', { count: graph.nodes.length })}
          </button>
          {focusName ? (
            <>
              <ChevronRight size={14} aria-hidden className="metric-dag__crumb-sep" />
              <span className="metric-dag__crumb metric-dag__crumb--current">{focusName}</span>
            </>
          ) : null}
        </nav>
        <span className="metric-dag__count">
          {t('dataModel.graphShowing', { shown: drawn.nodes.length, total: graph.nodes.length })}
        </span>
      </div>

      <div className="metric-dag__canvas">
        <svg
          ref={svgRef}
          viewBox={`${canvas.x} ${canvas.y} ${canvas.w} ${canvas.h}`}
          role="img"
          aria-label={t('dataModel.graphAria')}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`metric-dag__svg${isDragging ? ' is-dragging' : ''}`}
        >
          <defs>
            <marker
              id="metric-dag-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="metric-dag__arrow" />
            </marker>
          </defs>

          {drawn.edges.map((edge) => {
            const from = at.get(edge.from);
            const to = at.get(edge.to);
            if (!from || !to) return null;
            const dimmed = lit && !(lit.has(edge.from) && lit.has(edge.to));
            const failing = edge.kind === 'assertion' && edge.health === 'fail';
            const x1 = from.x + NODE_W / 2;
            const y1 = edge.kind === 'assertion' ? from.y : from.y + NODE_H;
            const x2 = to.x + NODE_W / 2;
            const y2 = edge.kind === 'assertion' ? to.y : to.y;
            const mid = (y1 + y2) / 2;
            const label = edgeLabel(edge, (id) => at.get(id));
            const isAssertion = edge.kind === 'assertion';
            const d = isAssertion
              ? `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${Math.min(y1, y2) - 34}, ${x2} ${y2}`
              : `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
            const body = (
              <g
                key={`${edge.kind}-${edge.from}-${edge.to}-${edge.rule_id ?? ''}`}
                className={`metric-dag__edge-group${dimmed ? ' is-dimmed' : ''}`}
              >
                <path
                  d={d}
                  className={[
                    'metric-dag__edge',
                    isAssertion ? 'metric-dag__edge--assertion' : 'metric-dag__edge--derived',
                    failing ? 'metric-dag__edge--failing' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  markerEnd={isAssertion ? undefined : 'url(#metric-dag-arrow)'}
                />
                {label ? (
                  <g className="metric-dag__edge-tag">
                    <rect
                      x={(x1 + x2) / 2 - (label.length * 4 + 8)}
                      y={(isAssertion ? Math.min(y1, y2) - 34 : mid) - 10}
                      width={label.length * 8 + 16}
                      height={20}
                      rx={10}
                    />
                    <text
                      x={(x1 + x2) / 2}
                      y={(isAssertion ? Math.min(y1, y2) - 34 : mid) + 4}
                      textAnchor="middle"
                    >
                      {label}
                    </text>
                  </g>
                ) : null}
              </g>
            );
            if (!isAssertion) return body;
            // The assertion edge *is* the way into the rule.
            return edge.rule_object_id ? (
              <Link key={`link-${edge.from}-${edge.to}`} to={`/data-rules/${edge.rule_object_id}`}>
                <title>
                  {t('dataModel.graphOpenRule')} · {edge.health ?? ''}
                </title>
                {body}
              </Link>
            ) : (
              body
            );
          })}

          {placed.map((node) => {
            const signals = nodeSignals(drawn, node);
            const dimmed = lit && !lit.has(node.id);
            const isSelected = selectedId === node.id;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x} ${node.y})`}
                className={[
                  'metric-dag__node-group',
                  dimmed ? 'is-dimmed' : '',
                  isSelected ? 'is-selected' : '',
                  signals.failing ? 'is-failing' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="button"
                tabIndex={0}
                aria-label={node.name}
                aria-pressed={isSelected}
                onMouseEnter={() => setHoverId(node.id)}
                onMouseLeave={() => setHoverId(null)}
                onFocus={() => setHoverId(node.id)}
                onBlur={() => setHoverId(null)}
                onClick={() => setSelectedId(node.id)}
                onDoubleClick={() => goTo(node.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(node.id);
                  }
                }}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  className="metric-dag__card"
                />
                <rect width={3} height={NODE_H} rx={1.5} className="metric-dag__card-accent" />
                <text x={14} y={20} className="metric-dag__card-name">
                  {node.name.length > 15 ? `${node.name.slice(0, 14)}…` : node.name}
                </text>
                <text x={14} y={36} className="metric-dag__card-meta">
                  {node.additivity === 'non_additive'
                    ? t('datasets.metricNonAdditive')
                    : t('datasets.metricAdditive')}
                  {signals.asserted ? ` · ${t('dataModel.graphAsserted')}` : ''}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="metric-dag__zoom">
          <button type="button" aria-label={t('dataModel.graphZoomIn')} onClick={() => zoom(1 / 1.25)}>
            <Plus size={15} aria-hidden />
          </button>
          <button type="button" aria-label={t('dataModel.graphZoomOut')} onClick={() => zoom(1.25)}>
            <Minus size={15} aria-hidden />
          </button>
          <button type="button" aria-label={t('dataModel.graphFit')} onClick={() => setView(null)}>
            <Maximize2 size={15} aria-hidden />
          </button>
        </div>

        {selected ? (
          <aside className="metric-dag__detail">
            <header>
              <div>
                <h3>{selected.name}</h3>
                <p className="metric-dag__detail-meta">
                  <StatusChip tone={selected.additivity === 'non_additive' ? 'warn' : 'neutral'}>
                    {selected.additivity === 'non_additive'
                      ? t('datasets.metricNonAdditive')
                      : t('datasets.metricAdditive')}
                  </StatusChip>
                </p>
              </div>
              <button
                type="button"
                aria-label={t('dataModel.graphCloseDetail')}
                onClick={() => setSelectedId(null)}
              >
                <X size={16} aria-hidden />
              </button>
            </header>
            {selected.expression ? <code className="metric-dag__detail-sql">{selected.expression}</code> : null}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => goTo(selected.id)}
            >
              {t('dataModel.graphFocusNode')}
            </button>
            {detailEdges.components.length > 0 ? (
              <>
                <h4>{t('dataModel.graphComponents')}</h4>
                <ul>
                  {detailEdges.components.map((edge) => (
                    <li key={edge.to}>
                      <button type="button" onClick={() => setSelectedId(edge.to)}>
                        {at.get(edge.to)?.name ?? edge.to}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {detailEdges.dependents.length > 0 ? (
              <>
                <h4>{t('dataModel.graphDependents')}</h4>
                <ul>
                  {detailEdges.dependents.map((edge) => (
                    <li key={edge.from}>
                      <button type="button" onClick={() => setSelectedId(edge.from)}>
                        {at.get(edge.from)?.name ?? edge.from}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {detailEdges.assertions.length > 0 ? (
              <>
                <h4>{t('dataModel.graphAssertions')}</h4>
                <ul>
                  {detailEdges.assertions.map((edge) => (
                    <li key={`${edge.from}-${edge.to}`}>
                      <Link to={edge.rule_object_id ? `/data-rules/${edge.rule_object_id}` : '/data-rules'}>
                        {at.get(edge.from)?.name ?? edge.from} = {at.get(edge.to)?.name ?? edge.to}
                      </Link>
                      {edge.health ? (
                        <StatusChip tone={edge.health === 'fail' ? 'warn' : 'ok'}>{edge.health}</StatusChip>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
