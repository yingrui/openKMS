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
  channelRailAvailable: boolean;
  ontologyRailAvailable: boolean;
  channelRailOpen: boolean;
  ontologyRailOpen: boolean;
  setChannelRailAvailable: (available: boolean) => void;
  setOntologyRailAvailable: (available: boolean) => void;
  setChannelRailOpen: (open: boolean) => void;
  setOntologyRailOpen: (open: boolean) => void;
  toggleChannelRail: () => void;
  toggleOntologyRail: () => void;
  closeRails: () => void;
};

const MobileShellContext = createContext<MobileShellContextValue | null>(null);

export function MobileShellProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [channelRailAvailable, setChannelRailAvailable] = useState(false);
  const [ontologyRailAvailable, setOntologyRailAvailable] = useState(false);
  const [channelRailOpen, setChannelRailOpen] = useState(false);
  const [ontologyRailOpen, setOntologyRailOpen] = useState(false);

  const closeRails = useCallback(() => {
    setChannelRailOpen(false);
    setOntologyRailOpen(false);
  }, []);

  useEffect(() => {
    closeRails();
  }, [location.pathname, closeRails]);

  useEffect(() => {
    if (!channelRailOpen && !ontologyRailOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRails();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [channelRailOpen, ontologyRailOpen, closeRails]);

  const toggleChannelRail = useCallback(() => {
    setChannelRailOpen((v) => !v);
    setOntologyRailOpen(false);
  }, []);

  const toggleOntologyRail = useCallback(() => {
    setOntologyRailOpen((v) => !v);
    setChannelRailOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      channelRailAvailable,
      ontologyRailAvailable,
      channelRailOpen,
      ontologyRailOpen,
      setChannelRailAvailable,
      setOntologyRailAvailable,
      setChannelRailOpen,
      setOntologyRailOpen,
      toggleChannelRail,
      toggleOntologyRail,
      closeRails,
    }),
    [
      channelRailAvailable,
      ontologyRailAvailable,
      channelRailOpen,
      ontologyRailOpen,
      toggleChannelRail,
      toggleOntologyRail,
      closeRails,
    ],
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
