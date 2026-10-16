import { render } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import i18n from '../../i18n/config';
import { ExplorerChart } from './ExplorerChart';
import { chartSeries, parseView, viewFits } from './reportView';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const ROWS = [
  { trade_date: '2026-01-01', count: 109219, avg_pe: '148.70' },
  { trade_date: '2026-02-01', count: 76572, avg_pe: '149.47' },
];

function draw(spec: unknown) {
  const view = parseView(spec)!;
  expect(viewFits(view, ['trade_date', 'count', 'avg_pe'])).toBe(true);
  return render(
    <ExplorerChart spec={view as never} series={chartSeries(ROWS, view as never)} />,
  );
}

/**
 * A smoke test, not a picture: jsdom has no layout, so recharts draws nothing measurable. What it
 * *can* catch is a spec the chart accepts but the library cannot draw — a combo with two axes is
 * exactly that kind of wiring (a wrong `yAxisId` throws).
 */
describe('ExplorerChart', () => {
  it('draws a line, a bar, and a combo without throwing', () => {
    for (const spec of [
      { kind: 'chart', type: 'line', x: 'trade_date', y: ['count'] },
      { kind: 'chart', type: 'bar', x: 'trade_date', y: ['count'] },
      {
        kind: 'chart',
        type: 'combo',
        x: 'trade_date',
        y: ['count'],
        lines: ['avg_pe'],
      },
    ]) {
      const { container, unmount } = draw(spec);
      expect(container.querySelector('.report-chart')).not.toBeNull();
      unmount();
    }
  });
});
