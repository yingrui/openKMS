import { describe, expect, it } from 'vitest';
import type { QualityRunResponse } from '../../data/qualityApi';
import { readRun } from './qualityRunResult';

const run = (over: Partial<QualityRunResponse>): QualityRunResponse => ({
  id: 'r',
  rule_id: 'rule',
  status: 'passed',
  checked_count: 0,
  failed_count: 0,
  detail: null,
  error_message: null,
  created_at: '2026-10-16T00:00:00Z',
  ...over,
});

describe('readRun', () => {
  it('reads a freshness run as the date it found and the age it allows', () => {
    expect(
      readRun(run({ detail: { latest: '2026-10-09', max_age_days: 30 } }), 'freshness'),
    ).toEqual({ kind: 'freshness', latest: '2026-10-09', maxAgeDays: 30 });
  });

  it('reads an absent date as absent — including the "None" old runs recorded', () => {
    // The backend used to store `str(None)`; history outlives a shape fix, so both are null here.
    expect(readRun(run({ status: 'failed', detail: { latest: 'None', max_age_days: 7 } }), 'freshness'))
      .toEqual({ kind: 'freshness', latest: null, maxAgeDays: 7 });
    expect(readRun(run({ status: 'failed', detail: {} }), 'freshness')).toEqual({
      kind: 'freshness',
      latest: null,
      maxAgeDays: null,
    });
  });

  it('reads a sql run as the count of violating rows only — it never claims a checked count', () => {
    expect(readRun(run({ status: 'failed', checked_count: null, failed_count: 178_222 }), 'sql')).toEqual({
      kind: 'sql',
      failed: 178_222,
    });
  });

  it('reads the declarative rules as checked vs failed', () => {
    expect(readRun(run({ status: 'failed', checked_count: 725_192, failed_count: 51_425 }), 'range')).toEqual({
      kind: 'counts',
      checked: 725_192,
      failed: 51_425,
    });
  });

  it('reports an error as an error, whatever the rule type', () => {
    expect(
      readRun(run({ status: 'error', error_message: 'column "high" does not exist' }), 'sql'),
    ).toEqual({ kind: 'error' });
  });
});
