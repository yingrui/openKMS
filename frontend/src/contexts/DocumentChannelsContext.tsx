import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fetchDocumentChannels, type ChannelNode } from '../data/channelsApi';
import { useAuth } from './AuthContext';

interface DocumentChannelsContextValue {
  channels: ChannelNode[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
  refetch: () => Promise<void>;
  ensureLoaded: () => Promise<void>;
}

const DocumentChannelsContext = createContext<DocumentChannelsContextValue | null>(null);

export function DocumentChannelsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [channels, setChannels] = useState<ChannelNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const inflightRef = useRef<Promise<void> | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDocumentChannels();
      setChannels(data);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load channels');
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const ensureLoaded = useCallback(async () => {
    if (authLoading || !isAuthenticated || loaded) return;
    if (inflightRef.current) {
      await inflightRef.current;
      return;
    }
    const task = refetch().finally(() => {
      inflightRef.current = null;
    });
    inflightRef.current = task;
    await task;
  }, [authLoading, isAuthenticated, loaded, refetch]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setChannels([]);
      setError(null);
      setLoading(false);
      setLoaded(false);
    }
  }, [isAuthenticated, authLoading]);

  return (
    <DocumentChannelsContext.Provider value={{ channels, loading, error, loaded, refetch, ensureLoaded }}>
      {children}
    </DocumentChannelsContext.Provider>
  );
}

export function useDocumentChannels() {
  const ctx = useContext(DocumentChannelsContext);
  if (!ctx) throw new Error('useDocumentChannels must be used within DocumentChannelsProvider');
  return ctx;
}

/** Call on routes that need the channel tree (sidebar subnav, document pages, search). */
export function useEnsureDocumentChannels() {
  const ctx = useDocumentChannels();
  useEffect(() => {
    void ctx.ensureLoaded();
  }, [ctx.ensureLoaded]);
  return ctx;
}
