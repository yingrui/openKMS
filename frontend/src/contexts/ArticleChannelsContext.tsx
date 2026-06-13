import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fetchAllArticleChannels } from '../data/articleChannelsApi';
import type { ChannelNode } from '../data/channelUtils';
import { useAuth } from './AuthContext';

interface ArticleChannelsContextValue {
  channels: ChannelNode[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
  refetch: () => Promise<void>;
  ensureLoaded: () => Promise<void>;
}

const ArticleChannelsContext = createContext<ArticleChannelsContextValue | null>(null);

export function ArticleChannelsProvider({ children }: { children: React.ReactNode }) {
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
      const data = await fetchAllArticleChannels();
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
    <ArticleChannelsContext.Provider value={{ channels, loading, error, loaded, refetch, ensureLoaded }}>
      {children}
    </ArticleChannelsContext.Provider>
  );
}

export function useArticleChannels() {
  const ctx = useContext(ArticleChannelsContext);
  if (!ctx) throw new Error('useArticleChannels must be used within ArticleChannelsProvider');
  return ctx;
}

/** Call on routes that need the channel tree (sidebar subnav, article pages, search). */
export function useEnsureArticleChannels() {
  const ctx = useArticleChannels();
  useEffect(() => {
    void ctx.ensureLoaded();
  }, [ctx.ensureLoaded]);
  return ctx;
}
