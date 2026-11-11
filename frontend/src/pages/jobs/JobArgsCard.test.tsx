import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '../../i18n/config';
import { JobArgsCard } from './JobArgsCard';

/**
 * One card for every task, in the vocabulary the job itself carries: the argument names are the API's names, so a reader
 * comparing the card with the worker log or the request sees the same words.
 */
function renderCard(taskName: string, args: Record<string, unknown>) {
  return render(<JobArgsCard taskName={taskName} queueName="default" args={args} />);
}

describe('JobArgsCard', () => {
  it('shows the task, the queue and every argument by name', () => {
    renderCard('run_evaluation', {
      evaluation_id: 'ev-1',
      evaluation_name: '量化交易 · 问数测试集',
      item_ids: ['a', 'b'],
      item_count: 2,
      language: 'zh',
    });
    expect(screen.getByText('task_name')).toBeInTheDocument();
    expect(screen.getByText('queue_name')).toBeInTheDocument();
    expect(screen.getByText('evaluation_name')).toBeInTheDocument();
    expect(screen.getByText('量化交易 · 问数测试集')).toBeInTheDocument();
    expect(screen.getByText('a, b')).toBeInTheDocument();
  });

  it('shows a missing value as null rather than as a sentence', () => {
    renderCard('run_evaluation', { item_ids: null });
    expect(screen.getByText('null')).toBeInTheDocument();
  });

  it('needs no per-task knowledge: any task renders the same way', () => {
    renderCard('run_something_new', { custom_flag: true });
    expect(screen.getByText('custom_flag')).toBeInTheDocument();
    expect(screen.getByText('true')).toBeInTheDocument();
  });
});
