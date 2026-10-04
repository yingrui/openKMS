import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';

export interface ChannelTreeContextValue<Node> {
  channels: Node[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
  refetch: () => Promise<void>;
  ensureLoaded: () => Promise<void>;
}

const alwaysEnabled = () => true;

/**
 * Lazily loaded channel tree shared by sidebar subnav, list pages and search.
 * `useEnabled` gates loading (e.g. a feature toggle); when false the tree is empty.
 */
export function createChannelTreeContext<Node>(
  name: string,
  fetchAll: () => Promise<Node[]>,
  useEnabled: () => boolean = alwaysEnabled,
) {
  const Ctx = createContext<ChannelTreeContextValue<Node> | null>(null);

  function Provider({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const enabled = useEnabled();
    const [channels, setChannels] = useState<Node[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);
    const inflightRef = useRef<Promise<void> | null>(null);

    const refetch = useCallback(async () => {
      if (!enabled) {
        setChannels([]);
        setLoaded(true);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        setChannels(await fetchAll());
        setLoaded(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load channels');
        setChannels([]);
      } finally {
        setLoading(false);
      }
    }, [enabled]);

    const ensureLoaded = useCallback(async () => {
      if (authLoading || !isAuthenticated || !enabled || loaded) return;
      if (inflightRef.current) {
        await inflightRef.current;
        return;
      }
      const task = refetch().finally(() => {
        inflightRef.current = null;
      });
      inflightRef.current = task;
      await task;
    }, [authLoading, isAuthenticated, enabled, loaded, refetch]);

    useEffect(() => {
      if (!authLoading && (!isAuthenticated || !enabled)) {
        setChannels([]);
        setError(null);
        setLoading(false);
        setLoaded(false);
      }
    }, [isAuthenticated, authLoading, enabled]);

    return (
      <Ctx.Provider value={{ channels, loading, error, loaded, refetch, ensureLoaded }}>{children}</Ctx.Provider>
    );
  }
  Provider.displayName = `${name}Provider`;

  function useChannels() {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error(`use${name} must be used within ${name}Provider`);
    return ctx;
  }

  /** Call on routes that need the channel tree. */
  function useEnsureChannels() {
    const ctx = useChannels();
    const { ensureLoaded } = ctx;
    useEffect(() => {
      void ensureLoaded();
    }, [ensureLoaded]);
    return ctx;
  }

  return { Provider, useChannels, useEnsureChannels };
}
