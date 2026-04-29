import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchArticleChannels } from '../data/articleChannelsApi';
import type { ChannelNode } from '../data/channelUtils';
import { useAuth } from './AuthContext';
import { useFeatureToggles } from './FeatureTogglesContext';

interface ArticleChannelsContextValue {
  channels: ChannelNode[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const ArticleChannelsContext = createContext<ArticleChannelsContextValue | null>(null);

export function ArticleChannelsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toggles } = useFeatureToggles();
  const [channels, setChannels] = useState<ChannelNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchArticleChannels();
      setChannels(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load article channels');
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated && toggles.articles) {
      void refetch();
    } else if (!authLoading && !isAuthenticated) {
      setChannels([]);
      setError(null);
      setLoading(false);
    } else if (!authLoading && !toggles.articles) {
      setChannels([]);
      setError(null);
      setLoading(false);
    }
  }, [isAuthenticated, authLoading, toggles.articles, refetch]);

  return (
    <ArticleChannelsContext.Provider value={{ channels, loading, error, refetch }}>
      {children}
    </ArticleChannelsContext.Provider>
  );
}

export function useArticleChannels() {
  const ctx = useContext(ArticleChannelsContext);
  if (!ctx) throw new Error('useArticleChannels must be used within ArticleChannelsProvider');
  return ctx;
}
