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

type MobileShellContextValue = {
  ontologyRailAvailable: boolean;
  ontologyRailOpen: boolean;
  setOntologyRailAvailable: (available: boolean) => void;
  setOntologyRailOpen: (open: boolean) => void;
  toggleOntologyRail: () => void;
  closeRails: () => void;
};

const MobileShellContext = createContext<MobileShellContextValue | null>(null);

export function MobileShellProvider({ children }: { children: ReactNode }) {
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

  return <MobileShellContext.Provider value={value}>{children}</MobileShellContext.Provider>;
}

export function useMobileShell(): MobileShellContextValue {
  const ctx = useContext(MobileShellContext);
  if (!ctx) {
    throw new Error('useMobileShell must be used within MobileShellProvider');
  }
  return ctx;
}
