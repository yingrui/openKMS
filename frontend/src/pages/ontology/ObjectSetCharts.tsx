import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchObjectAggregate, type ObjectAggregateChart } from '../../data/ontologyApi';
import { EmptyState } from '../../styles/design-system/EmptyState';
import { Loading } from '../../styles/design-system/Loading';
import { ObjectSetChartSettings } from './ObjectSetChartSettings';
import {
  deltaLabel,
  dimensionalCharts,
  formatMeasure,
  groupBySettings,
  intervalLabel,
  isHistogram,
  type ChartSettings,
} from './objectSetChartsModel';

/**
 * The exploration's chart area: one chart per property, each aggregating **the current object set**.
 *
 * Clicking a bar adds that value as a condition (`<prop>:eq:<value>`), which is what makes a chart a control
 * rather than a report. Every chart re-aggregates after the click, because they all read the same set.
 *
 * A chart is more than "how many per value": it can measure something (`avg fill_rate` per region) and it can split
 * by a second property (`region × tier`). Those are the two questions the counts could not answer.
 */
export function ObjectSetCharts({
  typeId,
  search,
  filters,
  properties,
  settings,
  options,
  compare,
  onSettings,
  onPick,
  onPickPair,
  onPickRange,
  onRemove,
  onMove,
  canMove,
  footer,
}: {
  typeId: string;
  search: string;
  filters: string[];
  /** Property names to chart, in order. The caller decides (prominent properties first). */
  properties: string[];
  /** Per-property metric/measure/split, keyed by the property string. */
  settings?: Record<string, ChartSettings>;
  /** Properties a chart may measure or split by — the type's own and its neighbours'. */
  options: { value: string; label: string }[];
  /** A second set to aggregate every chart over, when the caller asked for a comparison. */
  compare?: { filters: string[]; search?: string; label: string };
  onSettings?: (prop: string, next: ChartSettings) => void;
  onPick: (prop: string, value: string) => void;
  /** A cross-tab cell is two conditions, not one: the row *and* the column. */
  onPickPair?: (prop: string, value: string, splitProp: string, splitValue: string) => void;
  /** A histogram bar is an interval, so picking one adds two conditions rather than one. */
  onPickRange?: (prop: string, from: number, to: number) => void;
  /** Chart editing: removing a chart is not removing its condition (the docs are explicit). */
  onRemove?: (prop: string) => void;
  onMove?: (prop: string, direction: -1 | 1) => void;
  canMove?: boolean;
  /** Rendered as the last cell of the grid — the "add chart" card. */
  footer?: React.ReactNode;
}) {
  const { t } = useTranslation('explore');
  const [charts, setCharts] = useState<ObjectAggregateChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  /* Settings are part of the request, so charts that share them travel in one call and keep their order. */
  const groups = useMemo(
    () =>
      groupBySettings(
        properties.map((prop) => ({ prop, ...(settings?.[prop] ?? {}) }))
      ),
    [properties, settings]
  );

  const load = useCallback(async () => {
    if (!typeId || groups.length === 0) {
      setCharts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const responses = await Promise.all(
        groups.map((group) =>
          fetchObjectAggregate(typeId, {
            props: group.props,
            search: search.trim() || undefined,
            filters,
            limit: 20,
            buckets: 8,
            ...group.settings,
            compare: compare ? { filters: compare.filters, search: compare.search } : undefined,
          })
        )
      );
      const byProp = new Map<string, ObjectAggregateChart>();
      for (const response of responses) {
        for (const chart of response.charts) byProp.set(chart.prop, chart);
      }
      const ordered = groups.flatMap((group) => group.props.map((prop) => byProp.get(prop)));
      // Identifiers are answered but not drawn: twelve bars of height one look like a failure, not a distribution.
      setCharts(dimensionalCharts(ordered.filter(Boolean) as ObjectAggregateChart[]));
    } catch {
      setCharts([]);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [typeId, search, filters, groups, compare]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Which property+value pairs are already conditions, so a chosen bar can be highlighted. */
  const applied = useMemo(() => {
    const out = new Set<string>();
    for (const filter of filters) {
      const [prop, op, rawValue] = filter.split(':');
      if (op === 'eq' && prop && rawValue) out.add(`${prop}\u0000${rawValue}`);
      if ((op === 'ge' || op === 'lt') && prop && rawValue) {
        out.add(`${prop}\u0000${op}\u0000${rawValue}`);
      }
    }
    return out;
  }, [filters]);

  if (loading) return <Loading label={t('objectSet.chartsLoading')} />;
  if (failed) return <EmptyState title={t('objectSet.chartsFailed')} />;
  if (charts.length === 0) return <EmptyState title={t('objectSet.chartsEmpty')} />;

  return (
    <div className="object-set-charts">
      {charts.map((chart) => {
        const chartSettings = settings?.[chart.prop] ?? {};
        const measureLabel =
          chartSettings.metric && chartSettings.metric !== 'count'
            ? `${chartSettings.metric} ${chartSettings.measure ?? ''}`.trim()
            : null;
        /* One bar list for every shape: a value bar narrows to one value, an interval bar to a range. */
        const data = isHistogram(chart)
          ? (chart.buckets ?? []).map((bucket) => {
              const selected =
                applied.has(`${chart.prop}\u0000ge\u0000${bucket.from}`) &&
                applied.has(`${chart.prop}\u0000lt\u0000${bucket.to}`);
              return {
                key: String(bucket.from),
                label: intervalLabel(bucket.from, bucket.to),
                count: bucket.count,
                selected,
                pick: () => onPickRange?.(chart.prop, bucket.from, bucket.to),
              };
            })
          : (chart.values ?? []).slice(0, 12).map((value) => ({
              key: value.value,
              label: value.value,
              count: value.measure ?? value.count,
              baseline: value.baseline_measure ?? value.baseline,
              selected: applied.has(`${chart.prop}\u0000${value.value}`),
              pick: () => onPick(chart.prop, value.value),
            }));
        return (
          <figure key={chart.prop} className="object-set-chart">
            <figcaption className="object-set-chart__title">
              <span className="object-set-chart__name">
                {chart.prop}
                {chart.truncated ? (
                  <span className="object-set-chart__more">
                    {t('objectSet.chartTruncated', { count: (chart.values ?? []).length })}
                  </span>
                ) : null}
                {measureLabel ? <span className="object-set-chart__more">{measureLabel}</span> : null}
                {compare ? (
                  <span className="object-set-chart__more">
                    {t('objectSet.chartComparedWith', { name: compare.label })}
                  </span>
                ) : null}
                {isHistogram(chart) && chart.min !== undefined && chart.max !== undefined ? (
                  <span className="object-set-chart__more">
                    {intervalLabel(chart.min, chart.max)}
                  </span>
                ) : null}
                {isHistogram(chart) && chart.counted !== undefined && chart.total !== undefined
                  ? chart.counted < chart.total
                    ? (
                      <span className="object-set-chart__more">
                        {t('objectSet.chartCoverage', {
                          count: chart.counted,
                          total: chart.total,
                        })}
                      </span>
                    )
                    : null
                  : null}
              </span>
              {onRemove || onMove || onSettings ? (
                <span className="object-set-chart__actions">
                  {onSettings ? (
                    <ObjectSetChartSettings
                      settings={chartSettings}
                      options={options}
                      onChange={(next) => onSettings(chart.prop, next)}
                    />
                  ) : null}
                  {canMove && onMove ? (
                    <>
                      <button
                        type="button"
                        className="object-set-chart__action"
                        aria-label={t('objectSet.chartMoveBack', { name: chart.prop })}
                        onClick={() => onMove(chart.prop, -1)}
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        className="object-set-chart__action"
                        aria-label={t('objectSet.chartMoveForward', { name: chart.prop })}
                        onClick={() => onMove(chart.prop, 1)}
                      >
                        ›
                      </button>
                    </>
                  ) : null}
                  {onRemove ? (
                    <button
                      type="button"
                      className="object-set-chart__action"
                      aria-label={t('objectSet.chartRemove', { name: chart.prop })}
                      onClick={() => onRemove(chart.prop)}
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              ) : null}
            </figcaption>
            {chart.cells ? (
              <CrossTab
                chart={chart}
                applied={applied}
                onPick={(value, splitValue) =>
                  onPickPair
                    ? onPickPair(chart.prop, value, chart.split ?? '', splitValue)
                    : onPick(chart.prop, value)
                }
              />
            ) : data.length === 0 ? (
              <p className="object-set-chart__empty">{t('objectSet.chartNoValues')}</p>
            ) : isHistogram(chart) ? (
              /* An interval distribution is read across a number line, so it is drawn on one: bars side by side on a
                 category axis of intervals would look exactly like a value distribution. */
              <ResponsiveContainer width="100%" height={168}>
                <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-35} height={46} textAnchor="end" />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ fill: 'var(--color-bg-muted)' }}
                    formatter={(value) => [formatMeasure(Number(value)), t('objectSet.chartCount')]}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]} onClick={pickFromDatum}>
                    {data.map((entry) => (
                      <Cell key={entry.key} cursor="pointer" fill={fillFor(entry.selected)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(96, data.length * 26)}>
                <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={120}
                    tick={{ fontSize: 12 }}
                    interval={0}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--color-bg-muted)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0]?.payload as
                        | { label: string; count: number; baseline?: number }
                        | undefined;
                      if (!row) return null;
                      return (
                        <div className="object-set-chart__tip">
                          <strong>{row.label}</strong>
                          <span>
                            {formatMeasure(row.count)} {measureLabel ?? t('objectSet.chartCount')}
                          </span>
                          {row.baseline !== undefined ? (
                            <>
                              <span>
                                {formatMeasure(row.baseline)}{' '}
                                {compare?.label ?? t('objectSet.chartBaseline')}
                              </span>
                              <span>{deltaLabel(row.count, row.baseline)}</span>
                            </>
                          ) : null}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 3, 3, 0]} onClick={pickFromDatum}>
                    {data.map((entry) => (
                      <Cell key={entry.key} cursor="pointer" fill={fillFor(entry.selected)} />
                    ))}
                  </Bar>
                  {compare ? (
                    <Bar dataKey="baseline" fill="var(--color-border)" radius={[0, 3, 3, 0]} />
                  ) : null}
                </BarChart>
              </ResponsiveContainer>
            )}
          </figure>
        );
      })}
      {footer}
    </div>
  );
}

function fillFor(selected: boolean) {
  return selected ? 'var(--color-accent)' : 'var(--color-accent-subtle)';
}

/** recharts hands the row datum back; that datum carries the bar's own handler. */
function pickFromDatum(entry: unknown) {
  const raw = entry as { payload?: { pick?: () => void } };
  raw?.payload?.pick?.();
}

/**
 * A cross-tab: primary values as rows, the split values as columns.
 *
 * Stacked bars were the alternative and they lie at this size — twenty-four groups over four categories is a
 * rainbow nobody reads. A small matrix shows the shape and each cell is still a click away from being a condition.
 */
function CrossTab({
  chart,
  applied,
  onPick,
}: {
  chart: ObjectAggregateChart;
  applied: Set<string>;
  onPick: (prop: string, value: string) => void;
  /** A cross-tab cell is two conditions, not one: the row *and* the column. */
  onPickPair?: (prop: string, value: string, splitProp: string, splitValue: string) => void;
}) {
  const rows = [...new Set((chart.cells ?? []).map((cell) => cell.value))];
  const columns = [...new Set((chart.cells ?? []).map((cell) => cell.split))];
  const cellAt = (row: string, column: string) =>
    (chart.cells ?? []).find((cell) => cell.value === row && cell.split === column)?.count ?? 0;
  const max = Math.max(1, ...(chart.cells ?? []).map((cell) => cell.count));
  return (
    <div className="object-set-crosstab-wrap">
      <table className="object-set-crosstab">
        <thead>
          <tr>
            <th scope="col">{chart.prop}</th>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row}>
              <th scope="row">{row}</th>
              {columns.map((column) => {
                const count = cellAt(row, column);
                const selected = applied.has(`${chart.prop}\u0000${row}`);
                return (
                  <td key={column}>
                    <button
                      type="button"
                      className="object-set-crosstab__cell"
                      style={{ opacity: count === 0 ? 0.35 : Math.max(0.45, count / max) }}
                      onClick={() => onPick(row, column)}
                      title={`${row} · ${column}`}
                    >
                      <span className={selected ? 'is-selected' : undefined}>{count || '·'}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="object-set-crosstab__hint">{chart.split}</p>
    </div>
  );
}
