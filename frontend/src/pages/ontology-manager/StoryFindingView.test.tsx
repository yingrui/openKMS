import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';
import i18n from '../../i18n/config';
import { StoryFindingView } from './StoryFindingView';
import type { StoryFinding } from '../../data/storiesApi';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const DATASETS = [
  {
    id: 'd1',
    display_name: null,
    schema_name: 'tushare',
    table_name: 'daily_basic',
  },
] as never;

function renderFinding(finding: StoryFinding) {
  return render(
    <MemoryRouter>
      <StoryFindingView finding={finding} datasets={DATASETS} models={[]} />
    </MemoryRouter>,
  );
}

const BASE: StoryFinding = {
  title: 'Finding',
  source_kind: 'dataset',
  dataset_id: 'd1',
  query: {},
  columns: ['industry', 'value', 'trade_date', 'count'],
  rows: [
    { industry: '银行', value: 6.07, trade_date: '2026-01-01T00:00:00+00:00', count: 1 },
    { industry: '保险', value: 6.65, trade_date: '2026-02-01T00:00:00+00:00', count: 2 },
  ],
  total: 2,
  ran_at: '2026-10-16T00:00:00Z',
};

describe('StoryFindingView', () => {
  it('draws a metric as a number, not a table', () => {
    renderFinding({ ...BASE, view: { kind: 'metric', column: 'value', label: '平均 pe_ttm' } });
    expect(screen.getByText('6.07')).toBeInTheDocument();
    expect(screen.getByText('平均 pe_ttm')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('draws a ranking as a list, labelled by the other column', () => {
    renderFinding({ ...BASE, view: { kind: 'bar_list', column: 'value', label_column: 'industry' } });
    expect(screen.getByTitle('保险')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('falls back to the table when the result cannot satisfy the view', () => {
    renderFinding({ ...BASE, view: { kind: 'metric', column: 'gone' } });
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows the classified failure instead of rows, and never both', () => {
    renderFinding({
      ...BASE,
      rows: [],
      error: { code: 'REPORT_SOURCE_FORBIDDEN', message: 'You do not have access to this finding\u2019s source data.', kind: 'request' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('You do not have access');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('says a finding has not run, and that a run returned nothing', () => {
    const { rerender } = renderFinding({ ...BASE, ran_at: null, rows: [] });
    expect(screen.getByText(/has not been run yet/)).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <StoryFindingView finding={{ ...BASE, rows: [] }} datasets={DATASETS} models={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/returned no rows/)).toBeInTheDocument();
  });

  it('offers the table beside a drawn view, and switches to it', () => {
    const { container } = renderFinding({ ...BASE, view: { kind: 'metric', column: 'value' } });
    expect(container.querySelector('.finding-metric')).not.toBeNull();
    // the toggle's label (English, since the test pins the language)
    fireEvent.click(screen.getByTitle('Table'));
    expect(container.querySelector('.finding-metric')).toBeNull();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('says when the numbers are from, with the exact instant on hover', () => {
    renderFinding({ ...BASE, ran_at: '2026-10-16T00:00:00Z' });
    // The bucket is relative, so assert its *shape* rather than a count that would age — and assert
    // that it is words: the label looked up `age_minutes` while the locale had `ageMinutes`, so the
    // reader saw the raw key, and a looser assertion ("starts with `as of`") passed anyway.
    const asOf = screen.getByText(/^as of /i);
    expect(asOf).toHaveTextContent(/^as of (just now|\d+ (minute|hour|day)s? ago)$/i);
    expect(asOf.textContent).not.toMatch(/[a-z]+\.[a-z_]+/i);
    expect(asOf).toHaveAttribute('title', expect.stringMatching(/\d{4}/));
  });

  it('names the source, linking into the Catalog', () => {
    renderFinding({ ...BASE });
    const link = screen.getByRole('link', { name: /tushare.daily_basic/ });
    expect(link).toHaveAttribute('href', '/datasets/d1');
  });
});
