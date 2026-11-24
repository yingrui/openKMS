import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/config';
import { FunctionEditorListPage } from './FunctionEditorListPage';

/** The list is one table for two authoring modes; `source` is the whole difference, so the request is the contract. */
const fetchOntologyFunctions = vi.fn();
vi.mock('../../data/ontologyFunctionsApi', async () => {
  const actual = await vi.importActual<typeof import('../../data/ontologyFunctionsApi')>(
    '../../data/ontologyFunctionsApi',
  );
  return {
    ...actual,
    fetchOntologyFunctions: (...args: unknown[]) => fetchOntologyFunctions(...args),
  };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const FUNCTION = {
  id: 'fn-1',
  api_name: 'findSimilarComplaint',
  display_name: 'Find similar complaint',
  source: 'code',
  latest_version: 3,
  published_version: 2,
  published_version_id: 'v-2',
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FunctionEditorListPage />
    </MemoryRouter>,
  );
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  fetchOntologyFunctions.mockReset();
  fetchOntologyFunctions.mockResolvedValue({ items: [FUNCTION], total: 1 });
});

describe('FunctionEditorListPage', () => {
  it('asks for code functions on the plain entry', async () => {
    renderAt('/function-editor');
    expect(await screen.findByText('findSimilarComplaint')).toBeInTheDocument();
    expect(fetchOntologyFunctions).toHaveBeenCalledWith({ source: 'code' });
    expect(screen.getByRole('link', { name: 'Create function' })).toBeInTheDocument();
  });

  it('asks for logic functions on the Logic entry and offers no create button', async () => {
    renderAt('/function-editor/logic');
    // The tab and the page title both say it; the title is the heading.
    expect(await screen.findByRole('heading', { name: 'Logic functions' })).toBeInTheDocument();
    expect(fetchOntologyFunctions).toHaveBeenCalledWith({ source: 'logic' });
    // Creating one needs the flow spec + executor; a button that cannot finish is worse than none.
    expect(screen.queryByRole('link', { name: 'Create function' })).not.toBeInTheDocument();
  });

  it('says what the empty Logic list means instead of showing a bare table', async () => {
    fetchOntologyFunctions.mockResolvedValue({ items: [], total: 0 });
    renderAt('/function-editor/logic');
    expect(await screen.findByText(/No Logic functions yet/)).toBeInTheDocument();
  });
});
