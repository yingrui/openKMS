import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';
import { fetchToggles, updateToggles, type FeatureToggles } from '../data/featureTogglesApi';

export type { FeatureToggles } from '../data/featureTogglesApi';

const defaults: FeatureToggles = {
  articles: true,
  knowledgeBases: true,
  wikiSpaces: true,
  objectsAndLinks: true,
  evaluationDatasets: false,
  taxonomy: true,
  hasNeo4jDataSource: false,
};

interface FeatureTogglesContextValue {
  toggles: FeatureToggles;
  setToggle: (key: keyof FeatureToggles, enabled: boolean) => void;
  isEnabled: (key: keyof FeatureToggles) => boolean;
}

const FeatureTogglesContext = createContext<FeatureTogglesContextValue | null>(null);

export function FeatureTogglesProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [toggles, setToggles] = useState<FeatureToggles>(defaults);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    let cancelled = false;
    fetchToggles()
      .then((data) => { if (!cancelled) setToggles(data); })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to load feature toggles');
      });
    return () => { cancelled = true; };
  }, [isAuthenticated, isLoading]);

  const setToggle = useCallback((key: keyof FeatureToggles, enabled: boolean) => {
    setToggles((prev) => {
      const next = { ...prev, [key]: enabled };
      updateToggles({ [key]: enabled }).catch((e) => {
        setToggles(prev);
        toast.error(e instanceof Error ? e.message : 'Failed to update feature toggle');
      });
      return next;
    });
  }, []);

  const isEnabled = useCallback(
    (key: keyof FeatureToggles) => Boolean(toggles[key]),
    [toggles]
  );

  return (
    <FeatureTogglesContext.Provider value={{ toggles, setToggle, isEnabled }}>
      {children}
    </FeatureTogglesContext.Provider>
  );
}

export function useFeatureToggles() {
  const ctx = useContext(FeatureTogglesContext);
  if (!ctx) {
    return {
      toggles: defaults,
      setToggle: () => {},
      isEnabled: () => true,
    };
  }
  return ctx;
}
