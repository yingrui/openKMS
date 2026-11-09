/**
 * Hook-level proof that picking a dimension produces a grouped query.
 *
 * All the unit-level pieces (spec normalize / compactSpec) already round-trip `group_by`, yet a
 * grouped query was observed answering a single aggregate row. The remaining candidate is the
 * hook that turns a picker selection into the request body, so this drives it end to end:
 * pick a dimension, then run.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const querySemanticModel = vi.fn();
const fetchMetrics = vi.fn();
const fetchModelFields = vi.fn();
const fetchDatasetJoins = vi.fn();
const fetchDataResources = vi.fn();

vi.mock('../../../data/semanticModelsApi', async () => {
  const actual = await vi.importActual<typeof import('../../../data/semanticModelsApi')>(
    '../../../data/semanticModelsApi',
  );
  return { ...actual, querySemanticModel: (...a: unknown[]) => querySemanticModel(...a) };
});
vi.mock('../../../data/metricsApi', () => ({
  fetchMetrics: (...a: unknown[]) => fetchMetrics(...a),
}));
vi.mock('../../../data/semanticModelFieldsApi', async () => {
  const actual = await vi.importActual<typeof import('../../../data/semanticModelFieldsApi')>(
    '../../../data/semanticModelFieldsApi',
  );
  return {
    ...actual,
    fetchModelFields: (...a: unknown[]) => fetchModelFields(...a),
  };
});
vi.mock('../../../data/joinsApi', () => ({
  fetchDatasetJoins: (...a: unknown[]) => fetchDatasetJoins(...a),
}));
vi.mock('../../../data/dataResourcesApi', () => ({
  fetchDataResources: (...a: unknown[]) => fetchDataResources(...a),
}));
vi.mock('./useSemanticModelDetail', () => ({
  useSemanticModelDetail: () => ({
    model: {
      id: 'm1',
      name: 'Stock',
      access_mode: 'public',
      dataset_ids: ['ds_fact'],
      datasets: [{ id: 'ds_fact', name: 'daily_basic' }],
    },
    allDatasets: [{ id: 'ds_fact', kind: 'table', display_name: 'daily_basic' }],
  }),
}));

import { useModelPlayground } from './useModelPlayground';

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/x']}>{children}</MemoryRouter>
);

const FIELD = {
  id: 'f_ts_code',
  name: 'ts_code',
  dataset_id: 'ds_fact',
  semantic_model_id: 'm1',
  datatype: 'string',
};

beforeEach(() => {
  querySemanticModel.mockReset().mockResolvedValue({
    sql: 'SELECT ...',
    columns: ['ts_code', 'value'],
    rows: [{ ts_code: 'A', value: 1 }],
    row_count: 1,
    capped: false,
    duration_ms: 1,
  });
  fetchMetrics.mockReset().mockResolvedValue({
    items: [{ id: 'mt1', name: 'pe', base_dataset_id: 'ds_fact', joins: [], expression: {} }],
    total: 1,
  });
  fetchModelFields.mockReset().mockResolvedValue({ items: [FIELD], total: 1 });
  fetchDatasetJoins.mockReset().mockResolvedValue({ items: [], total: 0 });
  fetchDataResources.mockReset().mockResolvedValue({ items: [], total: 0 });
});

describe('picking a dimension then running', () => {
  it('sends group_by in the request body', async () => {
    const { result } = renderHook(() => useModelPlayground(), { wrapper });

    await waitFor(() => expect(result.current.spec).not.toBeNull());

    act(() => {
      result.current.toggleGroup(FIELD as never);
    });
    expect(result.current.spec?.group_by).toHaveLength(1);
    expect(result.current.spec?.group_by[0].field).toBe(FIELD.id);

    await act(async () => {
      await result.current.handleRun();
    });

    expect(querySemanticModel).toHaveBeenCalledTimes(1);
    const body = querySemanticModel.mock.calls[0][1] as { group_by?: { field: string }[] };
    expect(body.group_by).toEqual([{ field: FIELD.id, granularity: null }]);
  });
});
