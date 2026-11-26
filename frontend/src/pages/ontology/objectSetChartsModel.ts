import type { ObjectAggregateChart } from '../../data/ontologyApi';

/**
 * Which aggregate results are worth drawing.
 *
 * A property that gives every object its own bar is an identifier — a uuid, a name, a hash. Drawing it produces
 * twelve bars of height one, which reads as "no data" even though the query answered. The set's default charts are
 * its first declared properties, so for an object type whose key comes first this is the *normal* case, not an edge
 * one.
 *
 * The test is the data, not the name: `count === 1` for every value and more than one value means nothing groups.
 */
export function isIdentifierChart(chart: Pick<ObjectAggregateChart, 'values'>): boolean {
  const values = chart.values ?? [];
  /* A measure changes what a bar means: eight scenarios each holding one object is still eight values worth
     reading, because the bar is the measure, not the count. Only a count chart can be all-identifiers. */
  if (values.some((value) => value.measure !== undefined)) return false;
  return values.length > 1 && values.every((value) => value.count === 1);
}

/** A chart of a period property: the values are in time order, so it is read as a trend. */
export function isTimeline(chart: ObjectAggregateChart): boolean {
  return chart.order === 'chronological' && !isHistogram(chart) && !chart.cells;
}

/** A histogram is drawn as it arrives; only value distributions can be identifiers. */
export function isHistogram(chart: ObjectAggregateChart): boolean {
  return (chart.buckets?.length ?? 0) > 0;
}

/** `12.5 – 13` — the interval a bar stands for, without inventing precision it does not have. */
export function intervalLabel(from: number, to: number): string {
  const trim = (value: number) => String(Number(value.toFixed(3)));
  return `${trim(from)} – ${trim(to)}`;
}

/** What a chart measures and what it splits by, besides the property it groups on. */
export interface ChartSettings {
  metric?: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'p50' | 'p90' | 'linked';
  measure?: string;
  split?: string;
  /** Intervals for a numeric property; 8 when not chosen. A text property ignores it. */
  buckets?: number;
  /** A listogram's own sort: by how many objects hold a value, or by the value itself. */
  valueOrder?: boolean;
  /** How the numbers are drawn. `stat` is one number for the whole set, not a distribution. */
  kind?: 'bars' | 'pie' | 'stat';
  /** One or two columns wide, of the two the grid has. */
  span?: 1 | 2;
}

export interface ChartSpec extends ChartSettings {
  prop: string;
}

/**
 * A chart's identity is what it asks, not which property it asks about.
 *
 * "Fill rate per plan" and "waste per plan" are two charts over the same property; keying them by the property
 * would make the second one overwrite the first one's settings. The signature is also what a save stores, so two
 * charts of one property survive a round trip.
 */
export function chartKey(spec: ChartSpec): string {
  const metric = spec.metric && spec.metric !== 'count' ? spec.metric : 'count';
  /* The default interval count is "not stated": `buckets: 8` and no buckets are the same chart, and the request
     grouping relies on that — a key that disagrees with the group's settings drops the chart from the grid. */
  const buckets = spec.buckets && spec.buckets !== DEFAULT_BUCKETS ? String(spec.buckets) : '';
  return [
    spec.prop,
    metric,
    spec.measure ?? '',
    spec.split ?? '',
    buckets,
    spec.valueOrder ? 'v' : '',
    spec.kind ?? '',
    spec.span ? String(spec.span) : '',
  ].join('\u0000');
}

export function addSpec(specs: ChartSpec[], spec: ChartSpec): ChartSpec[] {
  return specs.some((existing) => chartKey(existing) === chartKey(spec))
    ? specs
    : [...specs, spec];
}

/**
 * Charts are requested in groups, because the aggregation takes one metric/split per call: two charts with different
 * settings are two round trips, and charts that share settings travel together.
 */
export function groupBySettings(specs: ChartSpec[]): { settings: ChartSettings; props: string[] }[] {
  const groups = new Map<string, { settings: ChartSettings; props: string[] }>();
  for (const spec of specs) {
    const settings: ChartSettings = {};
    if (spec.metric && spec.metric !== 'count') settings.metric = spec.metric;
    if (settings.metric) settings.measure = spec.measure;
    if (spec.split) settings.split = spec.split;
    /* The interval count is part of the request, so two charts that disagree about it are two calls. */
    if (spec.buckets && spec.buckets !== DEFAULT_BUCKETS) settings.buckets = spec.buckets;
    if (spec.valueOrder) settings.valueOrder = true;
    if (spec.kind && spec.kind !== 'bars') settings.kind = spec.kind;
    if (spec.span === 2) settings.span = 2;
    const key = JSON.stringify(settings);
    const group = groups.get(key) ?? { settings, props: [] };
    group.props.push(spec.prop);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** How many intervals a numeric property is split into unless the caller says otherwise. */
export const DEFAULT_BUCKETS = 8;

/** `1.4 万` style labels, so an average of 12,345 is readable in a 12px chart. */
export function formatMeasure(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (abs >= 10_000) return `${Number((value / 10_000).toFixed(1))}万`;
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(2)));
}

/** `[{prop, metric?, measure?, split?}, …]` → `{prop: {metric?, measure?, split?}}`, dropping what says nothing. */
export function settingsOf(charts: ChartSpec[]): Record<string, ChartSettings> {
  const out: Record<string, ChartSettings> = {};
  for (const chart of charts) {
    const settings: ChartSettings = {};
    if (chart.metric && chart.metric !== 'count') settings.metric = chart.metric;
    if (settings.metric && chart.measure) settings.measure = chart.measure;
    if (chart.split) settings.split = chart.split;
    if (Object.keys(settings).length > 0) out[chart.prop] = settings;
  }
  return out;
}

/** `+12%` / `-3%` — a difference is easier to read as a share when the two numbers are far apart. */
export function deltaLabel(current: number, baseline: number): string {
  if (!baseline) return current ? '+∞' : '0';
  const pct = ((current - baseline) / baseline) * 100;
  const rounded = Math.round(pct);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

export interface ChartChange {
  prop: string;
  /** Only the values that moved — a chart where nothing moved is not a change. */
  moved: { value: string; before: number; after: number }[];
}

/** The number a bar stands for: the measure when the chart measures something, its object count otherwise. */
function barValue(row: { count: number; measure?: number }): number {
  return row.measure ?? row.count;
}

/**
 * What an action did, per chart, by comparing the numbers before it ran with the numbers after.
 *
 * This is the fourth step of the loop — analyse, choose, act, **verify**. Without it an action is a message that was
 * sent; with it, the same screen answers "did it change anything, and where". A chart that moved nowhere is reported
 * as nothing rather than as an empty section, because "no change" is the answer to the question that was asked.
 */
export function diffCharts(
  before: ObjectAggregateChart[],
  after: ObjectAggregateChart[]
): ChartChange[] {
  const beforeByProp = new Map(before.map((chart) => [chart.prop, chart]));
  const changes: ChartChange[] = [];
  for (const chart of after) {
    const previous = beforeByProp.get(chart.prop);
    if (!previous) continue;
    const beforeValues = new Map((previous.values ?? []).map((row) => [row.value, barValue(row)]));
    const afterValues = new Map((chart.values ?? []).map((row) => [row.value, barValue(row)]));
    const values = new Set([...beforeValues.keys(), ...afterValues.keys()]);
    const moved: ChartChange['moved'] = [];
    for (const value of values) {
      const was = beforeValues.get(value) ?? 0;
      const now = afterValues.get(value) ?? 0;
      if (Math.abs(now - was) > 1e-9) moved.push({ value, before: was, after: now });
    }
    if (moved.length > 0) {
      moved.sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));
      changes.push({ prop: chart.prop, moved });
    }
  }
  return changes;
}

/**
 * One number for the whole set, from the distribution that is already loaded.
 *
 * Every object sits in exactly one bar of a one-dimensional chart, so the total of a count chart is the size of the
 * set and the total of a measure chart is the sum of that measure — no second query, and no chance of the number
 * disagreeing with the bars beside it.
 */
export function setTotal(chart: ObjectAggregateChart, metric: ChartSettings['metric']): number {
  const values = chart.values ?? [];
  if (!values.length) return 0;
  if (metric === 'avg') {
    const measured = values.filter((value) => value.measure !== undefined);
    if (measured.length === 0) return 0;
    return measured.reduce((sum, value) => sum + (value.measure ?? 0), 0) / measured.length;
  }
  if (metric === 'min') return Math.min(...values.map((value) => value.measure ?? value.count));
  if (metric === 'max') return Math.max(...values.map((value) => value.measure ?? value.count));
  return values.reduce((sum, value) => sum + (value.measure ?? value.count), 0);
}
