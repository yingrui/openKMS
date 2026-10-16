import { describe, expect, it } from 'vitest';
import { pickActive } from './useActiveSection';

const ORDER = ['narrative', 'report-0', 'report-1', 'report-2'];

describe('pickActive', () => {
  it('takes the section furthest down among those in the zone', () => {
    // tall sections: several are in the zone at once, and the reader is in the last of them
    expect(pickActive(['report-0', 'report-1'], ORDER, null)).toBe('report-1');
    expect(pickActive(['narrative', 'report-0', 'report-1'], ORDER, null)).toBe('report-1');
    expect(pickActive(['narrative'], ORDER, null)).toBe('narrative');
  });

  it('reads the document order, not the order the observer reported', () => {
    expect(pickActive(['report-2', 'narrative'], ORDER, null)).toBe('report-2');
  });

  it('keeps the previous section when nothing is in the zone', () => {
    // between two sections, or scrolled past the last one: a highlight that blinks off is worse
    expect(pickActive([], ORDER, 'report-1')).toBe('report-1');
    expect(pickActive([], ORDER, null)).toBeNull();
  });

  it('keeps the previous section when only unknown ids are reported', () => {
    expect(pickActive(['gone'], ORDER, 'narrative')).toBe('narrative');
  });
});
