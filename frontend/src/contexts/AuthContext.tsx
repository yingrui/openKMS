import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Keycloak from 'keycloak-js';
import { config } from '../config';
import { setAuthTokenProvider } from '../data/apiClient';

/** Realm role that grants Console access. Configure in Keycloak. */
const ADMIN_ROLE = 'admin';

export interface AuthUser {
  username: string;
  email?: string;
  name?: string;
  roles: string[];
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  isAdmin: boolean;
  authError: string | null;
  clearAuthError: () => void;
  retryAuth: () => void;
  login: () => void;
  logout: () => void;
  getToken: () => Promise<string | undefined>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

let keycloak: Keycloak | null = null;
/** Prevents double init when React Strict Mode runs effects twice */
let initPromise: Promise<boolean> | null = null;

function getKeycloak(forceNew = false) {
  if (forceNew) {
    keycloak = null;
    initPromise = null;
  }
  if (!keycloak) {
    keycloak = new Keycloak({
      url: config.keycloak.url,
      realm: config.keycloak.realm,
      clientId: config.keycloak.clientId,
    });
  }
  return keycloak;
}

function parseUserFromToken(kc: Keycloak): AuthUser | null {
  if (!kc.tokenParsed) return null;
  const p = kc.tokenParsed as Record<string, unknown>;
  const realmAccess = (p.realm_access as { roles?: string[] }) ?? {};
  const roles: string[] = realmAccess.roles ?? [];
  return {
    username: (p.preferred_username as string) || 'user',
    email: p.email as string | undefined,
    name: (p.name as string) || (p.preferred_username as string),
    roles,
  };
}

function hasAdminRole(user: AuthUser | null): boolean {
  return user?.roles?.includes(ADMIN_ROLE) ?? false;
}

async function syncTokenToBackend(token: string) {
  try {
    await fetch(`${config.apiUrl}/sync-session`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
  } catch {
    // Ignore; img requests may fall back to Bearer
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Clear any auth error from URL (Keycloak can redirect with ?error=...)
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    const errDesc = params.get('error_description');
    if (err) {
      setAuthError(errDesc || err);
      // Remove from URL without full reload
      const next = new URLSearchParams(params);
      next.delete('error');
      next.delete('error_description');
      const qs = next.toString();
      window.history.replaceState({}, '', qs ? `?${qs}` : window.location.pathname);
    }
  }, []);

  const runKeycloakInit = useCallback(async () => {
    const kc = getKeycloak();

    const onAuthError = () => {
      setAuthError('Authentication failed');
      setIsAuthenticated(false);
      setUser(null);
    };

    const onTokenExpired = () => {
      kc.updateToken(-1).catch(() => {
        setAuthError('Session expired');
        setIsAuthenticated(false);
        setUser(null);
      });
    };

    kc.onAuthError = onAuthError;
    kc.onTokenExpired = onTokenExpired;

    const doInit = async (): Promise<boolean> => {
      // Use current URL so refresh on /documents/view/xxx returns to same path (not /)
      const redirectUri =
        typeof window !== 'undefined'
          ? window.location.origin + window.location.pathname + window.location.search
          : config.origin;
      return kc.init({
        onLoad: 'check-sso',
        redirectUri,
        pkceMethod: 'S256',
      });
    };

    if (initPromise !== null) {
      // React Strict Mode: effect ran twice; reuse first init, don't call init() again
      try {
        const auth = await initPromise;
        setIsAuthenticated(auth);
        if (auth && kc.tokenParsed) {
          setUser(parseUserFromToken(kc));
          const token = await kc.updateToken(30).then(() => kc.token);
          if (token) await syncTokenToBackend(token);
        } else {
          setUser(null);
        }
      } catch (e) {
        console.error('Keycloak init failed:', e);
        const base = config.keycloak.url.replace(/\/$/, '');
        const hint = `${base}/realms/${config.keycloak.realm}`;
        const msg =
          e instanceof Error && e.message
            ? `Cannot reach Keycloak: ${e.message}. Check ${hint} (is Keycloak running?)`
            : `Cannot reach Keycloak at ${hint}. Is Keycloak running? Check VITE_KEYCLOAK_URL.`;
        setAuthError(msg);
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    initPromise = doInit();
    try {
      const auth = await initPromise;
      setIsAuthenticated(auth);
      if (auth && kc.tokenParsed) {
        setUser(parseUserFromToken(kc));
        const token = await kc.updateToken(30).then(() => kc.token);
        if (token) await syncTokenToBackend(token);
      } else {
        setUser(null);
      }
    } catch (e) {
      console.error('Keycloak init failed:', e);
      const base = config.keycloak.url.replace(/\/$/, '');
      const hint = `${base}/realms/${config.keycloak.realm}`;
      const msg =
        e instanceof Error && e.message
          ? `Cannot reach Keycloak: ${e.message}. Check ${hint} (is Keycloak running?)`
          : `Cannot reach Keycloak at ${hint}. Is Keycloak running? Check VITE_KEYCLOAK_URL.`;
      setAuthError(msg);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    runKeycloakInit();
  }, [runKeycloakInit]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const retryAuth = useCallback(() => {
    setAuthError(null);
    setIsLoading(true);
    getKeycloak(true); // force new instance
    runKeycloakInit();
  }, [runKeycloakInit]);

  const login = useCallback(() => {
    setAuthError(null);
    // Use current path so after login we return to the page user was on
    const redirectUri =
      typeof window !== 'undefined'
        ? window.location.origin + window.location.pathname + window.location.search
        : config.origin;
    getKeycloak().login({ redirectUri });
  }, []);

  const logout = useCallback(async () => {
    const kc = getKeycloak();
    setAuthError(null);
    try {
      await fetch(`${config.apiUrl}/clear-session`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Proceed with Keycloak logout
    }
    // Full logout: redirect to Keycloak, then back to app. Requires frontend URL in
    // Keycloak client "Valid Post Logout Redirect URIs". If misconfigured, falls back to local clear.
    const redirectUri = config.origin;
    if (typeof kc.logout === 'function') {
      kc.logout({ redirectUri });
      // logout() redirects; state updates below won't run
      return;
    }
    if (typeof kc.clearToken === 'function') kc.clearToken();
    setIsAuthenticated(false);
    setUser(null);
    navigate('/', { replace: true });
  }, [navigate]);

  const getToken = useCallback(async () => {
    const kc = getKeycloak();
    try {
      const refreshed = await kc.updateToken(30);
      if (refreshed && kc.tokenParsed) {
        const u = parseUserFromToken(kc);
        if (u) setUser(u);
        const token = kc.token;
        if (token) await syncTokenToBackend(token);
      }
      return kc.token ?? undefined;
    } catch {
      return undefined;
    }
  }, []);

  useEffect(() => {
    setAuthTokenProvider(getToken);
  }, [getToken]);

  const isAdmin = hasAdminRole(user);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, isAdmin, authError, clearAuthError, retryAuth, login, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
