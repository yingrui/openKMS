import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, pushSnapshot, sameSnapshot, type Snapshot } from './explorationHistory';

const snap = (query: string, charts: Snapshot['charts'] = null): Snapshot => ({
  query,
  charts,
  columns: [],
});

describe('an exploration keeps the last few states', () => {
  it('compares by value, so the same state is not a history entry', () => {
    expect(sameSnapshot(snap('f=a'), snap('f=a'))).toBe(true);
    expect(sameSnapshot(snap('f=a'), snap('f=b'))).toBe(false);
    expect(
      sameSnapshot(snap('f=a', [{ prop: 'x' }]), snap('f=a', [{ prop: 'x' }]))
    ).toBe(true);
    expect(sameSnapshot(null, null)).toBe(true);
  });

  it('does not push a snapshot equal to the last one', () => {
    const past = pushSnapshot([], snap('f=a'));
    expect(past).toHaveLength(1);
    expect(pushSnapshot(past, snap('f=a'))).toHaveLength(1);
  });

  it('keeps the newest and forgets the oldest beyond the limit', () => {
    let past: Snapshot[] = [];
    for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) {
      past = pushSnapshot(past, snap(`f=${index}`), HISTORY_LIMIT);
    }
    expect(past).toHaveLength(HISTORY_LIMIT);
    expect(past[0].query).toBe('f=5');
    expect(past[past.length - 1].query).toBe(`f=${HISTORY_LIMIT + 4}`);
  });
});
