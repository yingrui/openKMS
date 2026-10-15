import { useCallback, useEffect, useRef, useState } from 'react';

type AsyncState<T> = { gen: number; data: T | null; error: unknown };

export type AsyncData<T> = {
  /** The resolved value for the current generation, or null while (re)loading. */
  data: T | null;
  /** Derived: the current generation has not resolved yet. */
  loading: boolean;
  /** Whatever the loader threw, or null. */
  error: unknown;
  /** Re-run the loader without changing the dependencies. */
  reload: () => void;
};

/**
 * Load async data on mount and whenever `deps` change.
 *
 * `loading` is **derived** rather than set, because React's `set-state-in-effect` rule (and
 * good sense) forbids setting state synchronously in an effect: the component would render
 * once with stale flags. Here the effect only starts the request; both the "a new load
 * began" and "it finished" transitions happen where they belong — the generation counter is
 * bumped during render when a dependency changes, and the result lands in the promise.
 *
 * `load` may be an inline closure: the latest one is used, so it does not need memoising.
 */
export function useAsyncData<T>(load: () => Promise<T>, deps: readonly unknown[]): AsyncData<T> {
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // State (not a ref) holds the previous dependencies: reading a ref during render is what
  // React's compiler forbids, while comparing state during render is the sanctioned way to
  // react to a changed input.
  const [prevDeps, setPrevDeps] = useState(deps);
  const [gen, setGen] = useState(0);
  if (deps.length !== prevDeps.length || deps.some((dep, i) => !Object.is(dep, prevDeps[i]))) {
    setPrevDeps(deps);
    setGen((current) => current + 1);
  }

  const [state, setState] = useState<AsyncState<T>>({ gen: -1, data: null, error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ gen, data, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ gen, data: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, [gen, nonce]);

  const reload = useCallback(() => setNonce((current) => current + 1), []);
  const settled = state.gen === gen;
  return { data: settled ? state.data : null, loading: !settled, error: settled ? state.error : null, reload };
}
