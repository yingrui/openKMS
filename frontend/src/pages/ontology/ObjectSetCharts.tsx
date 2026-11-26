import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchObjectAggregate, type ObjectAggregateChart } from '../../data/ontologyApi';
import { EmptyState } from '../../styles/design-system/EmptyState';
import { Loading } from '../../styles/design-system/Loading';
import { ObjectSetChartSettings } from './ObjectSetChartSettings';
import {
  chartKey,
  deltaLabel,
  formatMeasure,
  DEFAULT_BUCKETS,
  groupBySettings,
  intervalLabel,
  setTotal,
  isHistogram,
  isIdentifierChart,
  isTimeline,
  type ChartSettings,
  type ChartSpec,
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
  specs,
  options,
  labels,
  compare,
  onSettings,
  onPick,
  onPickPair,
  onPickRange,
  onRemove,
  onMove,
  canMove,
  onLoaded,
  refreshKey,
}: {
  typeId: string;
  search: string;
  filters: string[];
  /** The charts to draw, in order. Each one carries its own metric/measure/split. */
  specs: ChartSpec[];
  /** Properties a chart may measure or split by — the type's own and its neighbours'. */
  options: { value: string; label: string }[];
  /** `@link/prop` → what a reader calls it ("经销商 · tier"), so a title is not a query fragment. */
  labels?: Record<string, string>;
  /** A second set to aggregate every chart over, when the caller asked for a comparison. */
  compare?: { filters: string[]; search?: string; label: string };
  onSettings?: (key: string, next: ChartSettings) => void;
  onPick: (prop: string, value: string) => void;
  /** A cross-tab cell is two conditions, not one: the row *and* the column. */
  onPickPair?: (prop: string, value: string, splitProp: string, splitValue: string) => void;
  /** A histogram bar is an interval, so picking one adds two conditions rather than one. */
  onPickRange?: (prop: string, from: number, to: number) => void;
  /** Chart editing: removing a chart is not removing its condition (the docs are explicit). */
  onRemove?: (key: string) => void;
  /** Move a chart one step, or drop it onto another chart's position. */
  onMove?: (key: string, target: -1 | 1 | string) => void;
  canMove?: boolean;
  /** The numbers on screen, so the caller can compare them with the numbers after an action. */
  onLoaded?: (charts: ObjectAggregateChart[]) => void;
  /** Bump to re-read: an action has changed the objects this set contains. */
  refreshKey?: number;
}) {
  const { t } = useTranslation('explore');
  /* The callback is read from a ref: passing it as a dependency would re-run the load on every parent render, and the
     load sets state, so that is a loop rather than a refresh. */
  const loadedRef = useRef(onLoaded);
  loadedRef.current = onLoaded;
  /* `refreshKey` only means "read again": it is not part of the request, so it is read through a ref and used as a
     cache-buster instead of a dependency of the request itself. */
  const refresh = useRef(refreshKey ?? 0);
  /* Each drawn chart carries the spec it came from: two charts may read one property with different settings, and
     the settings are what tell them apart. */
  const [rows, setRows] = useState<{ spec: ChartSpec; chart: ObjectAggregateChart }[]>([]);
  /* Which charts are showing all their values rather than the first dozen. */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  /* A typed interval per histogram: the documented alternative to dragging across buckets. */
  const [ranges, setRanges] = useState<Record<string, { from: string; to: string }>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);

  /* Settings are part of the request, so charts that share them travel in one call and keep their order. */
  const groups = useMemo(() => groupBySettings(specs), [specs]);

  const load = useCallback(async () => {
    if (!typeId || groups.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(null);
    try {
      const responses = await Promise.all(
        groups.map((group) =>
          fetchObjectAggregate(typeId, {
            props: group.props,
            search: search.trim() || undefined,
            filters,
            buckets: group.settings.buckets ?? DEFAULT_BUCKETS,
            valueOrder: group.settings.valueOrder,
            limit: 20,
            ...group.settings,
            compare: compare ? { filters: compare.filters, search: compare.search } : undefined,
          })
        )
      );
      /* Two charts may ask about the same property with different settings, so the results are matched by the
         chart's identity — property plus what it measures — not by the property alone. */
      const byKey = new Map<string, ObjectAggregateChart>();
      groups.forEach((group, index) => {
        const response = responses[index];
        for (const spec of specs.filter((chart) =>
          group.props.includes(chart.prop) &&
          chartKey({ prop: chart.prop, ...group.settings }) === chartKey(chart)
        )) {
          const hit = response.charts.find((chart) => chart.prop === spec.prop);
          if (hit) byKey.set(chartKey(spec), hit);
        }
      });
      /* Identifiers are kept, not dropped: the reader added that chart and needs to know why it shows nothing —
         twelve bars of height one look like a failure, but a chart that silently disappears looks like a bug. */
      const drawn = specs
        .map((spec) => ({ spec, chart: byKey.get(chartKey(spec)) }))
        .filter((row): row is { spec: ChartSpec; chart: ObjectAggregateChart } => Boolean(row.chart));
      setRows(drawn);
      loadedRef.current?.(drawn.map((row) => row.chart));
    } catch (error) {
      setRows([]);
      /* The message names what actually happened: "graph unavailable" was the answer for a refused request too,
         which sent the reader looking at the wrong component. */
      setFailed(error instanceof Error ? error.message : '');
    } finally {
      setLoading(false);
    }
  }, [typeId, search, filters, groups, compare, specs]);

  useEffect(() => {
    if ((refreshKey ?? 0) === refresh.current) return;
    refresh.current = refreshKey ?? 0;
    void load();
  }, [refreshKey, load]);

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
  if (failed !== null) {
    return (
      <EmptyState
        title={t('objectSet.chartsFailed')}
        description={failed || undefined}
      />
    );
  }
  if (rows.length === 0) return <EmptyState title={t('objectSet.chartsEmpty')} />;

  return (
    <div className="object-set-charts">
      {rows.map(({ spec, chart }) => {
        const chartSettings: ChartSettings = spec;
        const key = chartKey(spec);
        const title = labels?.[chart.prop] ?? chart.prop;
        const metricName = chartSettings.metric
          ? t(`objectSet.metric_${chartSettings.metric}`)
          : null;
        const measureName = chartSettings.measure
          ? (labels?.[chartSettings.measure] ?? chartSettings.measure)
          : '';
        const measureLabel =
          chartSettings.metric === 'linked'
            ? t('objectSet.metricLinked')
            : metricName && chartSettings.metric !== 'count'
              ? `${metricName} ${measureName}`.trim()
              : null;
        /* One bar list for every shape: a value bar narrows to one value, an interval bar to a range. */
        const data = isHistogram(chart)
          ? (chart.buckets ?? []).map((bucket) => {
              const selected =
                applied.has(`${chart.prop}\u0000ge\u0000${bucket.from}`) &&
                applied.has(`${chart.prop}\u0000lt\u0000${bucket.to}`);
              return {
                key: String(bucket.from),
                /* The axis shows where an interval starts; the full range belongs in the tooltip, where there is
                   room for it. Eight rotated ranges overlap into noise at this width. */
                label: formatMeasure(bucket.from),
                range: intervalLabel(bucket.from, bucket.to),
                count: bucket.count,
                selected,
                pick: () => onPickRange?.(chart.prop, bucket.from, bucket.to),
              };
            })
          : (chart.values ?? [])
              .slice(0, expanded[chartKey(spec)] ? 40 : 12)
              .map((value) => ({
              key: value.value,
              label: value.value,
              range: value.value,
              count: value.measure ?? value.count,
              baseline: value.baseline_measure ?? value.baseline,
              selected: applied.has(`${chart.prop}\u0000${value.value}`),
              pick: () => onPick(chart.prop, value.value),
            }));
        return (
          <figure
            key={key}
            className={`object-set-chart${chartSettings.span === 2 ? ' object-set-chart--wide' : ''}`}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('text/plain', key);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              event.preventDefault();
              const from = event.dataTransfer.getData('text/plain');
              if (from && from !== key) onMove?.(from, key);
            }}
          >
            <figcaption className="object-set-chart__title">
              <span className="object-set-chart__name">
                {title}
                {(chart.values ?? []).length > 12 ? (
                  <button
                    type="button"
                    className="btn-link object-set-chart__toggle"
                    onClick={() =>
                      setExpanded((current) => ({ ...current, [key]: !current[key] }))
                    }
                  >
                    {expanded[key]
                      ? t('objectSet.chartShowLess')
                      : t('objectSet.chartShowMore', { count: (chart.values ?? []).length })}
                  </button>
                ) : null}
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
                      prop={chart.prop}
                      numeric={isHistogram(chart)}
                      options={options}
                      onChange={(next) => onSettings(key, next)}
                    />
                  ) : null}
                  {canMove && onMove ? (
                    <>
                      <button
                        type="button"
                        className="object-set-chart__action"
                        aria-label={t('objectSet.chartMoveBack', { name: chart.prop })}
                        onClick={() => onMove(key, -1)}
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        className="object-set-chart__action"
                        aria-label={t('objectSet.chartMoveForward', { name: chart.prop })}
                        onClick={() => onMove(key, 1)}
                      >
                        ›
                      </button>
                    </>
                  ) : null}
                  {onRemove ? (
                    <button
                      type="button"
                      className="object-set-chart__action"
                      aria-label={t('objectSet.chartRemove', { name: title })}
                      onClick={() => onRemove(key)}
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              ) : null}
            </figcaption>
            {chartSettings.kind === 'stat' ? (
              <>
                <p className="object-set-chart__stat">
                  {formatMeasure(setTotal(chart, chartSettings.metric))}
                </p>
                {compare && chart.values?.some((value) => value.baseline !== undefined) ? (
                  <p className="object-set-chart__stat-more">
                    {t('objectSet.chartComparedWith', { name: compare.label })}
                  </p>
                ) : null}
              </>
            ) : chartSettings.kind === 'pie' ? (
              <ResponsiveContainer width="100%" height={PLOT_HEIGHT}>
                <PieChart>
                  <Tooltip
                    formatter={(value, name) => [formatMeasure(Number(value)), String(name)]}
                  />
                  <Pie
                    data={data.slice(0, 8)}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={36}
                    outerRadius={72}
                    onClick={pickFromDatum}
                  >
                    {data.slice(0, 8).map((entry) => (
                      <Cell key={entry.key} cursor="pointer" fill={fillFor(entry.selected)} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            ) : isIdentifierChart(chart) ? (
              <p className="object-set-chart__empty">{t('objectSet.chartEveryObjectDiffers')}</p>
            ) : chart.cells ? (
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
            ) : isTimeline(chart) ? (
              /* Periods have an order of their own: a trend line says "getting better or worse", which bars ranked
                 by size cannot say at all. */
              <ResponsiveContainer width="100%" height={PLOT_HEIGHT}>
                <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ stroke: 'var(--color-border)' }}
                    formatter={(value) => [
                      formatMeasure(Number(value)),
                      measureLabel ?? t('objectSet.chartCount'),
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'var(--color-accent)' }}
                    activeDot={{
                      r: 5,
                      onClick: (entry: unknown) => pickFromDatum(entry),
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : isHistogram(chart) ? (
              <>
              /* An interval distribution is read across a number line, so it is drawn on one: bars side by side on a
                 category axis of intervals would look exactly like a value distribution. */
              <ResponsiveContainer width="100%" height={PLOT_HEIGHT}>
                <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    height={24}
                  />
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
              <div className="object-set-chart__range">
                <input
                  className="ds-control ds-control--compact"
                  type="number"
                  value={ranges[key]?.from ?? String(chart.min ?? '')}
                  aria-label={t('objectSet.rangeFrom')}
                  onChange={(event) =>
                    setRanges((current) => ({
                      ...current,
                      [key]: {
                        from: event.target.value,
                        to: current[key]?.to ?? String(chart.max ?? ''),
                      },
                    }))
                  }
                />
                <span aria-hidden>–</span>
                <input
                  className="ds-control ds-control--compact"
                  type="number"
                  value={ranges[key]?.to ?? String(chart.max ?? '')}
                  aria-label={t('objectSet.rangeTo')}
                  onChange={(event) =>
                    setRanges((current) => ({
                      ...current,
                      [key]: {
                        from: current[key]?.from ?? String(chart.min ?? ''),
                        to: event.target.value,
                      },
                    }))
                  }
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const from = ranges[key]?.from ?? String(chart.min ?? '');
                    const to = ranges[key]?.to ?? String(chart.max ?? '');
                    if (from !== '' && to !== '') {
                      onPickRange?.(chart.prop, Number(from), Number(to));
                    }
                  }}
                >
                  {t('objectSet.rangeApply')}
                </button>
              </div>
              </>
            ) : (
              <ResponsiveContainer width="100%" height={PLOT_HEIGHT}>
                <BarChart data={data} layout="vertical" margin={{ top: 4, right: 52, bottom: 4, left: 4 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={118}
                    tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--color-bg-muted)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0]?.payload as
                        | { label: string; count: number; baseline?: number; range?: string }
                        | undefined;
                      if (!row) return null;
                      return (
                        <div className="object-set-chart__tip">
                          <strong>{row.range ?? row.label}</strong>
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
                  <Bar
                    dataKey="count"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={18}
                    onClick={pickFromDatum}
                  >
                    {data.map((entry) => (
                      <Cell key={entry.key} cursor="pointer" fill={fillFor(entry.selected)} />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="right"
                      offset={4}
                      formatter={(value: unknown) => formatMeasure(Number(value))}
                      style={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                    />
                  </Bar>
                  {compare ? (
                    <Bar
                      dataKey="baseline"
                      fill="var(--color-border)"
                      radius={[0, 4, 4, 0]}
                      maxBarSize={18}
                    />
                  ) : null}
                </BarChart>
              </ResponsiveContainer>
            )}
          </figure>
        );
      })}
    </div>
  );
}

/** One height for every plot: a row of charts is read as a row, so it is drawn as one. */
const PLOT_HEIGHT = 180;

/* `--color-accent-subtle` is #f0fdfa — a bar in it is invisible on a card. `accent-muted` reads as a bar while
   leaving the selected one clearly stronger. */
function fillFor(selected: boolean) {
  return selected ? 'var(--color-accent)' : 'var(--color-accent-muted)';
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
    (chart.cells ?? []).find((cell) => cell.value === row && cell.split === column);
  const max = Math.max(1, ...(chart.cells ?? []).map((cell) => cell.count));
  const maxMeasure = Math.max(
    1,
    ...(chart.cells ?? []).map((cell) => Math.abs(cell.measure ?? 0))
  );
  return (
    <div className="object-set-crosstab-wrap" style={{ maxHeight: PLOT_HEIGHT, overflow: 'auto' }}>
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
                const cell = cellAt(row, column);
                /* A measured cell shows the measure; the count is what the shading is based on when there is none. */
                const shown = cell?.measure ?? cell?.count ?? 0;
                const count = cell?.count ?? 0;
                const selected = applied.has(`${chart.prop}\u0000${row}`);
                return (
                  <td key={column}>
                    <button
                      type="button"
                      className="object-set-crosstab__cell"
                      style={{
                        opacity:
                          cell?.measure !== undefined && cell?.measure !== null
                            ? Math.max(0.2, Math.min(1, (cell.measure as number) / maxMeasure))
                            : count === 0
                              ? 0.35
                              : Math.max(0.45, count / max),
                      }}
                      onClick={() => onPick(row, column)}
                      title={`${row} · ${column}`}
                    >
                      <span className={selected ? 'is-selected' : undefined}>
                        {shown ? formatMeasure(Number(shown)) : '·'}
                      </span>
                      {cell?.baseline !== undefined ? (
                        /* A cell compared with another set says both numbers: the count, and where it moved from. */
                        <span className="object-set-crosstab__baseline">
                          {deltaLabel(count, cell.baseline)}
                        </span>
                      ) : null}
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
