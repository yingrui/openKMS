/**
 * Console admin sidebar as a phone overlay drawer (≤ `$bp-md-min`).
 * Desktop keeps the persistent console sidebar; this only controls the mobile sheet.
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
import { isConsoleShellPath } from '../config/appModules';

type ConsoleMobileNavContextValue = {
  consoleNavOpen: boolean;
  setConsoleNavOpen: (open: boolean) => void;
  toggleConsoleNav: () => void;
  closeConsoleNav: () => void;
};

const ConsoleMobileNavContext = createContext<ConsoleMobileNavContextValue | null>(null);

export function ConsoleMobileNavProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [consoleNavOpen, setConsoleNavOpen] = useState(false);
  const inConsole = isConsoleShellPath(location.pathname);

  const closeConsoleNav = useCallback(() => {
    setConsoleNavOpen(false);
  }, []);

  // Navigating (or leaving the console section) closes the drawer. Render-time adjustments,
  // so no frame is rendered with the drawer still open on the new route.
  const [lastPathname, setLastPathname] = useState(location.pathname);
  if (lastPathname !== location.pathname) {
    setLastPathname(location.pathname);
    setConsoleNavOpen(false);
  }
  const [lastInConsole, setLastInConsole] = useState(inConsole);
  if (lastInConsole !== inConsole) {
    setLastInConsole(inConsole);
    if (!inConsole) setConsoleNavOpen(false);
  }

  useEffect(() => {
    if (!consoleNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeConsoleNav();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [consoleNavOpen, closeConsoleNav]);

  const toggleConsoleNav = useCallback(() => {
    setConsoleNavOpen((v) => !v);
  }, []);

  const value = useMemo(
    () => ({
      consoleNavOpen,
      setConsoleNavOpen,
      toggleConsoleNav,
      closeConsoleNav,
    }),
    [consoleNavOpen, toggleConsoleNav, closeConsoleNav],
  );

  return (
    <ConsoleMobileNavContext.Provider value={value}>{children}</ConsoleMobileNavContext.Provider>
  );
}

export function useConsoleMobileNav(): ConsoleMobileNavContextValue {
  const ctx = useContext(ConsoleMobileNavContext);
  if (!ctx) {
    throw new Error('useConsoleMobileNav must be used within ConsoleMobileNavProvider');
  }
  return ctx;
}
