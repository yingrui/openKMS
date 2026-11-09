/**
 * A group-by selection must reach the request body.
 *
 * The failure this guards against is silent: the Builder shows a dimension chip, the answer
 * comes back as a single aggregate row, and nothing errors — because the field reference was
 * dropped on the way from the picker to the payload. The backend cannot notice either: a query
 * without `group_by` is a perfectly valid global aggregate.
 */
import { describe, expect, it } from 'vitest';
import { compactSpec, normalize } from './modelPlaygroundSpec';

const DIM = { field: '6b1cd7ac-541e-45bc-8c27-57cdf44d033d', granularity: null };

describe('a chosen dimension survives to the payload', () => {
  it('keeps group_by when the metric is otherwise empty', () => {
    const spec = compactSpec(
      normalize({ metric: 'm1', group_by: [DIM], filters: [], order_by: [] }),
    );
    expect(spec.group_by).toEqual([DIM]);
  });

  it('keeps group_by through a JSON round-trip (what the URL carries)', () => {
    const spec = normalize({ metric: 'm1', group_by: [DIM] });
    const back = normalize(JSON.parse(JSON.stringify(compactSpec(spec))));
    expect(back.group_by).toEqual([DIM]);
  });

  it('keeps the time grain a dimension was given', () => {
    const dated = { field: 'trade_date', granularity: 'month' };
    const spec = compactSpec(normalize({ metric: 'm1', group_by: [dated] }));
    expect(spec.group_by).toEqual([dated]);
  });

  it('does not invent dimensions that were never chosen', () => {
    const spec = compactSpec(normalize({ metric: 'm1' }));
    expect(spec.group_by).toEqual([]);
  });
});
