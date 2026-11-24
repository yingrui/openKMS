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

export function dimensionalCharts(charts: ObjectAggregateChart[]): ObjectAggregateChart[] {
  return charts.filter((chart) => !isIdentifierChart(chart));
}
