/**
 * The real page, driven the way a person drives it: pick a dimension, press Run, read the SQL.
 *
 * A hook-level test of `toggleGroup` + `handleRun` passes while the page still answered a single
 * aggregate row. That gap is the reason this test renders `ModelPlaygroundSection` itself: only
 * the component can show that the chip the user sees and the payload the server receives agree.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const querySemanticModel = vi.fn();
const fetchMetrics = vi.fn();
const fetchModelFields = vi.fn();
const fetchDatasetJoins = vi.fn();
const fetchDataResources = vi.fn();

vi.mock('../../data/semanticModelsApi', async () => {
  const actual = await vi.importActual<typeof import('../../data/semanticModelsApi')>(
    '../../data/semanticModelsApi',
  );
  return { ...actual, querySemanticModel: (...a: unknown[]) => querySemanticModel(...a) };
});
vi.mock('../../data/metricsApi', async () => {
  const actual = await vi.importActual<typeof import('../../data/metricsApi')>(
    '../../data/metricsApi',
  );
  return { ...actual, fetchMetrics: (...a: unknown[]) => fetchMetrics(...a) };
});
vi.mock('../../data/semanticModelFieldsApi', async () => {
  const actual = await vi.importActual<typeof import('../../data/semanticModelFieldsApi')>(
    '../../data/semanticModelFieldsApi',
  );
  return { ...actual, fetchModelFields: (...a: unknown[]) => fetchModelFields(...a) };
});
vi.mock('../../data/joinsApi', () => ({
  fetchDatasetJoins: (...a: unknown[]) => fetchDatasetJoins(...a),
}));
vi.mock('../../data/dataResourcesApi', () => ({
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

import { ModelPlaygroundSection } from './ModelPlaygroundSection';

const FIELD = {
  id: 'f_ts_code',
  name: 'ts_code',
  dataset_id: 'ds_fact',
  semantic_model_id: 'm1',
  datatype: 'string',
  dimension: null,
};

beforeEach(() => {
  querySemanticModel.mockReset().mockResolvedValue({
    sql: 'SELECT ts_code, AVG(x) AS value FROM t GROUP BY ts_code',
    columns: ['ts_code', 'value'],
    rows: [{ ts_code: 'A', value: 1 }],
    row_count: 1,
    capped: false,
    duration_ms: 1,
  });
  fetchMetrics.mockReset().mockResolvedValue({
    items: [
      {
        id: 'mt1',
        name: '平均市盈率',
        base_dataset_id: 'ds_fact',
        joins: [],
        expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'AVG(pe)' }] },
      },
    ],
    total: 1,
  });
  fetchModelFields.mockReset().mockResolvedValue({ items: [FIELD], total: 1 });
  fetchDatasetJoins.mockReset().mockResolvedValue({ items: [], total: 0 });
  fetchDataResources.mockReset().mockResolvedValue({ items: [], total: 0 });
});

describe('the Builder page', () => {
  it('sends the picked dimension when Run is pressed right after picking it', async () => {
    render(
      <MemoryRouter initialEntries={['/x']}>
        <ModelPlaygroundSection />
      </MemoryRouter>,
    );

    // Open the dimension picker and choose ts_code.
    const picker = await screen.findByRole('combobox', { name: /group by/i });
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: 'ts_code' } });

    const option = await screen.findByRole('option', { name: /ts_code/ });
    fireEvent.click(option);

    // Press Run immediately, as the user did.
    fireEvent.click(screen.getByRole('button', { name: /run/i }));

    await waitFor(() => expect(querySemanticModel).toHaveBeenCalled());
    const body = querySemanticModel.mock.calls[0][1] as { group_by?: unknown[] };
    expect(body.group_by).toEqual([{ field: FIELD.id, granularity: null }]);
  });
});
