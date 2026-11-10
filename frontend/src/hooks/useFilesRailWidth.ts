import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';

/** Read a persisted rail width, falling back to the default. */
function readWidth(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw != null) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) return n;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function persist(key: string, width: number): void {
  try {
    localStorage.setItem(key, String(width));
  } catch {
    /* ignore */
  }
}

export interface FilesRailWidthOptions {
  /** localStorage key — one per rail, so the project and the KB remember their own width. */
  storageKey: string;
  defaultPx: number;
  /** The pane the rail docks into; its width bounds the drag. */
  containerRef: RefObject<HTMLElement | null>;
  /** How wide the rail may be at a given pane width — the caller knows what sits beside it. */
  clamp: (width: number, containerWidth: number) => number;
}

/**
 * A resizable right-hand files rail: width, memory, and the drag gesture.
 *
 * Shared because the project agent and the KB conversation dock the same rail onto the right of the
 * chat; a second copy of this pointer maths is a second place for it to drift. Only the width is
 * shared — what each rail contains is not.
 */
export function useFilesRailWidth({ storageKey, defaultPx, containerRef, clamp }: FilesRailWidthOptions) {
  const [widthPx, setWidthPx] = useState(() => readWidth(storageKey, defaultPx));
  const [containerWidthPx, setContainerWidthPx] = useState(() => window.innerWidth);

  useEffect(() => {
    const measure = () => {
      const containerWidth = containerRef.current?.clientWidth ?? window.innerWidth;
      setContainerWidthPx(containerWidth);
      setWidthPx((w) => clamp(w, containerWidth));
    };
    const raf = requestAnimationFrame(measure);   // after layout, not during render
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [clamp, containerRef]);

  /** Set from a drag of the rail's own handle, from the inner tree handle, or on release. */
  const setWidth = useCallback(
    (width: number) => {
      const next = clamp(width, containerRef.current?.clientWidth ?? window.innerWidth);
      setWidthPx(next);
      persist(storageKey, next);
    },
    [clamp, containerRef, storageKey],
  );

  /** Dragging the handle left widens a right-hand rail, hence `startW - dx`. */
  const onResizePointerDown = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = widthPx;
      let latest = startW;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = 'none';
      const onMove = (ev: MouseEvent) => {
        latest = clamp(startW - (ev.clientX - startX), containerRef.current?.clientWidth ?? window.innerWidth);
        setWidthPx(latest);
      };
      const onUp = () => {
        document.body.style.userSelect = prevUserSelect;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        const final = clamp(latest, containerRef.current?.clientWidth ?? window.innerWidth);
        setWidthPx(final);
        persist(storageKey, final);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [clamp, containerRef, storageKey, widthPx],
  );

  return {
    width: clamp(widthPx, containerWidthPx),
    containerWidthPx,
    setWidth,
    onResizePointerDown,
  };
}
