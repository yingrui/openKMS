import { useCallback, useState } from 'react';

export type CardListViewMode = 'card' | 'list';
export type CardListGraphViewMode = 'card' | 'list' | 'graph';

/** Max items fetched/rendered in card preview (no pagination bar). */
export const CARD_PREVIEW_LIMIT = 24;
export const LIST_PAGE_SIZE_DEFAULT = 25;

export function useStoredViewMode<T extends string>(
  storageKey: string,
  defaultMode: T,
  parse?: (raw: string | null) => T | null,
): [T, (mode: T) => void] {
  const [viewMode, setViewModeState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (parse) {
        const parsed = parse(raw);
        if (parsed) return parsed;
      } else if (raw) {
        return raw as T;
      }
    } catch {
      /* ignore */
    }
    return defaultMode;
  });

  const setViewMode = useCallback(
    (mode: T) => {
      setViewModeState(mode);
      try {
        localStorage.setItem(storageKey, mode);
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  return [viewMode, setViewMode];
}
