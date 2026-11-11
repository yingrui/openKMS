import { describe, expect, it } from 'vitest';
import { expectedQueryLines, expectedQueryText } from './expectedQueryText';

/**
 * A data-query item's ground truth is a query. `市盈率` (latest single value) and `平均市盈率` (average) are different
 * indicators, so the row has to say which one and how it is grouped — a name alone reads like either.
 */
describe('expectedQueryText', () => {
  it('names a metric, its dimensions and its filters', () => {
    expect(
      expectedQueryText({
        expected: {
          metric: { name: '平均市盈率' },
          dimensions: ['industry'],
          filters: [{ field: 'list_status', op: '=', value: 'L' }],
        },
      })
    ).toBe('平均市盈率 · by industry · filter list_status = L');
  });

  it('shows a SQL expectation as written', () => {
    expect(expectedQueryText({ expected: { sql: 'SELECT count(*) FROM t' } })).toBe('SELECT count(*) FROM t');
  });

  it('says a refusal is expected', () => {
    expect(expectedQueryText({ expected: { refuse: true } })).toContain('refuse');
  });

  it('reads the legacy structural shape', () => {
    expect(expectedQueryText({ sql: { tables: ['tushare.stock_basic'], group_by: ['industry'] } })).toBe(
      'tables: tushare.stock_basic · by industry'
    );
  });

  it('returns one line per expectation and copes with none', () => {
    expect(expectedQueryLines([{ expected: { sql: 'select 1' } }, { expected: { refuse: true } }])).toHaveLength(2);
    expect(expectedQueryLines(null)).toEqual([]);
  });
});
