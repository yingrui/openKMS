import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../i18n/config';
import { JobArgsCard } from './JobArgsCard';

/**
 * One card for every task: a known task gets its rows ordered and worded, an unknown one gets its arguments as they are.
 * The point is that adding a task needs no new card.
 */
function renderCard(taskName: string, args: Record<string, unknown>) {
  return render(
    <MemoryRouter>
      <JobArgsCard taskName={taskName} queueName="default" args={args} />
    </MemoryRouter>,
  );
}

describe('JobArgsCard', () => {
  it('describes an evaluation run in the terms a reader uses', () => {
    renderCard('run_evaluation', {
      evaluation_name: '量化交易 · 问数测试集',
      evaluation_id: 'ev-1',
      evaluation_type: 'data_query',
      language: 'zh',
      item_ids: ['a', 'b'],
      run_id: 'run-12345678',
      item_count: 2,
    });
    expect(screen.getByText('run_evaluation')).toBeInTheDocument();
    expect(screen.getByText('量化交易 · 问数测试集')).toBeInTheDocument();
    expect(screen.getByText('a, b')).toBeInTheDocument();
    expect(screen.getByText('data_query')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/evaluations/ev-1?run=run-12345678');
  });

  it('says "all N items" when no subset was chosen', () => {
    renderCard('run_evaluation', { item_ids: null, item_count: 17, evaluation_id: 'ev-1', run_id: 'run-1' });
    expect(screen.getByText(/17/)).toBeInTheDocument();
  });

  it('falls back to the raw arguments for a task it has never heard of', () => {
    renderCard('run_something_new', { knowledge_base_id: 'kb-1', custom_flag: true });
    expect(screen.getByText('custom_flag')).toBeInTheDocument();
    expect(screen.getByText('kb-1')).toBeInTheDocument();
  });
});
