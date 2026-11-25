import type { ChartSpec } from './objectSetChartsModel';

export interface Snapshot {
  /** The URL's own state: conditions, sort, comparison, the saved exploration being viewed. */
  query: string;
  charts: ChartSpec[] | null;
  columns: string[];
}

/** How many steps back an exploration can be undone — the same order of magnitude as Palantir's five. */
export const HISTORY_LIMIT = 10;

/** Equality on the snapshot, because the same state must not fill the history with repeats. */
export function sameSnapshot(a: Snapshot | null, b: Snapshot | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.query === b.query &&
    JSON.stringify(a.charts ?? null) === JSON.stringify(b.charts ?? null) &&
    JSON.stringify(a.columns) === JSON.stringify(b.columns)
  );
}

export function pushSnapshot(past: Snapshot[], snapshot: Snapshot, limit = HISTORY_LIMIT): Snapshot[] {
  if (sameSnapshot(past[past.length - 1] ?? null, snapshot)) return past;
  return [...past, snapshot].slice(-limit);
}
