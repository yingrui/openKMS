/**
 * More than one granted resource: the picker must not hide the choice.
 *
 * With a single resource a dropdown reads fine. With several it stops working for the job:
 *
 * * only the selected one's condition is visible, so comparing two scopes means flipping the
 *   dropdown and re-reading from memory;
 * * a native select hides the alternatives behind a click, which is the one thing that matters
 *   when the whole point is "which slice am I allowed to ask about";
 * * a long condition next to a long name overflows the row.
 *
 * A restricted model with several grants is the normal case for an analyst, not an edge case.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const fetchMetrics = vi.fn();
const fetchModelFields = vi.fn();
const fetchDatasetJoins = vi.fn();
const fetchDataResources = vi.fn();

vi.mock('../../data/semanticModelsApi', async () => {
  const actual = await vi.importActual<typeof import('../../data/semanticModelsApi')>(
    '../../data/semanticModelsApi',
  );
  return { ...actual, querySemanticModel: vi.fn() };
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
vi.mock('../../data/dataResourcesApi', async () => {
  const actual = await vi.importActual<typeof import('../../data/dataResourcesApi')>(
    '../../data/dataResourcesApi',
  );
  return { ...actual, fetchDataResources: (...a: unknown[]) => fetchDataResources(...a) };
});
vi.mock('./useSemanticModelDetail', () => ({
  useSemanticModelDetail: () => ({
    model: {
      id: 'm1',
      name: 'Stock',
      access_mode: 'restricted',
      dataset_ids: ['ds_fact'],
      datasets: [{ id: 'ds_fact', name: 'daily_basic' }],
    },
    allDatasets: [{ id: 'ds_fact', kind: 'table', display_name: 'daily_basic' }],
  }),
}));

import { ModelPlaygroundSection } from './ModelPlaygroundSection';

const resource = (id: string, name: string, column: string, value: string) => ({
  id,
  name,
  description: null,
  semantic_model_id: 'm1',
  row_policy: [{ column, op: '=', value }],
  created_by_name: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
});

beforeEach(() => {
  fetchMetrics.mockResolvedValue({ items: [], total: 0 });
  fetchModelFields.mockResolvedValue({ items: [], total: 0 });
  fetchDatasetJoins.mockResolvedValue({ items: [], total: 0 });
});

describe('several granted resources', () => {
  it('shows every scope at once so they can be compared', async () => {
    fetchDataResources.mockResolvedValue({
      items: [
        resource('r1', '华东半导体', 'industry', '半导体'),
        resource('r2', '华北银行', 'industry', '银行'),
        resource('r3', '华东半导体', 'area', '华东'),
      ],
      total: 3,
    });

    render(
      <MemoryRouter initialEntries={['/x']}>
        <ModelPlaygroundSection />
      </MemoryRouter>,
    );

    // Every resource is on screen, not hidden behind a dropdown.
    const names = await screen.findAllByText('华东半导体', undefined, { timeout: 3000 });
    // Two grants share a name on purpose: the *condition* is what distinguishes them, and both
    // must be visible together or the choice is a guess.
    expect(names).toHaveLength(2);
    expect(screen.getByText('华北银行')).toBeInTheDocument();

    expect(screen.getByText('industry = 半导体')).toBeInTheDocument();
    expect(screen.getByText('industry = 银行')).toBeInTheDocument();
    expect(screen.getByText('area = 华东')).toBeInTheDocument();
  });

  it('picks a scope by clicking it, and marks it selected', async () => {
    fetchDataResources.mockResolvedValue({
      items: [
        resource('r1', '华东半导体', 'industry', '半导体'),
        resource('r2', '华北银行', 'industry', '银行'),
      ],
      total: 2,
    });

    render(
      <MemoryRouter initialEntries={['/x']}>
        <ModelPlaygroundSection />
      </MemoryRouter>,
    );

    const second = await screen.findByRole('radio', { name: /华北银行/ }, { timeout: 3000 });
    expect(screen.getByRole('radio', { name: /华东半导体/ })).toBeChecked();
    expect(second).not.toBeChecked();

    fireEvent.click(second);
    expect(second).toBeChecked();
    expect(screen.getByRole('radio', { name: /华东半导体/ })).not.toBeChecked();
  });
});
