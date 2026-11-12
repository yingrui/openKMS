import { type ReactNode, useEffect, useState } from 'react';
import { config, type AuthMode } from '../config';
import { SessionAuthProvider } from './SessionAuthProvider';
import './AuthContext.scss';

type PublicAuthConfigJson = {
  auth_mode: string;
  allow_signup?: boolean;
};

async function fetchPublicAuthConfig(): Promise<PublicAuthConfigJson> {
  const res = await fetch(`${config.apiUrl}/api/auth/public-config`);
  if (!res.ok) throw new Error(`public-config ${res.status}`);
  return (await res.json()) as PublicAuthConfigJson;
}

function normalizeAuthMode(v: string | undefined): AuthMode {
  return v === 'local' ? 'local' : 'oidc';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>(config.authMode);
  const [allowSignup, setAllowSignup] = useState(false);
  const [compatWarning, setCompatWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const j = await fetchPublicAuthConfig();
        if (cancelled) return;
        const bm = normalizeAuthMode(j.auth_mode);
        setAuthMode(bm);
        setAllowSignup(Boolean(j.allow_signup));
        const rawVite = import.meta.env.VITE_AUTH_MODE;
        if (rawVite !== undefined && rawVite !== '') {
          const vm = normalizeAuthMode(rawVite);
          if (vm !== bm) {
            setCompatWarning(
              `VITE_AUTH_MODE is ${vm} but the API reports OPENKMS_AUTH_MODE=${bm}. The app uses the API value so it matches the central IdP or local authenticator.`
            );
          }
        }
      } catch {
        if (cancelled) return;
        const fb = config.authMode;
        setAuthMode(fb);
        setAllowSignup(fb === 'local');
        setCompatWarning(
          'Could not load /api/auth/public-config; using VITE_AUTH_MODE (or default oidc). Ensure the frontend build matches OPENKMS_AUTH_MODE on the server.'
        );
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return <div className="app-loading" aria-live="polite" />;
  }

  return (
    <>
      {compatWarning && (
        <p className="auth-mode-compat-banner" role="status">
          {compatWarning}
        </p>
      )}
      <SessionAuthProvider authMode={authMode} authModeReady allowSignup={allowSignup}>
        {children}
      </SessionAuthProvider>
    </>
  );
}

export { useAuth } from './authCore';
export type { AuthUser } from './authCore';
