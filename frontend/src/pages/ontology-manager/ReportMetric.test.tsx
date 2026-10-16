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
        view={{ kind: 'metric', column: 'count', label: 'Rows (all time)', trend: null }}
        rows={[{ count: 1007340 }]}
      />,
    );
    expect(screen.getByText('1,007,340')).toBeInTheDocument();
    expect(screen.getByText('Rows (all time)')).toBeInTheDocument();
  });

  it('names the column when no label is given, and rounds to two decimals', () => {
    render(<ReportMetric view={{ kind: 'metric', column: 'avg_pe', label: null, trend: null }} rows={[{ avg_pe: 62.5349 }]} />);
    expect(screen.getByText('62.53')).toBeInTheDocument();
    expect(screen.getByText('avg_pe')).toBeInTheDocument();
  });

  it('keeps a value that is not a number as it came, and a dash for a missing one', () => {
    const { rerender } = render(
      <ReportMetric view={{ kind: 'metric', column: 'as_of', label: null, trend: null }} rows={[{ as_of: '2026-10-09' }]} />,
    );
    expect(screen.getByText('2026-10-09')).toBeInTheDocument();

    rerender(<ReportMetric view={{ kind: 'metric', column: 'avg_pe', label: null, trend: null }} rows={[{ avg_pe: null }]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('ReportMetric as a KPI (with a trend)', () => {
  const MONTHLY = [
    { trade_date: '2026-08-01', avg_pe: 138.28 },
    { trade_date: '2026-09-01', avg_pe: 184.01 },
    { trade_date: '2026-10-01', avg_pe: 173.05 },
  ];
  const KPI = { kind: 'metric', column: 'avg_pe', label: '平均 pe_ttm', trend: { x: 'trade_date' } } as const;

  it('shows the last value, not the first, and the change against the previous one', () => {
    render(<ReportMetric view={KPI} rows={MONTHLY} />);
    expect(screen.getByText('173.05')).toBeInTheDocument();
    expect(screen.queryByText('138.28')).not.toBeInTheDocument();
    // 173.05 against 184.01 → -6% (the previous value is named too)
    expect(screen.getByText(/^-6%$/)).toBeInTheDocument();
    expect(screen.getByText(/vs 184.01/)).toBeInTheDocument();
  });

  it('draws the series it is summarising', () => {
    const { container } = render(<ReportMetric view={KPI} rows={MONTHLY} />);
    expect(container.querySelectorAll('.report-metric__spark-bar')).toHaveLength(3);
  });

  it('says there is no baseline rather than inventing a change', () => {
    render(<ReportMetric view={KPI} rows={[{ trade_date: '2026-10-01', avg_pe: 173.05 }]} />);
    expect(screen.getByText('173.05')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('skips a gap when comparing, and ignores a null value for the headline', () => {
    render(
      <ReportMetric
        view={KPI}
        rows={[
          { trade_date: '2026-08-01', avg_pe: 138.28 },
          { trade_date: '2026-09-01', avg_pe: null },
          { trade_date: '2026-10-01', avg_pe: 173.05 },
        ]}
      />,
    );
    expect(screen.getByText('173.05')).toBeInTheDocument();
    expect(screen.getByText(/vs 138.28/)).toBeInTheDocument();
  });
});
