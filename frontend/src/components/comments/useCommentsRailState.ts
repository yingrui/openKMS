import { useCallback, useEffect, useState } from 'react';

const WIDTH_MIN = 280;
const WIDTH_MAX = 480;
const WIDTH_DEFAULT = 360;

function storageKey(prefix: string, suffix: string): string {
  return `openkms_comments_rail_${prefix}_${suffix}`;
}

function readOpen(prefix: string): boolean {
  try {
    return localStorage.getItem(storageKey(prefix, 'open')) === '1';
  } catch {
    return false;
  }
}

function readWidth(prefix: string): number {
  try {
    const raw = localStorage.getItem(storageKey(prefix, 'width'));
    if (raw != null) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) return clampWidth(n);
    }
  } catch {
    /* ignore */
  }
  return WIDTH_DEFAULT;
}

export function clampCommentsRailWidth(w: number): number {
  return Math.round(Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, w)));
}

function clampWidth(w: number): number {
  return clampCommentsRailWidth(w);
}

export function useCommentsRailState(storagePrefix: string) {
  const [open, setOpen] = useState(() => readOpen(storagePrefix));
  const [widthPx, setWidthPx] = useState(() => readWidth(storagePrefix));

  const setOpenPersist = useCallback(
    (value: boolean) => {
      setOpen(value);
      try {
        localStorage.setItem(storageKey(storagePrefix, 'open'), value ? '1' : '0');
      } catch {
        /* ignore */
      }
    },
    [storagePrefix],
  );

  const setWidthPersist = useCallback(
    (w: number) => {
      const clamped = clampWidth(w);
      setWidthPx(clamped);
      try {
        localStorage.setItem(storageKey(storagePrefix, 'width'), String(clamped));
      } catch {
        /* ignore */
      }
    },
    [storagePrefix],
  );

  useEffect(() => {
    const onResize = () => setWidthPx((w) => clampWidth(w));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return { open, setOpenPersist, widthPx, setWidthPersist, widthMin: WIDTH_MIN, widthMax: WIDTH_MAX };
}
