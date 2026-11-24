import { describe, expect, it } from 'vitest';
import { linkedChartOptions } from './linkedChartOptions';

const type = (id: string, name: string, properties: string[]) =>
  ({ id, name, properties: properties.map((p) => ({ name: p })) }) as never;

const link = (id: string, apiName: string, from: string, to: string) =>
  ({ id, api_name: apiName, source_object_type_id: from, target_object_type_id: to }) as never;

describe('charting a neighbour', () => {
  const types = {
    stock: type('stock', 'Stock', ['industry', 'market']),
    holding: type('holding', 'Holding', ['status']),
    txn: type('txn', 'Transaction', ['side']),
  };

  it('names the link and the property, and says which type it came from', () => {
    const options = linkedChartOptions(
      [link('l1', 'ofStock', 'holding', 'stock')],
      types,
      'stock'
    );
    expect(options).toEqual([
      { value: '@ofStock/status', label: 'Holding · status' },
    ]);
  });

  it('falls back to the link id when two links share one api_name on this side', () => {
    const options = linkedChartOptions(
      [link('l1', 'ofStock', 'holding', 'stock'), link('l2', 'ofStock', 'txn', 'stock')],
      types,
      'stock'
    );
    expect(options.map((option) => option.value)).toEqual([
      '@l1/status',
      '@l2/side',
    ]);
  });

  it('ignores links that do not touch the type', () => {
    expect(linkedChartOptions([link('l1', 'x', 'a', 'b')], types, 'stock')).toEqual([]);
  });
});
