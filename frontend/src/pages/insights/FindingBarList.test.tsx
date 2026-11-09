import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import i18n from '../../i18n/config';
import { FindingBarList } from './FindingBarList';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const VIEW = { kind: 'bar_list', column: 'value', labelColumn: 'industry' } as const;
const ROWS = [
  { industry: '保险', value: 6.65 },
  { industry: '银行', value: 6.07 },
  { industry: '路桥', value: 19.25 },
];

describe('FindingBarList', () => {
  it('ranks by value, showing each one and its share of the listed total', () => {
    render(<FindingBarList view={VIEW} rows={ROWS} />);
    const labels = screen.getAllByTitle(/银行|保险|路桥/).map((el) => el.textContent);
    expect(labels).toEqual(['路桥', '保险', '银行']); // descending, whatever order the rows came in
    expect(screen.getByText('19.25')).toBeInTheDocument();
    // 19.25 of 32.0 → 60%
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('says when the list was cut short', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ industry: `g${i}`, value: i }));
    render(<FindingBarList view={VIEW} rows={many} />);
    expect(screen.getByText(/Showing the top 10 only/)).toBeInTheDocument();
  });

  it('renders nothing rather than broken bars when no row is numeric', () => {
    render(<FindingBarList view={{ kind: 'bar_list', column: 'value', labelColumn: null }} rows={[{ value: '—' }]} />);
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });
});
