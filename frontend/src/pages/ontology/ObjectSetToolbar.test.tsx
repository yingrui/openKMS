import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../../i18n/config';
import { ObjectSetChartAdd } from './ObjectSetChartAdd';
import { ObjectSetCharts } from './ObjectSetCharts';
import { ObjectSetToolbar } from './ObjectSetToolbar';

const ADD = /add chart|添加图表/i;
const OPTIONS = [
  { value: 'region', label: 'region' },
  { value: 'channel_type', label: 'channel_type' },
];

/**
 * Where "add chart" lives has been wrong twice — a card in the grid, then a tile the size of a card in the grid — and
 * both times the chart area stopped being a chart area. The rule: adding a chart is an action about the section, so it
 * sits with the exploration's controls, and the grid contains charts.
 */
describe('adding a chart', () => {
  it('sits in the toolbar, beside the exploration controls', () => {
    const { container } = render(
      <ObjectSetToolbar
        search=""
        onSearch={() => undefined}
        pivots={[]}
        canPivot
        pivotBlockedReason=""
        onPivot={() => undefined}
        canUndo={false}
        canRedo={false}
        onUndo={() => undefined}
        onRedo={() => undefined}
        addable={OPTIONS}
        onAddChart={() => undefined}
      />
    );
    const toolbar = container.querySelector('.object-set-toolbar');
    expect(toolbar).not.toBeNull();
    expect(within(toolbar as HTMLElement).getByRole('button', { name: ADD })).toBeInTheDocument();
  });

  it('is not inside the chart area', () => {
    render(
      <ObjectSetCharts
        typeId="t"
        search=""
        filters={[]}
        specs={[]}
        options={OPTIONS}
        onPick={() => undefined}
      />
    );
    expect(screen.queryByRole('button', { name: ADD })).toBeNull();
  });

  it('opens a searchable list, and nothing when every property is charted', () => {
    const { container, rerender } = render(
      <ObjectSetChartAdd options={OPTIONS} onAdd={() => undefined} />
    );
    expect(screen.queryByRole('menu')).toBeNull();
    rerender(<ObjectSetChartAdd options={[]} onAdd={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
