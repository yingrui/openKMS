/**
 * Ontology suite mobile rail drawer (Manager / Explorer / Function Editor list).
 *
 * Not a general “mobile shell”: Documents / Articles / Media intentionally have
 * no channel drawer on phones (landing tree + All-channels back link instead).
 * Do not extend this context for channel rails.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';

type OntologyMobileRailContextValue = {
  ontologyRailAvailable: boolean;
  ontologyRailOpen: boolean;
  setOntologyRailAvailable: (available: boolean) => void;
  setOntologyRailOpen: (open: boolean) => void;
  toggleOntologyRail: () => void;
  closeRails: () => void;
};

const OntologyMobileRailContext = createContext<OntologyMobileRailContextValue | null>(null);

export function OntologyMobileRailProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [ontologyRailAvailable, setOntologyRailAvailable] = useState(false);
  const [ontologyRailOpen, setOntologyRailOpen] = useState(false);

  const closeRails = useCallback(() => {
    setOntologyRailOpen(false);
  }, []);

  useEffect(() => {
    closeRails();
  }, [location.pathname, closeRails]);

  useEffect(() => {
    if (!ontologyRailOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRails();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ontologyRailOpen, closeRails]);

  const toggleOntologyRail = useCallback(() => {
    setOntologyRailOpen((v) => !v);
  }, []);

  const value = useMemo(
    () => ({
      ontologyRailAvailable,
      ontologyRailOpen,
      setOntologyRailAvailable,
      setOntologyRailOpen,
      toggleOntologyRail,
      closeRails,
    }),
    [ontologyRailAvailable, ontologyRailOpen, toggleOntologyRail, closeRails],
  );

  return (
    <OntologyMobileRailContext.Provider value={value}>{children}</OntologyMobileRailContext.Provider>
  );
}

export function useOntologyMobileRail(): OntologyMobileRailContextValue {
  const ctx = useContext(OntologyMobileRailContext);
  if (!ctx) {
    throw new Error('useOntologyMobileRail must be used within OntologyMobileRailProvider');
  }
  return ctx;
}
