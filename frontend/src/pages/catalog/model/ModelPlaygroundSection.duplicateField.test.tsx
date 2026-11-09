/**
 * Two columns can share a name; the picker must not show two identical rows.
 *
 * A model's fact and dimension tables both have `ts_code`. Listing them as two rows reading
 * `ts_code / String` makes them indistinguishable — and picking "the other one" changes which
 * dataset the grouping happens on, which the user cannot see.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const fetchMetrics = vi.fn();
const fetchModelFields = vi.fn();
const fetchDatasetJoins = vi.fn();
const fetchDataResources = vi.fn();

vi.mock('../../../data/semanticModelsApi', async () => {
  const actual = await vi.importActual<typeof import('../../../data/semanticModelsApi')>(
    '../../../data/semanticModelsApi',
  );
  return { ...actual, querySemanticModel: vi.fn() };
});
vi.mock('../../../data/metricsApi', async () => {
  const actual = await vi.importActual<typeof import('../../../data/metricsApi')>(
    '../../../data/metricsApi',
  );
  return { ...actual, fetchMetrics: (...a: unknown[]) => fetchMetrics(...a) };
});
vi.mock('../../../data/semanticModelFieldsApi', async () => {
  const actual = await vi.importActual<typeof import('../../../data/semanticModelFieldsApi')>(
    '../../../data/semanticModelFieldsApi',
  );
  return { ...actual, fetchModelFields: (...a: unknown[]) => fetchModelFields(...a) };
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
      dataset_ids: ['ds_fact', 'ds_dim'],
      datasets: [
        { id: 'ds_fact', name: 'daily_basic' },
        { id: 'ds_dim', name: 'stock_basic' },
      ],
    },
    allDatasets: [
      { id: 'ds_fact', kind: 'table', display_name: 'daily_basic' },
      { id: 'ds_dim', kind: 'table', display_name: 'stock_basic' },
    ],
  }),
}));

import { ModelPlaygroundSection } from './ModelPlaygroundSection';

const FIELDS = [
  { id: 'f_ts_fact', name: 'ts_code', dataset_id: 'ds_fact', semantic_model_id: 'm1', datatype: 'String', dimension: null },
  { id: 'f_ts_dim', name: 'ts_code', dataset_id: 'ds_dim', semantic_model_id: 'm1', datatype: 'String', dimension: null },
  { id: 'f_close', name: 'close', dataset_id: 'ds_fact', semantic_model_id: 'm1', datatype: 'Float', dimension: null },
];

describe('the dimension picker with a repeated column name', () => {
  it('says which table each same-named column belongs to', async () => {
    fetchMetrics.mockResolvedValue({
      items: [
        {
          id: 'mt1',
          name: '平均市盈率',
          base_dataset_id: 'ds_fact',
          // The dimension is reachable, so its `ts_code` is a legal grouping key too.
          joins: ['j1'],
          expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'AVG(pe)' }] },
        },
      ],
      total: 1,
    });
    fetchModelFields.mockResolvedValue({ items: FIELDS, total: 3 });
    fetchDatasetJoins.mockResolvedValue({
      items: [
        {
          id: 'j1',
          from_dataset_id: 'ds_fact',
          to_dataset_id: 'ds_dim',
          from_columns: ['ts_code'],
          to_columns: ['ts_code'],
        },
      ],
      total: 1,
    });
    fetchDataResources.mockResolvedValue({ items: [], total: 0 });

    render(
      <MemoryRouter initialEntries={['/x']}>
        <ModelPlaygroundSection />
      </MemoryRouter>,
    );

    // Advance: the two `ts_code` rows must be distinguishable by their table.
    const input = await screen.findByRole('combobox', { name: /group by/i }, { timeout: 3000 });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ts_code' } });

    // Scope to this picker's listbox: the page also renders a metric select.
    const menu = document.getElementById('playground-field-menu');
    expect(menu).not.toBeNull();
    const options = Array.from(menu!.querySelectorAll('[role="option"]'));
    const labels = options.map((o) => o.textContent ?? '');
    expect(labels).toHaveLength(2);
    expect(labels[0]).not.toBe(labels[1]);
    expect(labels.some((l) => l.includes('daily_basic'))).toBe(true);
    expect(labels.some((l) => l.includes('stock_basic'))).toBe(true);
  });
});
