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
    expect(
      readRun(
        run({ status: 'failed', checked_count: null, failed_count: 178_222, detail: { value: 178_222, expect: 'zero' } }),
        'sql',
      ),
    ).toEqual({ kind: 'sql', found: 178_222, expect: 'zero', passed: false });
  });

  it('reads a coverage run in its own direction: nothing found is the failure', () => {
    expect(
      readRun(
        run({ status: 'failed', checked_count: null, failed_count: 1, detail: { value: 0, expect: 'nonzero' } }),
        'sql',
      ),
    ).toEqual({ kind: 'sql', found: 0, expect: 'nonzero', passed: false });
    expect(
      readRun(
        run({ status: 'passed', checked_count: null, failed_count: 0, detail: { value: 5, expect: 'nonzero' } }),
        'sql',
      ),
    ).toEqual({ kind: 'sql', found: 5, expect: 'nonzero', passed: true });
  });

  it('falls back to the verdict count for runs recorded before detail.value', () => {
    expect(readRun(run({ status: 'failed', checked_count: null, failed_count: 7 }), 'sql')).toEqual({
      kind: 'sql',
      found: 7,
      expect: 'zero',
      passed: false,
    });
  });

  it('reads the declarative rules as checked vs failed', () => {
    expect(readRun(run({ status: 'failed', checked_count: 725_192, failed_count: 51_425 }), 'range')).toEqual({
      kind: 'counts',
      checked: 725_192,
      failed: 51_425,
    });
  });

  it('findings an error as an error, whatever the rule type', () => {
    expect(
      readRun(run({ status: 'error', error_message: 'column "high" does not exist' }), 'sql'),
    ).toEqual({ kind: 'error' });
  });
});
