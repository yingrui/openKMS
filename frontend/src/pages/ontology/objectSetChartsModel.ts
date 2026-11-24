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
  return values.length > 1 && values.every((value) => value.count === 1);
}

/** A histogram is drawn as it arrives; only value distributions can be identifiers. */
export function isHistogram(chart: ObjectAggregateChart): boolean {
  return (chart.buckets?.length ?? 0) > 0;
}

export function dimensionalCharts(charts: ObjectAggregateChart[]): ObjectAggregateChart[] {
  return charts.filter((chart) => isHistogram(chart) || !isIdentifierChart(chart));
}

/** `12.5 – 13` — the interval a bar stands for, without inventing precision it does not have. */
export function intervalLabel(from: number, to: number): string {
  const trim = (value: number) => String(Number(value.toFixed(3)));
  return `${trim(from)} – ${trim(to)}`;
}

/** What a chart measures and what it splits by, besides the property it groups on. */
export interface ChartSettings {
  metric?: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'p50' | 'p90';
  measure?: string;
  split?: string;
}

export interface ChartSpec extends ChartSettings {
  prop: string;
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
    const key = JSON.stringify(settings);
    const group = groups.get(key) ?? { settings, props: [] };
    group.props.push(spec.prop);
    groups.set(key, group);
  }
  return [...groups.values()];
}

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
