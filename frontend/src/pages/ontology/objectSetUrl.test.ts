import { describe, expect, it } from 'vitest';
import { formatCharts, formatColumns, parseCharts, parseColumns } from './objectSetUrl';

describe('an exploration carries its charts in the address', () => {
  it('round-trips a chart with a metric, a split and a bucket count', () => {
    const specs = [
      { prop: 'region' },
      { prop: 'name', metric: 'avg' as const, measure: 'kpis.fill_rate' },
      { prop: 'channel_type', split: 'tier' },
      { prop: 'amount', buckets: 12 },
    ];
    expect(parseCharts(formatCharts(specs))).toEqual(specs);
  });

  it('treats an absent parameter as "no charts chosen", not as an empty list', () => {
    expect(parseCharts(null)).toBeNull();
    expect(parseCharts('')).toBeNull();
  });

  it('survives a property name that looks like a separator', () => {
    const specs = [{ prop: '@lineOfDistributor/tier', metric: 'linked' as const }];
    expect(parseCharts(formatCharts(specs))).toEqual(specs);
  });
});

describe('columns', () => {
  it('round-trip in the chosen order', () => {
    expect(parseColumns(formatColumns(['b', 'a', 'c']))).toEqual(['b', 'a', 'c']);
    expect(parseColumns(null)).toEqual([]);
  });
});
