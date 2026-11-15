/**
 * The dependency graph of one model's metrics, drawn inline (no dialog, no chart library).
 *
 * Layout is deterministic — a layered decomposition, base metrics at the bottom and everything computed
 * from them above — because a force simulation on eleven boxes moves them on every open and the picture
 * stops being a reference. Deterministic also means it can be tested by geometry rather than by eye.
 *
 * Two edge kinds, two visual languages:
 * - **definition** (solid, downward): `分货满足率` is computed from `分货额度` — structure, cannot fail;
 * - **assertion** (dashed, across): `分货额度 = 方案累计额度 ±1` — a claim a rule verifies, coloured by its
 *   last verdict.
 *
 * The graph is a picture; the list under it is the accessible version of the same facts, and each row
 * links to the rule where the assertion is actually defined.
 */
import { layout, NODE_H, NODE_W } from './metricGraphLayout';
import { neighborhood } from './metricSubgraph';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import '../../../styles/settings-page.scss';
import '../../../styles/metrics.scss';
import { StatusChip } from '../../../styles/design-system';
import type { MetricGraph } from '../../../data/metricsApi';

export function MetricDependencyGraph({ graph }: { graph: MetricGraph }) {
  const { t } = useTranslation('ontology');
  // A model can hold a hundred metrics; draw the selected one's neighborhood until asked for everything.
  // One state, one rule: no focus is the whole model; a metric is its neighborhood.
  const [focusId, setFocusId] = useState<string | null>(null);
  const drawn = neighborhood(graph, focusId);
  const { placed, width, height } = layout(drawn);
  const at = new Map(placed.map((node) => [node.id, node]));
  const definition = drawn.edges.filter((edge) => edge.kind === 'derived');
  const assertions = drawn.edges.filter((edge) => edge.kind === 'assertion');
  const nameOf = (id: string) => at.get(id)?.name ?? id;

  return (
    <div className="metric-dag">
      <div className="metric-dag__focus">
        <label className="metric-dag__focus-field">
          <span>{t('dataModel.graphFocus')}</span>
          <select
            className="ds-control"
            value={focusId ?? ''}
            onChange={(event) => setFocusId(event.target.value || null)}
          >
            <option value="">{t('dataModel.graphAllMetrics', { count: graph.nodes.length })}</option>
            {graph.nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </select>
        </label>
        <span className="metric-dag__focus-count">
          {t('dataModel.graphShowing', { shown: drawn.nodes.length, total: graph.nodes.length })}
        </span>
      </div>

      <ul className="metric-dag__legend">
        <li>
          <svg viewBox="0 0 24 8" className="metric-dag__legend-swatch" aria-hidden>
            <line x1="1" y1="4" x2="23" y2="4" className="metric-dag__edge metric-dag__edge--derived" />
          </svg>
          {t('dataModel.graphDerived')}
        </li>
        <li>
          <svg viewBox="0 0 24 8" className="metric-dag__legend-swatch" aria-hidden>
            <line x1="1" y1="4" x2="23" y2="4" className="metric-dag__edge metric-dag__edge--assertion" />
          </svg>
          {t('dataModel.graphAssertions')}
        </li>
      </ul>

      <div className="metric-dag__canvas">
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={t('dataModel.graphAria')}>
          {definition.map((edge) => {
            const from = at.get(edge.from);
            const to = at.get(edge.to);
            if (!from || !to) return null;
            const x1 = from.x + NODE_W / 2;
            const y1 = from.y + NODE_H;
            const x2 = to.x + NODE_W / 2;
            const y2 = to.y;
            const mid = (y1 + y2) / 2;
            return (
              <path
                key={`d-${edge.from}-${edge.to}`}
                className="metric-dag__edge metric-dag__edge--derived"
                d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`}
                markerEnd="url(#metric-dag-arrow)"
              />
            );
          })}
          {assertions.map((edge) => {
            const from = at.get(edge.from);
            const to = at.get(edge.to);
            if (!from || !to) return null;
            const x1 = from.x + NODE_W / 2;
            const y1 = from.y;
            const x2 = to.x + NODE_W / 2;
            const y2 = to.y;
            const lift = Math.min(48, Math.abs(x1 - x2) / 4 + 28);
            const cx = (x1 + x2) / 2;
            const cy = Math.min(y1, y2) - lift;
            return (
              <g key={`a-${edge.from}-${edge.to}-${edge.rule_id}`}>
                <path
                  className={`metric-dag__edge metric-dag__edge--assertion ${
                    edge.health === 'fail' ? 'metric-dag__edge--failing' : ''
                  }`}
                  d={`M ${x1} ${y1} Q ${cx} ${cy}, ${x2} ${y2}`}
                />
                <text x={cx} y={cy + 4} className="metric-dag__edge-label" textAnchor="middle">
                  {edge.tolerance?.rel
                    ? `±${(edge.tolerance.rel * 100).toLocaleString(undefined, { maximumFractionDigits: 4 })}%`
                    : edge.tolerance?.abs
                      ? `±${edge.tolerance.abs}`
                      : '='}
                </text>
              </g>
            );
          })}
          <defs>
            <marker
              id="metric-dag-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="metric-dag__arrow" />
            </marker>
          </defs>
          {placed.map((node) => (
            <g key={node.id}>
              <rect
                x={node.x}
                y={node.y}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                className={`metric-dag__node ${
                  node.additivity === 'non_additive' ? 'metric-dag__node--non-additive' : ''
                }`}
              />
              {/* The full name is in the <title>: a box is 168px, a metric name can be longer. */}
              <title>{node.name}</title>
              <text
                x={node.x + NODE_W / 2}
                y={node.y + NODE_H / 2 + 5}
                textAnchor="middle"
                className="metric-dag__label"
              >
                {node.name.length > 14 ? `${node.name.slice(0, 13)}…` : node.name}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Assertions are the only part worth repeating in text: each is a claim you can open and act on.
          Definitions are the drawing — repeating them as a list is the same information twice. */}
      {assertions.length > 0 ? (
        <ul className="metric-dag__assertions">
          {assertions.map((edge) => (
            <li key={`${edge.from}-${edge.to}-${edge.rule_id}`}>
              <Link
                to={edge.rule_object_id ? `/data-rules/${edge.rule_object_id}` : '/data-rules'}
                className="metric-dag__assertion-chip"
                title={t('dataModel.graphOpenRule')}
              >
                <span className="metric-dag__assertion-text">
                  {nameOf(edge.from)} = {nameOf(edge.to)}
                  {edge.weight === 1 ? '' : ` × ${edge.weight}`}
                  {edge.tolerance?.rel
                    ? ` ±${(edge.tolerance.rel * 100).toLocaleString(undefined, { maximumFractionDigits: 4 })}%`
                    : edge.tolerance?.abs
                      ? ` ±${edge.tolerance.abs}`
                      : ''}
                </span>
                {edge.health ? (
                  <StatusChip tone={edge.health === 'fail' ? 'warn' : 'ok'}>{edge.health}</StatusChip>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="settings-page-hint">{t('dataModel.graphNoAssertionsForMetric')}</p>
      )}
    </div>
  );
}
