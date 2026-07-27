import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOBILE_BREAKPOINT_PX, useIsMobile } from './useIsMobile';

type Listener = () => void;

/** Minimal matchMedia stub whose `matches` can be flipped like a viewport resize. */
function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches: initialMatches,
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
  };
  const matchMedia = vi.fn(() => mql);
  vi.stubGlobal('matchMedia', matchMedia);
  return {
    matchMedia,
    setMatches(next: boolean) {
      mql.matches = next;
      listeners.forEach((fn) => fn());
    },
    listenerCount: () => listeners.size,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useIsMobile', () => {
  it('queries the breakpoint that mirrors $bp-md-min', () => {
    const mq = stubMatchMedia(false);
    renderHook(() => useIsMobile());
    expect(mq.matchMedia).toHaveBeenCalledWith(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
  });

  it('reports the viewport on first render', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('follows viewport changes', () => {
    const mq = stubMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => mq.setMatches(true));
    expect(result.current).toBe(true);

    act(() => mq.setMatches(false));
    expect(result.current).toBe(false);
  });

  it('detaches its listener on unmount', () => {
    const mq = stubMatchMedia(false);
    const { unmount } = renderHook(() => useIsMobile());
    expect(mq.listenerCount()).toBe(1);
    unmount();
    expect(mq.listenerCount()).toBe(0);
  });
});
