import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchDocumentChannels, type ChannelNode } from '../data/channelsApi';
import { useAuth } from './AuthContext';

interface DocumentChannelsContextValue {
  channels: ChannelNode[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const DocumentChannelsContext = createContext<DocumentChannelsContextValue | null>(null);

export function DocumentChannelsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [channels, setChannels] = useState<ChannelNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDocumentChannels();
      setChannels(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load channels');
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      refetch();
    } else if (!authLoading && !isAuthenticated) {
      setChannels([]);
      setError(null);
      setLoading(false);
    }
  }, [isAuthenticated, authLoading, refetch]);

  return (
    <DocumentChannelsContext.Provider value={{ channels, loading, error, refetch }}>
      {children}
    </DocumentChannelsContext.Provider>
  );
}

export function useDocumentChannels() {
  const ctx = useContext(DocumentChannelsContext);
  if (!ctx) throw new Error('useDocumentChannels must be used within DocumentChannelsProvider');
  return ctx;
}
