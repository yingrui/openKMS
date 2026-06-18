import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fetchAllMediaChannels } from '../data/mediaChannelsApi';
import type { ChannelNode } from '../data/channelUtils';
import { useAuth } from './AuthContext';
import { useFeatureToggles } from './FeatureTogglesContext';

interface MediaChannelsContextValue {
  channels: ChannelNode[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
  refetch: () => Promise<void>;
  ensureLoaded: () => Promise<void>;
}

const MediaChannelsContext = createContext<MediaChannelsContextValue | null>(null);

export function MediaChannelsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toggles } = useFeatureToggles();
  const [channels, setChannels] = useState<ChannelNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const inflightRef = useRef<Promise<void> | null>(null);

  const refetch = useCallback(async () => {
    if (!toggles.media) {
      setChannels([]);
      setLoaded(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllMediaChannels();
      setChannels(data);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load channels');
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, [toggles.media]);

  const ensureLoaded = useCallback(async () => {
    if (authLoading || !isAuthenticated || !toggles.media || loaded) return;
    if (inflightRef.current) {
      await inflightRef.current;
      return;
    }
    const task = refetch().finally(() => {
      inflightRef.current = null;
    });
    inflightRef.current = task;
    await task;
  }, [authLoading, isAuthenticated, toggles.media, loaded, refetch]);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !toggles.media)) {
      setChannels([]);
      setError(null);
      setLoading(false);
      setLoaded(false);
    }
  }, [isAuthenticated, authLoading, toggles.media]);

  return (
    <MediaChannelsContext.Provider value={{ channels, loading, error, loaded, refetch, ensureLoaded }}>
      {children}
    </MediaChannelsContext.Provider>
  );
}

export function useMediaChannels() {
  const ctx = useContext(MediaChannelsContext);
  if (!ctx) throw new Error('useMediaChannels must be used within MediaChannelsProvider');
  return ctx;
}

export function useEnsureMediaChannels() {
  const ctx = useMediaChannels();
  useEffect(() => {
    void ctx.ensureLoaded();
  }, [ctx.ensureLoaded]);
  return ctx;
}
