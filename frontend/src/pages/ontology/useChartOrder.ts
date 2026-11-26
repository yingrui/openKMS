import { useCallback } from 'react';
import { chartKey, type ChartSpec } from './objectSetChartsModel';

/**
 * Moving a chart: one step with the arrows, or onto another chart when dragged.
 *
 * Both are the same operation — the chart ends up at an index — so they live together rather than as two handlers that
 * must agree about what "the list" is.
 */
export function useChartOrder(
  specs: ChartSpec[],
  onChange: (next: ChartSpec[]) => void
): { moveChart: (key: string, target: -1 | 1 | string) => void } {
  const moveChart = useCallback(
    (key: string, target: -1 | 1 | string) => {
      const index = specs.findIndex((spec) => chartKey(spec) === key);
      if (index < 0) return;
      if (typeof target === 'string') {
        /* Dropped onto another chart: take its place, which is what dragging onto a card means. */
        const destination = specs.findIndex((spec) => chartKey(spec) === target);
        if (destination < 0 || destination === index) return;
        const next = [...specs];
        const [moved] = next.splice(index, 1);
        next.splice(destination, 0, moved);
        onChange(next);
        return;
      }
      const destination = index + target;
      if (destination < 0 || destination >= specs.length) return;
      const next = [...specs];
      [next[index], next[destination]] = [next[destination], next[index]];
      onChange(next);
    },
    [onChange, specs]
  );
  return { moveChart };
}
