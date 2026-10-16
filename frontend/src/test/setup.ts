import '@testing-library/jest-dom/vitest'

// jsdom implements no matchMedia; the layout hooks (useIsMobile) ask for it on mount.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom implements no ResizeObserver; recharts' ResponsiveContainer asks for one when it mounts.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver =
  window.ResizeObserver ?? (ResizeObserverStub as unknown as typeof ResizeObserver);
