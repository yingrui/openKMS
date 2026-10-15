import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAsyncData } from './useAsyncData';

describe('useAsyncData', () => {
  it('loads on mount and reports loading while the request is in flight', async () => {
    let resolve!: (value: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => (resolve = r)));

    const { result } = renderHook(() => useAsyncData(load, []));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await act(async () => resolve('first'));

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe('first');
    expect(result.current.error).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reloads when a dependency changes, without ever showing the stale value', async () => {
    const load = vi.fn(async (id: number) => `row-${id}`);

    const { result, rerender } = renderHook(({ id }) => useAsyncData(() => load(id), [id]), {
      initialProps: { id: 1 },
    });
    await waitFor(() => expect(result.current.data).toBe('row-1'));

    rerender({ id: 2 });

    // Both are already correct in the rerender that noticed the change: no stale frame.
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.data).toBe('row-2'));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps the loader stable across re-renders that do not change dependencies', async () => {
    const load = vi.fn(async () => 'same');
    const { result, rerender } = renderHook(() => useAsyncData(load, []));
    await waitFor(() => expect(result.current.data).toBe('same'));

    rerender();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failure and clears the value', async () => {
    const boom = new Error('nope');
    const { result } = renderHook(() =>
      useAsyncData(() => Promise.reject(boom), []),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(boom);
    expect(result.current.data).toBeNull();
  });

  it('re-runs the loader on reload()', async () => {
    const load = vi.fn(async () => 'v');
    const { result } = renderHook(() => useAsyncData(load, []));
    await waitFor(() => expect(result.current.data).toBe('v'));

    await act(async () => result.current.reload());

    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.data).toBe('v');
  });

  it('ignores a response that lands after unmount', async () => {
    let resolve!: (value: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => (resolve = r)));

    const { unmount } = renderHook(() => useAsyncData(load, []));
    unmount();

    // Resolving after unmount must not set state (React would warn about it).
    await act(async () => resolve('late'));
    expect(load).toHaveBeenCalledTimes(1);
  });
});
