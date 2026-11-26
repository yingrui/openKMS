import type { ChartSpec } from './objectSetChartsModel';

/**
 * The exploration's charts and columns live in the URL, like its conditions and its sort.
 *
 * They were component state, which is why a private undo stack had to exist and why the browser's Back button did
 * nothing inside an exploration. An exploration is an addressable thing: everything that decides what it shows belongs
 * in the address.
 *
 * `c=name~avg~kpis.fill_rate;algorithm_id` — charts separated by `;`, a chart's fields by `~`
 * (`prop`, `metric`, `measure`, `split`, `buckets`), empty fields left empty.
 */
const CHART_SEP = ';';
const FIELD_SEP = '~';

export function formatCharts(specs: ChartSpec[]): string {
  return specs
    .map((spec) =>
      [
        spec.prop,
        spec.metric ?? '',
        spec.measure ?? '',
        spec.split ?? '',
        spec.buckets ? String(spec.buckets) : '',
        '',
        spec.kind ?? '',
        spec.span ? String(spec.span) : '',
      ].join(FIELD_SEP)
    )
    .join(CHART_SEP);
}

export function parseCharts(value: string | null): ChartSpec[] | null {
  if (value === null) return null;
  const specs = value
    .split(CHART_SEP)
    .map((entry) => entry.split(FIELD_SEP))
    .filter((fields) => fields[0])
    .map(([prop, metric, measure, split, buckets, , kind, span]) => {
      const spec: ChartSpec = { prop: prop as string };
      if (metric) spec.metric = metric as ChartSpec['metric'];
      if (measure) spec.measure = measure;
      if (split) spec.split = split;
      if (buckets) spec.buckets = Number(buckets);
      if (kind) spec.kind = kind as ChartSpec['kind'];
      if (span) spec.span = Number(span) === 2 ? 2 : 1;
      /* `kind` rides in the metric slot's tail: `prop~metric~measure~split~buckets~valueOrder~kind`. */
      return spec;
    });
  return specs.length > 0 ? specs : null;
}

export function formatColumns(columns: string[]): string {
  return columns.join(',');
}

export function parseColumns(value: string | null): string[] {
  if (!value) return [];
  return value.split(',').filter(Boolean);
}
