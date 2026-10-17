import type { QualityRunResponse } from '../../data/qualityApi';

/**
 * What a run *measured*, in the only shapes a rule can report.
 *
 * A run row that says "failed 51,425" is a number without a subject: 51,425 of what, and allowed how
 * much? Each rule type already stores what it looked at (`detail`) — this turns it into something a
 * reader can act on, and it is pure so every branch has a test.
 */
export type RunReading =
  | { kind: 'error' }
  | { kind: 'freshness'; latest: string | null; maxAgeDays: number | null }
  | { kind: 'sql'; found: number; expect: 'zero' | 'nonzero'; passed: boolean }
  | { kind: 'counts'; checked: number | null; failed: number };

export function readRun(run: QualityRunResponse, ruleType: string): RunReading {
  if (run.status === 'error') return { kind: 'error' };
  if (ruleType === 'freshness') {
    const detail = (run.detail ?? {}) as { latest?: unknown; max_age_days?: unknown };
    return {
      kind: 'freshness',
      // Runs recorded before the backend stored `null` say "None" — history outlives a shape fix.
      latest:
        typeof detail.latest === 'string' && detail.latest !== 'None' ? detail.latest : null,
      maxAgeDays: typeof detail.max_age_days === 'number' ? detail.max_age_days : null,
    };
  }
  if (ruleType === 'sql') {
    // A count is not always a count of problems: `expect: 'nonzero'` makes it a coverage check, where
    // finding nothing is the failure. The number the query returned is kept in `detail.value`.
    const detail = (run.detail ?? {}) as { value?: unknown; expect?: unknown };
    const expect = detail.expect === 'nonzero' ? 'nonzero' : 'zero';
    const found =
      typeof detail.value === 'number'
        ? detail.value
        : // runs recorded before `detail.value` existed only have the verdict count
          (run.failed_count ?? 0);
    return { kind: 'sql', found, expect, passed: run.status === 'passed' };
  }
  return { kind: 'counts', checked: run.checked_count, failed: run.failed_count ?? 0 };
}
