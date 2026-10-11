import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Tracks whether the current view hides the global header and owns the viewport
 * (agents session, knowledge base Q&A full page). The left rail is the only chrome
 * left in those views, so it also carries the home link and the account menu.
 *
 * The value is separate from its setter so views that only claim the shell do not
 * re-render when the flag flips.
 */
const ImmersiveShellContext = createContext(false);
const ImmersiveShellSetterContext = createContext<(value: boolean) => void>(() => {});

export function ImmersiveShellProvider({ children }: { children: ReactNode }) {
  const [immersive, setImmersive] = useState(false);
  return (
    <ImmersiveShellSetterContext.Provider value={setImmersive}>
      <ImmersiveShellContext.Provider value={immersive}>{children}</ImmersiveShellContext.Provider>
    </ImmersiveShellSetterContext.Provider>
  );
}

/** True while a view has taken over the shell (global header hidden). */
export function useImmersiveShell(): boolean {
  return useContext(ImmersiveShellContext);
}

/**
 * Claim the shell for the current view while `active`.
 *
 * Applies `bodyClass` — the stylesheet hook that hides the header and reclaims its
 * row — and flips {@link useImmersiveShell} so the rail can supply the navigation
 * the header would otherwise provide.
 */
export function useImmersiveView(bodyClass: string, active = true): void {
  const setImmersive = useContext(ImmersiveShellSetterContext);

  useEffect(() => {
    if (!active) return undefined;
    document.body.classList.add(bodyClass);
    setImmersive(true);
    return () => {
      document.body.classList.remove(bodyClass);
      setImmersive(false);
    };
  }, [bodyClass, active, setImmersive]);
}
