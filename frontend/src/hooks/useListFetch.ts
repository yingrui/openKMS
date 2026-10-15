import { useCallback, useEffect, useRef, useState } from 'react';

export type UseListFetchOptions<T, F extends object> = {
  fetcher: (args: { offset: number; limit: number } & F) => Promise<{ items: T[]; total: number }>;
  filters: F;
  pageSize?: number;
  enabled?: boolean;
};

export type UseListFetchResult<T> = {
  items: T[];
  total: number;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  loading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
};

/**
 * Shared offset/limit list-fetching state machine: paginates via `fetcher`, resets `page` to 0
 * when `filters` changes (compared by `JSON.stringify`), and exposes loading/error state.
 */
export function useListFetch<T, F extends object>(
  options: UseListFetchOptions<T, F>,
): UseListFetchResult<T> {
  const { fetcher, filters, pageSize: initialPageSize = 25, enabled = true } = options;

  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const filtersKey = JSON.stringify(filters);
  /** Identifies the request the current render describes; a response for an older one is dropped. */
  const requestKey = `${page}|${pageSize}|${filtersKey}`;

  // Latest fetcher + filters + request key, refreshed after every render: `filters` is compared
  // by value (`filtersKey`) so an equal-shaped object literal must not restart the request, and
  // reading them through the ref keeps `load`'s dependency list both complete and honest.
  const latestRef = useRef({ fetcher, filters, requestKey });
  useEffect(() => {
    latestRef.current = { fetcher, filters, requestKey };
  });

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const started = requestKey;
    setLoading(true);
    setError(null);
    const { fetcher: currentFetcher, filters: currentFilters } = latestRef.current;
    try {
      const res = await currentFetcher({ offset: page * pageSize, limit: pageSize, ...currentFilters });
      if (latestRef.current.requestKey !== started) return;
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      if (latestRef.current.requestKey !== started) return;
      setError(e instanceof Error ? e : new Error(String(e)));
      setItems([]);
      setTotal(0);
    } finally {
      if (latestRef.current.requestKey === started) setLoading(false);
    }
  }, [page, pageSize, requestKey, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset to the first page when the filters change — during render, so the request below is never
  // issued for a stale page (an earlier effect-based reset fired one request too many).
  const [prevFiltersKey, setPrevFiltersKey] = useState(filtersKey);
  if (prevFiltersKey !== filtersKey) {
    setPrevFiltersKey(filtersKey);
    setPage(0);
  }

  return { items, total, page, setPage, pageSize, setPageSize, loading, error, reload: load };
}
