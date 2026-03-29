import { useEffect } from 'react';
import { getUserManager } from '../oidc/userManager';

/** Handles silent renew redirect from the OIDC provider (iframe). */
export function OidcSilentRenew() {
  useEffect(() => {
    void getUserManager().signinSilentCallback();
  }, []);
  return <div className="app-loading" aria-hidden />;
}
