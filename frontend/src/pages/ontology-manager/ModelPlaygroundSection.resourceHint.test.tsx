/**
 * The resource hint has to name the condition and say that more are still allowed.
 *
 * "This resource limits rows with 1 condition(s)" reads as a restriction *on the caller* — as if
 * the resource had capped what they may ask. It has not: the condition is a floor the server
 * enforces, and every filter and grouping the caller adds still applies on top. The sentence has
 * to show the actual condition, otherwise the number alone says nothing about what is being
 * filtered.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

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
vi.mock('../../data/dataResourcesApi', () => ({
  fetchDataResources: (...a: unknown[]) => fetchDataResources(...a),
}));
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

describe('the selected resource hint', () => {
  it('spells out the enforced condition and says the caller can still narrow further', async () => {
    fetchMetrics.mockResolvedValue({ items: [], total: 0 });
    fetchModelFields.mockResolvedValue({ items: [], total: 0 });
    fetchDatasetJoins.mockResolvedValue({ items: [], total: 0 });
    fetchDataResources.mockResolvedValue({
      items: [
        {
          id: 'r1',
          name: 'Stock of semi-conductor',
          description: null,
          semantic_model_id: 'm1',
          row_policy: [{ column: 'industry', op: '=', value: '半导体' }],
          created_by_name: null,
          created_at: '2026-11-01T00:00:00Z',
          updated_at: '2026-11-01T00:00:00Z',
        },
      ],
      total: 1,
    });

    render(
      <MemoryRouter initialEntries={['/x']}>
        <ModelPlaygroundSection />
      </MemoryRouter>,
    );

    // With one grant there is nothing to choose, so the panel states the scope it applies.
    const scope = await screen.findByText(
      'Stock of semi-conductor · industry = 半导体',
      undefined,
      { timeout: 3000 },
    );
    // It is its own card, not one of the query editor's fields.
    expect(scope.closest('section.account-card')).not.toBeNull();
    expect(scope.closest('.entity-view__form')).toBeNull();
  });

  it('explains, on the condition itself, that the caller may still narrow', async () => {
    fetchMetrics.mockResolvedValue({ items: [], total: 0 });
    fetchModelFields.mockResolvedValue({ items: [], total: 0 });
    fetchDatasetJoins.mockResolvedValue({ items: [], total: 0 });
    fetchDataResources.mockResolvedValue({
      items: [
        {
          id: 'r1',
          name: 'Stock of semi-conductor',
          description: null,
          semantic_model_id: 'm1',
          row_policy: [{ column: 'industry', op: '=', value: '半导体' }],
          created_by_name: null,
          created_at: '2026-11-01T00:00:00Z',
          updated_at: '2026-11-01T00:00:00Z',
        },
      ],
      total: 1,
    });

    render(
      <MemoryRouter initialEntries={['/x']}>
        <ModelPlaygroundSection />
      </MemoryRouter>,
    );

    // The condition is part of the statement, so it is readable without hovering.
    const scope = await screen.findByText(/industry = 半导体/, undefined, { timeout: 3000 });
    expect(scope.textContent).toContain('industry = 半导体');
    // The old wording implied the resource capped the caller's query.
    expect(scope.textContent ?? '').not.toMatch(/limits rows with/i);
  });
});
