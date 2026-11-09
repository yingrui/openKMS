import { describe, expect, it } from 'vitest';
import { formatCell } from './datasetCellFormat';

describe('formatCell', () => {
  it('shows an instant, not the padding', () => {
    expect(formatCell('2026-08-03T00:00:00.000', '—')).toBe('2026-08-03 00:00:00');
    expect(formatCell('2026-08-03', '—')).toBe('2026-08-03');
  });

  it('does not print a float at full length', () => {
    expect(formatCell(0.1734234234, '—')).toBe('0.173423');
    expect(formatCell(-0.0250431779, '—')).toBe('-0.025043');
    expect(formatCell(42, '—')).toBe('42');
  });

  it('is the same dash the rest of the page uses', () => {
    expect(formatCell(null, '—')).toBe('—');
    expect(formatCell(undefined, '—')).toBe('—');
  });
});
