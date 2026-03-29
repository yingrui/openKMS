import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Keycloak from 'keycloak-js';
import { config, type AuthMode } from '../config';
import { setAuthTokenProvider } from '../data/apiClient';
import './AuthContext.css';

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
  /** Local auth only: sync session cookie and set user after login/register. */
  completeLocalSession: (accessToken: string) => Promise<void>;
  /** From GET /api/auth/public-config when available; aligns UI with OPENKMS_AUTH_MODE. */
  authMode: AuthMode;
  /** False until public-config is fetched or fallback applied after API error. */
  authModeReady: boolean;
  /** Local mode only: server allows POST /api/auth/register. */
  allowSignup: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

let keycloak: Keycloak | null = null;
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

function userFromMeJson(u: { username: string; email?: string; is_admin?: boolean }): AuthUser {
  const roles = u.is_admin ? [ADMIN_ROLE] : [];
  return {
    username: u.username,
    email: u.email,
    name: u.username,
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
    // Ignore; API may still work via Bearer on each request
  }
}

type PublicAuthConfigJson = { auth_mode: string; allow_signup?: boolean };

async function fetchPublicAuthConfig(): Promise<PublicAuthConfigJson> {
  const res = await fetch(`${config.apiUrl}/api/auth/public-config`);
  if (!res.ok) throw new Error(`public-config ${res.status}`);
  return (await res.json()) as PublicAuthConfigJson;
}

function normalizeAuthMode(v: string | undefined): AuthMode {
  return v === 'local' ? 'local' : 'oidc';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
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

  const skeletonValue = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: false,
      isLoading: true,
      user: null,
      isAdmin: false,
      authError: null,
      clearAuthError: () => {},
      retryAuth: () => {},
      login: () => {},
      logout: () => {},
      getToken: async () => undefined,
      completeLocalSession: async () => {},
      authMode,
      authModeReady: ready,
      allowSignup,
    }),
    [authMode, ready, allowSignup]
  );

  return (
    <>
      {compatWarning && (
        <p className="auth-mode-compat-banner" role="status">
          {compatWarning}
        </p>
      )}
      {!ready ? (
        <AuthContext.Provider value={skeletonValue}>{children}</AuthContext.Provider>
      ) : authMode === 'local' ? (
        <LocalAuthProvider authMode={authMode} authModeReady allowSignup={allowSignup}>
          {children}
        </LocalAuthProvider>
      ) : (
        <OidcAuthProvider authMode={authMode} authModeReady allowSignup={false}>
          {children}
        </OidcAuthProvider>
      )}
    </>
  );
}

function LocalAuthProvider({
  children,
  authMode,
  authModeReady,
  allowSignup,
}: {
  children: React.ReactNode;
  authMode: AuthMode;
  authModeReady: boolean;
  allowSignup: boolean;
}) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch(`${config.apiUrl}/api/auth/me`, { credentials: 'include' });
      if (!res.ok) {
        setIsAuthenticated(false);
        setUser(null);
        return;
      }
      const data = await res.json();
      setUser(userFromMeJson(data));
      setIsAuthenticated(true);
    } catch {
      setIsAuthenticated(false);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void loadSession().finally(() => setIsLoading(false));
  }, [loadSession]);

  const completeLocalSession = useCallback(
    async (accessToken: string) => {
      await syncTokenToBackend(accessToken);
      const res = await fetch(`${config.apiUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Could not load profile');
      }
      const data = await res.json();
      setUser(userFromMeJson(data));
      setIsAuthenticated(true);
      setAuthError(null);
    },
    []
  );

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const retryAuth = useCallback(async () => {
    setAuthError(null);
    setIsLoading(true);
    await loadSession();
    setIsLoading(false);
  }, [loadSession]);

  const login = useCallback(() => {
    setAuthError(null);
    navigate('/login');
  }, [navigate]);

  const logout = useCallback(async () => {
    setAuthError(null);
    try {
      await fetch(`${config.apiUrl}/clear-session`, { method: 'POST', credentials: 'include' });
      await fetch(`${config.apiUrl}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {
      // ignore
    }
    setIsAuthenticated(false);
    setUser(null);
    navigate('/', { replace: true });
  }, [navigate]);

  /** Session cookie carries JWT; API calls use credentials: 'include'. */
  const getToken = useCallback(async () => undefined, []);

  useEffect(() => {
    setAuthTokenProvider(getToken);
  }, [getToken]);

  const isAdmin = hasAdminRole(user);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        isAdmin,
        authError,
        clearAuthError,
        retryAuth,
        login,
        logout,
        getToken,
        completeLocalSession,
        authMode,
        authModeReady,
        allowSignup,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function OidcAuthProvider({
  children,
  authMode,
  authModeReady,
  allowSignup,
}: {
  children: React.ReactNode;
  authMode: AuthMode;
  authModeReady: boolean;
  allowSignup: boolean;
}) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const navigate = useNavigate();

  const noopComplete = useCallback(async (_accessToken: string) => {
    /* OIDC mode: not used */
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    const errDesc = params.get('error_description');
    if (err) {
      setAuthError(errDesc || err);
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
        console.error('OIDC init failed:', e);
        const base = config.keycloak.url.replace(/\/$/, '');
        const hint = `${base}/realms/${config.keycloak.realm}`;
        const msg =
          e instanceof Error && e.message
            ? `Cannot reach identity provider: ${e.message}. Check ${hint}`
            : `Cannot reach identity provider at ${hint}. Check VITE_KEYCLOAK_URL.`;
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
      console.error('OIDC init failed:', e);
      const base = config.keycloak.url.replace(/\/$/, '');
      const hint = `${base}/realms/${config.keycloak.realm}`;
      const msg =
        e instanceof Error && e.message
          ? `Cannot reach identity provider: ${e.message}. Check ${hint}`
          : `Cannot reach identity provider at ${hint}. Check VITE_KEYCLOAK_URL.`;
      setAuthError(msg);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void runKeycloakInit();
  }, [runKeycloakInit]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const retryAuth = useCallback(() => {
    setAuthError(null);
    setIsLoading(true);
    initPromise = null;
    getKeycloak(true);
    void runKeycloakInit();
  }, [runKeycloakInit]);

  const login = useCallback(() => {
    setAuthError(null);
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
      // proceed
    }
    const redirectUri = config.origin;
    if (typeof kc.logout === 'function') {
      kc.logout({ redirectUri });
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
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        isAdmin,
        authError,
        clearAuthError,
        retryAuth,
        login,
        logout,
        getToken,
        completeLocalSession: noopComplete,
        authMode,
        authModeReady,
        allowSignup,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
