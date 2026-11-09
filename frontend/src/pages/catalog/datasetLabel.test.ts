import { describe, expect, it } from 'vitest';
import { datasetLabel } from './datasetLabel';

const base = {
  kind: 'table' as const,
  display_name: null as string | null,
  schema_name: 'tushare' as string | null,
  table_name: 'daily_basic' as string | null,
  data_source_name: 'tushare' as string | null,
  id: 'ds-1',
};

describe('datasetLabel', () => {
  it('prefers the display name', () => {
    expect(datasetLabel({ ...base, display_name: 'Daily basic' })).toBe('Daily basic');
  });

  it('falls back to the table identity', () => {
    expect(datasetLabel(base)).toBe('tushare.daily_basic');
  });

  it('never prints null.null for a file dataset', () => {
    // The bug five callers shared: a file dataset has no schema and no table.
    expect(
      datasetLabel({ ...base, kind: 'file', schema_name: null, table_name: null, data_source_name: 'Object Storage' }),
    ).toBe('Object Storage');
    expect(datasetLabel({ ...base, kind: 'file', schema_name: null, table_name: null, data_source_name: null })).toBe('ds-1');
  });
});
