import { describe, expect, it } from 'vitest';
import type { DashboardRun } from '../../data/dashboardsApi';
import { runHealth } from './dashboardRuns';

const run = (ranAt: string, failed: number): DashboardRun => ({
  id: ranAt,
  ran_at: ranAt,
  duration_ms: 10,
  reports: 3,
  failed,
  ran_by_name: null,
});

describe('runHealth', () => {
  it('points at the newest run where nothing failed, and counts the failures since', () => {
    const runs = [
      run('2026-10-16T10:00:00Z', 2), // newest: failed
      run('2026-10-16T09:00:00Z', 1), // failed
      run('2026-10-15T09:00:00Z', 0), // the last clean one
      run('2026-10-14T09:00:00Z', 3), // older failures are not "since" anything
    ];
    expect(runHealth(runs)).toEqual({
      lastSuccessAt: '2026-10-15T09:00:00Z',
      consecutiveFailures: 2,
    });
  });

  it('is healthy when the newest run is clean', () => {
    expect(runHealth([run('2026-10-16T10:00:00Z', 0), run('2026-10-15T10:00:00Z', 1)])).toEqual({
      lastSuccessAt: '2026-10-16T10:00:00Z',
      consecutiveFailures: 0,
    });
  });

  it('says there has never been a success when every run failed', () => {
    expect(runHealth([run('2026-10-16T10:00:00Z', 1), run('2026-10-15T10:00:00Z', 2)])).toEqual({
      lastSuccessAt: null,
      consecutiveFailures: 2,
    });
  });

  it('says nothing at all about an empty history', () => {
    expect(runHealth([])).toEqual({ lastSuccessAt: null, consecutiveFailures: 0 });
  });
});
