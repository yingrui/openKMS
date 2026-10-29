import { describe, expect, it } from 'vitest';
import {
  defaultManualSyncDateRange,
  syncSlotIds,
  syncSlotSelectionPayload,
  validateSyncDateRange,
  yearSyncDateRange,
} from './connectorSyncUtils';

const SLOTS = [{ slot: 'index_basic' }, { slot: 'index_daily' }, { slot: 'dividends' }];

describe('syncSlotIds', () => {
  it('reads the ids a run may target', () => {
    expect(syncSlotIds(SLOTS)).toEqual(['index_basic', 'index_daily', 'dividends']);
  });

  it('has nothing to offer before the kind metadata loads', () => {
    expect(syncSlotIds(undefined)).toEqual([]);
  });
});

describe('syncSlotSelectionPayload', () => {
  it('omits the payload when every slot is selected — that is the default run', () => {
    expect(syncSlotSelectionPayload(syncSlotIds(SLOTS), syncSlotIds(SLOTS))).toBeUndefined();
  });

  it('sends the subset when the user narrows the run', () => {
    expect(syncSlotSelectionPayload(['index_daily'], syncSlotIds(SLOTS))).toEqual(['index_daily']);
  });

  it('sends an empty selection through, so the caller validates it instead of guessing', () => {
    // The dialog disables the button; a programmatic caller gets a 400 from the API, not a silent
    // full sync.
    expect(syncSlotSelectionPayload([], syncSlotIds(SLOTS))).toEqual([]);
  });

  it('does not treat an empty slot list as "all selected"', () => {
    expect(syncSlotSelectionPayload([], [])).toEqual([]);
  });
});

describe('sync date range', () => {
  it('defaults to the current calendar year', () => {
    expect(yearSyncDateRange(2026)).toEqual({ startDate: '2026-01-01', endDate: '2026-12-31' });
    expect(defaultManualSyncDateRange(new Date(2026, 9, 29))).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
  });

  it('rejects a missing or inverted range', () => {
    expect(validateSyncDateRange({ startDate: '', endDate: '2026-01-01' })).toBe('required');
    expect(validateSyncDateRange({ startDate: '2026-02-01', endDate: '2026-01-01' })).toBe('order');
    expect(validateSyncDateRange({ startDate: '2026-01-01', endDate: '2026-01-01' })).toBeNull();
  });
});
