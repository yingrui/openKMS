import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import i18n from '../../i18n/config';
import { ReportMetric } from './ReportMetric';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('ReportMetric', () => {
  it('shows the number formatted, with the label it was given', () => {
    render(
      <ReportMetric
        view={{ kind: 'metric', column: 'count', label: 'Rows (all time)' }}
        rows={[{ count: 1007340 }]}
      />,
    );
    expect(screen.getByText('1,007,340')).toBeInTheDocument();
    expect(screen.getByText('Rows (all time)')).toBeInTheDocument();
  });

  it('names the column when no label is given, and rounds to two decimals', () => {
    render(<ReportMetric view={{ kind: 'metric', column: 'avg_pe', label: null }} rows={[{ avg_pe: 62.5349 }]} />);
    expect(screen.getByText('62.53')).toBeInTheDocument();
    expect(screen.getByText('avg_pe')).toBeInTheDocument();
  });

  it('keeps a value that is not a number as it came, and a dash for a missing one', () => {
    const { rerender } = render(
      <ReportMetric view={{ kind: 'metric', column: 'as_of', label: null }} rows={[{ as_of: '2026-10-09' }]} />,
    );
    expect(screen.getByText('2026-10-09')).toBeInTheDocument();

    rerender(<ReportMetric view={{ kind: 'metric', column: 'avg_pe', label: null }} rows={[{ avg_pe: null }]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
