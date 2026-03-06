import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'openkms-feature-toggles';

export interface FeatureToggles {
  articles: boolean;
  knowledgeBases: boolean;
}

const defaults: FeatureToggles = {
  articles: true,
  knowledgeBases: true,
};

function loadToggles(): FeatureToggles {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<FeatureToggles>;
      return { ...defaults, ...parsed };
    }
  } catch {
    // ignore
  }
  return { ...defaults };
}

function saveToggles(toggles: FeatureToggles) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toggles));
  } catch {
    // ignore
  }
}

interface FeatureTogglesContextValue {
  toggles: FeatureToggles;
  setToggle: (key: keyof FeatureToggles, enabled: boolean) => void;
  isEnabled: (key: keyof FeatureToggles) => boolean;
}

const FeatureTogglesContext = createContext<FeatureTogglesContextValue | null>(null);

export function FeatureTogglesProvider({ children }: { children: React.ReactNode }) {
  const [toggles, setToggles] = useState<FeatureToggles>(loadToggles);

  useEffect(() => {
    saveToggles(toggles);
  }, [toggles]);

  const setToggle = useCallback((key: keyof FeatureToggles, enabled: boolean) => {
    setToggles((prev) => ({ ...prev, [key]: enabled }));
  }, []);

  const isEnabled = useCallback(
    (key: keyof FeatureToggles) => toggles[key],
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
