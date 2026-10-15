import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useListFetch } from './useListFetch';

type Row = { id: number };
type Filters = { q: string };

/** Fetcher whose responses resolve in the order the test says so, keyed by the offset. */
function pagedFetcher(rows: Row[]) {
  return vi.fn(
    async ({ offset, limit, q }: { offset: number; limit: number } & Filters) => ({
      items: rows.slice(offset, offset + limit).map((r) => ({ id: q ? r.id : r.id })),
      total: rows.length,
    }),
  );
}

describe('useListFetch', () => {
  it('loads the first page on mount', async () => {
    const fetcher = pagedFetcher([{ id: 1 }, { id: 2 }]);
    const { result } = renderHook(() =>
      useListFetch<Row, Filters>({ fetcher, filters: { q: '' }, pageSize: 2 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.current.total).toBe(2);
    expect(fetcher).toHaveBeenCalledWith({ offset: 0, limit: 2, q: '' });
  });

  it('resets to the first page when the filters change and re-runs once', async () => {
    const fetcher = pagedFetcher([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    const { result, rerender } = renderHook(
      ({ q }: Filters) => useListFetch<Row, Filters>({ fetcher, filters: { q }, pageSize: 2 }),
      { initialProps: { q: '' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPage(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.page).toBe(1));

    rerender({ q: 'needle' });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.page).toBe(0);
    // Exactly one request per change, and the filter change resets the offset — the stale page
    // is never re-issued.
    expect(fetcher.mock.calls).toEqual([
      [{ offset: 0, limit: 2, q: '' }],
      [{ offset: 2, limit: 2, q: '' }],
      [{ offset: 0, limit: 2, q: 'needle' }],
    ]);
  });

  it('ignores a response that a newer request has superseded', async () => {
    const resolvers: Array<(value: { items: Row[]; total: number }) => void> = [];
    const fetcher = vi.fn(
      (_args: { offset: number; limit: number } & Filters) =>
        new Promise<{ items: Row[]; total: number }>((resolve) => resolvers.push(resolve)),
    );
    const { result, rerender } = renderHook(
      ({ q }: Filters) => useListFetch<Row, Filters>({ fetcher, filters: { q } }),
      { initialProps: { q: 'slow' } },
    );

    rerender({ q: 'fast' });
    expect(resolvers).toHaveLength(2);

    // The newer request answers first, then the superseded one arrives late.
    await act(async () => resolvers[1]({ items: [{ id: 2 }], total: 1 }));
    await act(async () => resolvers[0]({ items: [{ id: 1 }], total: 9 }));

    expect(result.current.items).toEqual([{ id: 2 }]);
    expect(result.current.total).toBe(1);
    expect(result.current.loading).toBe(false);
  });

  it('reload() re-runs the request and resolves after the response landed', async () => {
    const fetcher = pagedFetcher([{ id: 1 }]);
    const { result } = renderHook(() =>
      useListFetch<Row, Filters>({ fetcher, filters: { q: '' } }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reload();
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current.items).toEqual([{ id: 1 }]);
  });

  it('surfaces a failure as an Error and clears the rows', async () => {
    const fetcher = vi.fn(async () => {
      throw 'string failure';
    });
    const { result } = renderHook(() =>
      useListFetch<Row, Filters>({ fetcher, filters: { q: '' } }),
    );

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('string failure');
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('does not fetch while disabled', async () => {
    const fetcher = pagedFetcher([{ id: 1 }]);
    renderHook(() =>
      useListFetch<Row, Filters>({ fetcher, filters: { q: '' }, enabled: false }),
    );

    await act(async () => {});
    expect(fetcher).not.toHaveBeenCalled();
  });
});
