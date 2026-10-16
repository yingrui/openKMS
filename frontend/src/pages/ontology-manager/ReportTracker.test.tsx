import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import i18n from '../../i18n/config';
import { ReportTracker } from './ReportTracker';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const VIEW = { kind: 'tracker', column: 'count', x: 'trade_date', label: 'Rows per month' } as const;
const ROWS = [
  { trade_date: '2026-01-01', count: 30724 },
  { trade_date: '2026-02-01', count: 15362 },
  { trade_date: '2026-03-01', count: 33251 },
];

describe('ReportTracker', () => {
  it('gives one block per row, the largest at full intensity', () => {
    const { container } = render(<ReportTracker view={VIEW} rows={ROWS} />);
    const cells = container.querySelectorAll('.report-tracker__cell');
    expect(cells).toHaveLength(3);
    // 33251 is the largest → 1.0 → 0.25 + 0.75; 15362 is about half
    expect((cells[2] as HTMLElement).style.opacity).toBe('1');
    expect(Number((cells[1] as HTMLElement).style.opacity)).toBeLessThan(0.7);
  });

  it('puts the value on hover and the range at the ends', () => {
    const { container } = render(<ReportTracker view={VIEW} rows={ROWS} />);
    expect(screen.getByTitle('2026-03-01: 33,251')).toBeInTheDocument();
    const ends = container.querySelectorAll('.report-tracker__ends span');
    expect([...ends].map((e) => e.textContent)).toEqual(['2026-01-01', '2026-03-01']);
  });

  it('drops non-numeric rows and says when the strip was cut', () => {
    const many = Array.from({ length: 70 }, (_, i) => ({ trade_date: `d${i}`, count: i + 1 }));
    render(<ReportTracker view={VIEW} rows={[...many, { trade_date: 'x', count: null }]} />);
    expect(document.querySelectorAll('.report-tracker__cell')).toHaveLength(60);
    expect(screen.getByText(/Showing the last 60 only/)).toBeInTheDocument();
  });

  it('renders an empty strip for a result with nothing numeric', () => {
    const { container } = render(<ReportTracker view={VIEW} rows={[{ trade_date: 'd', count: '—' }]} />);
    expect(container.querySelectorAll('.report-tracker__cell')).toHaveLength(0);
    expect(screen.getByText('Rows per month')).toBeInTheDocument();
  });
});
