import { describe, expect, it } from 'vitest';
import { pickActive, pickActiveSection } from './useActiveSection';

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

describe('pickActiveSection', () => {
  const at = (over: Partial<Parameters<typeof pickActiveSection>[0]>) =>
    pickActiveSection({
      intersecting: [],
      order: ORDER,
      previous: null,
      scrollTop: 400,
      atEnd: false,
      ...over,
    });

  it('lights the last section when the pane is scrolled to the end', () => {
    // A short final section never reaches the top edge, so the zone alone would leave the highlight on
    // its neighbour — which is what clicking "Call it" looked like.
    expect(at({ previous: 'report-1', atEnd: true })).toBe('report-2');
  });

  it('lights nothing while the header is what is on screen', () => {
    // Keeping the previous highlight here points the menu at a section the reader has already left.
    expect(at({ previous: 'report-1', scrollTop: 0 })).toBeNull();
  });

  it('follows the reading line while scrolling', () => {
    expect(at({ intersecting: ['report-0'] })).toBe('report-0');
    expect(at({ previous: 'report-0' })).toBe('report-0');
  });

  it('has nothing to light when there are no sections', () => {
    expect(at({ order: [], atEnd: true })).toBeNull();
  });
});
