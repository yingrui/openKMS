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

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const filtersKey = JSON.stringify(filters);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetcherRef.current({ offset: page * pageSize, limit: pageSize, ...filters });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
    // filters is captured fresh whenever filtersKey changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filtersKey, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const prevFiltersKeyRef = useRef(filtersKey);
  useEffect(() => {
    if (prevFiltersKeyRef.current !== filtersKey) {
      prevFiltersKeyRef.current = filtersKey;
      setPage(0);
    }
  }, [filtersKey]);

  return { items, total, page, setPage, pageSize, setPageSize, loading, error, reload: load };
}
