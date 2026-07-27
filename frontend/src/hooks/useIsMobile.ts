import { useEffect, useState } from 'react';

/** Keep in sync with `$bp-md-min` in `styles/design-system/_tokens.scss`. */
export const MOBILE_BREAKPOINT_PX = 768;

const MOBILE_MQ = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;

/** True while the viewport is at or below the mobile breakpoint. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return isMobile;
}

/** One-shot check for initial UI state (e.g. collapsed panels). Prefer `useIsMobile` for reactive layout. */
export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches;
}
