import { describe, expect, it } from 'vitest';
import type { DashboardReport } from '../../data/dashboardsApi';
import { applyReportFields, moveReport, removeReport, replaceReport } from './dashboardEdits';

const A: DashboardReport = { title: 'a' };
const B: DashboardReport = { title: 'b' };
const C: DashboardReport = { title: 'c' };
const titles = (reports: DashboardReport[]) => reports.map((r) => r.title);

describe('replaceReport', () => {
  it('replaces the one and leaves the order alone', () => {
    expect(titles(replaceReport([A, B, C], 1, { title: 'B2' }))).toEqual(['a', 'B2', 'c']);
  });

  it('ignores an index that is not there', () => {
    expect(replaceReport([A], 3, B)).toEqual([A]);
    expect(replaceReport([A], -1, B)).toEqual([A]);
  });
});

describe('removeReport', () => {
  it('drops exactly one', () => {
    expect(titles(removeReport([A, B, C], 0))).toEqual(['b', 'c']);
    expect(titles(removeReport([A, B, C], 2))).toEqual(['a', 'b']);
  });

  it('ignores an index that is not there', () => {
    expect(removeReport([A], 1)).toEqual([A]);
  });
});

describe('moveReport', () => {
  it('swaps neighbours', () => {
    expect(titles(moveReport([A, B, C], 0, 1))).toEqual(['b', 'a', 'c']);
    expect(titles(moveReport([A, B, C], 2, -1))).toEqual(['a', 'c', 'b']);
  });

  it('does not wrap off either end', () => {
    expect(titles(moveReport([A, B, C], 0, -1))).toEqual(['a', 'b', 'c']);
    expect(titles(moveReport([A, B, C], 2, 1))).toEqual(['a', 'b', 'c']);
    expect(moveReport([A], 5, 1)).toEqual([A]);
  });
});

describe('applyReportFields', () => {
  const RUN: DashboardReport = {
    title: 'P/E by industry',
    insight: 'old',
    source_kind: 'dataset',
    dataset_id: 'd1',
    query: { filters: [] },
    chart: { type: 'bar', x: 'industry', y: ['value'] },
    columns: ['industry', 'value'],
    rows: [{ industry: '银行', value: 6.07 }],
    total: 10,
    ran_at: '2026-01-01T00:00:00Z',
  };

  it('keeps the source, the query and the last run', () => {
    const next = applyReportFields(RUN, {
      title: '  行业估值  ',
      insight: '  银行最低  ',
      chart: { choice: 'line', x: 'industry', y: ['value'] },
    });
    expect(next.title).toBe('行业估值');
    expect(next.insight).toBe('银行最低');
    expect(next.chart).toEqual({ type: 'line', x: 'industry', y: ['value'], series: null });
    expect(next.query).toEqual(RUN.query);
    expect(next.rows).toEqual(RUN.rows);
    expect(next.ran_at).toBe(RUN.ran_at);
  });

  it('removes an emptied insight or chart instead of blanking it', () => {
    const next = applyReportFields(RUN, { title: 'P/E', insight: '   ', chart: { choice: 'none', x: '', y: [] } });
    expect('insight' in next).toBe(false);
    expect('chart' in next).toBe(false);
    expect(next.title).toBe('P/E');
  });

  it('keeps the old title when the new one is blank', () => {
    expect(applyReportFields(RUN, { title: '  ', insight: '', chart: { choice: 'none', x: '', y: [] } }).title).toBe(
      'P/E by industry',
    );
  });
});
