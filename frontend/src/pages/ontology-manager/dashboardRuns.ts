/**
 * What a run history is *for*, as two numbers.
 *
 * A tile's "as of" is its last **attempt** — it is updated even when the run failed — so the two
 * questions a history alone can answer are "when did this last actually work?" and "has it been
 * failing since?". Both are derivable from the run list; neither should require reading it.
 */

import type { DashboardRun } from '../../data/dashboardsApi';

export interface RunHealth {
  /** The newest run in which nothing failed — `null` when there has never been one. */
  lastSuccessAt: string | null;
  /** How many of the newest runs failed, from the top until the first clean one. */
  consecutiveFailures: number;
}

export function runHealth(runs: DashboardRun[]): RunHealth {
  let consecutiveFailures = 0;
  for (const run of runs) {
    if (run.failed > 0) {
      consecutiveFailures += 1;
      continue;
    }
    return { lastSuccessAt: run.ran_at, consecutiveFailures };
  }
  // Every run so far failed, or there are none: there is no successful run to point at.
  return { lastSuccessAt: null, consecutiveFailures };
}
