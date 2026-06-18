import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';
import {
  fetchToggles,
  updateToggles,
  type FeatureToggles,
  type FeatureToggleKey,
} from '../data/featureTogglesApi';

export type { FeatureToggles, FeatureToggleKey } from '../data/featureTogglesApi';

const defaults: FeatureToggles = {
  evaluations: false,
  connectors: true,
  agents: true,
  media: false,
  hasNeo4jDataSource: false,
};

interface FeatureTogglesContextValue {
  toggles: FeatureToggles;
  setToggle: (key: FeatureToggleKey, enabled: boolean) => void;
  isEnabled: (key: FeatureToggleKey) => boolean;
}

const FeatureTogglesContext = createContext<FeatureTogglesContextValue | null>(null);

export function FeatureTogglesProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [toggles, setToggles] = useState<FeatureToggles>(defaults);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    let cancelled = false;
    fetchToggles()
      .then((data) => {
        if (!cancelled) setToggles(data);
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to load feature toggles');
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading]);

  const setToggle = useCallback((key: FeatureToggleKey, enabled: boolean) => {
    setToggles((prev) => {
      const previous = prev;
      const next = { ...prev, [key]: enabled };
      updateToggles({ [key]: enabled })
        .then((data) => setToggles(data))
        .catch((e) => {
          setToggles(previous);
          toast.error(e instanceof Error ? e.message : 'Failed to update feature toggle');
        });
      return next;
    });
  }, []);

  const isEnabled = useCallback(
    (key: FeatureToggleKey) => Boolean(toggles[key]),
    [toggles],
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
