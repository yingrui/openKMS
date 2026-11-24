import { useRef, useState } from 'react';
import type { ObjectAggregateChart } from '../../data/ontologyApi';
import { diffCharts, type ChartChange } from './objectSetChartsModel';

export interface ActionOutcome {
  name: string;
  succeeded: number;
  changes: ChartChange[];
}

/**
 * Closing the loop: an action ran, so the numbers on screen are about to become different ones.
 *
 * The charts that were showing are held, the refresh is triggered, and the next load is compared with the held
 * copy. Doing it here rather than in the page keeps the three moving parts — snapshot, refresh, comparison — in one
 * place, and they only make sense together.
 */
export function useObjectSetOutcome() {
  const last = useRef<ObjectAggregateChart[]>([]);
  const pending = useRef<{ charts: ObjectAggregateChart[]; name: string; succeeded: number } | null>(
    null
  );
  const [result, setResult] = useState<ActionOutcome | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const capture = (name: string, succeeded: number) => {
    /* With no charts on screen (the results perspective) there is nothing to compare, and an empty snapshot would
       report "nothing changed" — the wrong answer to a question nobody asked. */
    if (last.current.length === 0) return;
    pending.current = { charts: last.current, name, succeeded };
    setRefreshKey((key) => key + 1);
  };

  const onLoaded = (charts: ObjectAggregateChart[]) => {
    const waiting = pending.current;
    if (waiting) {
      pending.current = null;
      setResult({
        name: waiting.name,
        succeeded: waiting.succeeded,
        changes: diffCharts(waiting.charts, charts),
      });
    }
    last.current = charts;
  };

  return {
    result,
    refreshKey,
    capture,
    onLoaded,
    dismiss: () => setResult(null),
  };
}
