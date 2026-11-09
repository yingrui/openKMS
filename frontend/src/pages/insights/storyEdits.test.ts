import { describe, expect, it } from 'vitest';
import type { StoryFinding } from '../../data/storiesApi';
import { applyFindingFields, moveFinding, removeFinding, replaceFinding } from './storyEdits';

const A: StoryFinding = { title: 'a' };
const B: StoryFinding = { title: 'b' };
const C: StoryFinding = { title: 'c' };
const titles = (findings: StoryFinding[]) => findings.map((r) => r.title);

describe('replaceFinding', () => {
  it('replaces the one and leaves the order alone', () => {
    expect(titles(replaceFinding([A, B, C], 1, { title: 'B2' }))).toEqual(['a', 'B2', 'c']);
  });

  it('ignores an index that is not there', () => {
    expect(replaceFinding([A], 3, B)).toEqual([A]);
    expect(replaceFinding([A], -1, B)).toEqual([A]);
  });
});

describe('removeFinding', () => {
  it('drops exactly one', () => {
    expect(titles(removeFinding([A, B, C], 0))).toEqual(['b', 'c']);
    expect(titles(removeFinding([A, B, C], 2))).toEqual(['a', 'b']);
  });

  it('ignores an index that is not there', () => {
    expect(removeFinding([A], 1)).toEqual([A]);
  });
});

describe('moveFinding', () => {
  it('swaps neighbours', () => {
    expect(titles(moveFinding([A, B, C], 0, 1))).toEqual(['b', 'a', 'c']);
    expect(titles(moveFinding([A, B, C], 2, -1))).toEqual(['a', 'c', 'b']);
  });

  it('does not wrap off either end', () => {
    expect(titles(moveFinding([A, B, C], 0, -1))).toEqual(['a', 'b', 'c']);
    expect(titles(moveFinding([A, B, C], 2, 1))).toEqual(['a', 'b', 'c']);
    expect(moveFinding([A], 5, 1)).toEqual([A]);
  });
});

describe('applyFindingFields', () => {
  const RUN: StoryFinding = {
    title: 'P/E by industry',
    takeaway: 'old',
    source_kind: 'dataset',
    dataset_id: 'd1',
    query: { filters: [] },
    view: { kind: 'chart', type: 'bar', x: 'industry', y: ['value'], series: null },
    columns: ['industry', 'value'],
    rows: [{ industry: '银行', value: 6.07 }],
    total: 10,
    ran_at: '2026-01-01T00:00:00Z',
  };

  it('keeps the source, the query and the last run', () => {
    const next = applyFindingFields(RUN, {
      title: '  行业估值  ',
      takeaway: '  银行最低  ',
      view: { choice: 'line', valueColumn: 'value', axisColumn: 'industry', y: ['value'] },
    });
    expect(next.title).toBe('行业估值');
    expect(next.takeaway).toBe('银行最低');
    expect(next.view).toEqual({ kind: 'chart', type: 'line', x: 'industry', y: ['value'], series: null });
    expect(next.query).toEqual(RUN.query);
    expect(next.rows).toEqual(RUN.rows);
    expect(next.ran_at).toBe(RUN.ran_at);
  });

  it('removes an emptied takeaway or chart instead of blanking it', () => {
    const next = applyFindingFields(RUN, { title: 'P/E', takeaway: '   ', view: { choice: 'none', valueColumn: '', axisColumn: '', y: [] } });
    expect('takeaway' in next).toBe(false);
    expect('view' in next).toBe(false);
    expect(next.title).toBe('P/E');
  });

  it('keeps the old title when the new one is blank', () => {
    expect(applyFindingFields(RUN, { title: '  ', takeaway: '', view: { choice: 'none', valueColumn: '', axisColumn: '', y: [] } }).title).toBe(
      'P/E by industry',
    );
  });
});
