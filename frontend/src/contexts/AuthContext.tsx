import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from 'oidc-client-ts';
import { config, type AuthMode } from '../config';
import { getUserManager } from '../oidc/userManager';
import { setAuthTokenProvider } from '../data/apiClient';
import {
  buildFrontendPatternUnion,
  isSpaPublicPath,
  pathnameAllowedByPatterns,
  type PermissionCatalogEntry,
} from '../utils/permissionPatterns';
import './AuthContext.css';

const ADMIN_ROLE = 'admin';

export interface AuthUser {
  username: string;
  email?: string;
  name?: string;
  roles: string[];
  /** From GET /api/auth/me (full list for IdP admins). */
  permissions: string[];
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
  /** True if JWT admin or user has `console:access`. */
  canAccessConsole: boolean;
  hasPermission: (permissionKey: string) => boolean;
  /** Union of ``frontend_route_patterns`` for the user's keys; public SPA paths always allowed. */
  canAccessPath: (pathname: string) => boolean;
  /** False until permission-catalog fetch finished (or skipped when logged out). */
  permissionPatternsReady: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeAccessTokenPayload(accessToken: string): Record<string, unknown> | null {
  try {
    const segment = accessToken.split('.')[1];
    if (!segment) return null;
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseUserFromOidc(user: User | null | undefined): AuthUser | null {
  if (!user) return null;
  const p = user.profile;
  let roles: string[] = [];
  const payload = user.access_token ? decodeAccessTokenPayload(user.access_token) : null;
  const ra = payload?.realm_access;
  if (ra && typeof ra === 'object' && ra !== null && Array.isArray((ra as { roles?: unknown }).roles)) {
    roles = (ra as { roles: string[] }).roles;
  }
  const username =
    (typeof p.preferred_username === 'string' && p.preferred_username) ||
    (typeof p.name === 'string' && p.name) ||
    (typeof p.sub === 'string' && p.sub) ||
    'user';
  return {
    username,
    email: typeof p.email === 'string' ? p.email : undefined,
    name: (typeof p.name === 'string' && p.name) || username,
    roles,
    permissions: [],
  };
}

function userFromMeJson(u: {
  username: string;
  email?: string;
  is_admin?: boolean;
  roles?: string[];
  permissions?: string[];
}): AuthUser {
  const roles = u.roles?.length ? u.roles : u.is_admin ? [ADMIN_ROLE] : [];
  return {
    username: u.username,
    email: u.email,
    name: u.username,
    roles,
    permissions: Array.isArray(u.permissions) ? u.permissions : [],
  };
}

function hasAdminRole(user: AuthUser | null): boolean {
  return user?.roles?.includes(ADMIN_ROLE) ?? false;
}

function buildPermissionHelpers(user: AuthUser | null) {
  const isAdmin = hasAdminRole(user);
  const hasPermission = (key: string) => {
    if (!user) return false;
    if (user.roles.includes(ADMIN_ROLE)) return true;
    if (user.permissions.includes('all')) return true;
    return user.permissions.includes(key);
  };
  const canAccessConsole =
    isAdmin ||
    (user?.permissions.includes('all') ?? false) ||
    (user?.permissions.some((p) => p.startsWith('console:')) ?? false);
  return { hasPermission, canAccessConsole };
}

function useFrontendPermissionGate(
  isAuthenticated: boolean,
  user: AuthUser | null,
  getToken: () => Promise<string | undefined>,
): { canAccessPath: (pathname: string) => boolean; permissionPatternsReady: boolean } {
  const [catalog, setCatalog] = useState<PermissionCatalogEntry[] | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setCatalog(null);
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    void (async () => {
      try {
        const headers: Record<string, string> = {};
        const token = await getToken();
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
        const res = await fetch(`${config.apiUrl}/api/auth/permission-catalog`, {
          credentials: 'include',
          headers,
        });
        if (cancelled) {
          return;
        }
        if (!res.ok) {
          setCatalog(null);
        } else {
          const data = (await res.json()) as PermissionCatalogEntry[];
          setCatalog(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) {
          setCatalog(null);
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.username, user?.email, getToken]);

  const canAccessPath = useCallback(
    (pathname: string) => {
      if (!isAuthenticated || !user) {
        return true;
      }
      if (user.roles.includes(ADMIN_ROLE) || user.permissions.includes('all')) {
        return true;
      }
      if (isSpaPublicPath(pathname)) {
        return true;
      }
      if (!ready) {
        return true;
      }
      if (catalog === null) {
        return true;
      }
      const union = buildFrontendPatternUnion(catalog, user.permissions);
      if (union.length === 0) {
        return false;
      }
      return pathnameAllowedByPatterns(pathname, union);
    },
    [isAuthenticated, user, ready, catalog],
  );

  return { canAccessPath, permissionPatternsReady: ready };
}

async function fetchAuthMeWithBearer(accessToken: string): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${config.apiUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      username: string;
      email?: string;
      is_admin?: boolean;
      roles?: string[];
      permissions?: string[];
    };
    return userFromMeJson(data);
  } catch {
    return null;
  }
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
      canAccessConsole: false,
      hasPermission: () => false,
      canAccessPath: () => true,
      permissionPatternsReady: false,
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
  const { hasPermission, canAccessConsole } = useMemo(() => buildPermissionHelpers(user), [user]);
  const { canAccessPath, permissionPatternsReady } = useFrontendPermissionGate(isAuthenticated, user, getToken);

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
        canAccessConsole,
        hasPermission,
        canAccessPath,
        permissionPatternsReady,
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

  const runOidcInit = useCallback(async () => {
    const mgr = getUserManager();
    try {
      let u = await mgr.getUser();
      if (u?.expired) {
        try {
          u = await mgr.signinSilent();
        } catch {
          u = null;
        }
      }
      if (u && !u.expired) {
        let profile = parseUserFromOidc(u);
        if (u.access_token) {
          await syncTokenToBackend(u.access_token);
          const me = await fetchAuthMeWithBearer(u.access_token);
          if (me) profile = me;
        }
        setUser(profile);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (e) {
      console.error('OIDC init failed:', e);
      const hint = config.oidc.authority;
      const msg =
        e instanceof Error && e.message
          ? `Cannot reach identity provider: ${e.message}. Check VITE_OIDC_ISSUER (${hint})`
          : `Cannot reach identity provider. Check VITE_OIDC_ISSUER (${hint}).`;
      setAuthError(msg);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void runOidcInit();
  }, [runOidcInit]);

  useEffect(() => {
    const mgr = getUserManager();
    const onLoaded = (u: User) => {
      void (async () => {
        let profile = parseUserFromOidc(u);
        if (u.access_token) {
          await syncTokenToBackend(u.access_token);
          const me = await fetchAuthMeWithBearer(u.access_token);
          if (me) profile = me;
        }
        setUser(profile);
        setIsAuthenticated(true);
      })();
    };
    const onUnloaded = () => {
      setUser(null);
      setIsAuthenticated(false);
    };
    mgr.events.addUserLoaded(onLoaded);
    mgr.events.addUserUnloaded(onUnloaded);
    return () => {
      mgr.events.removeUserLoaded(onLoaded);
      mgr.events.removeUserUnloaded(onUnloaded);
    };
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const retryAuth = useCallback(() => {
    setAuthError(null);
    setIsLoading(true);
    void getUserManager()
      .removeUser()
      .then(() => runOidcInit());
  }, [runOidcInit]);

  const login = useCallback(() => {
    setAuthError(null);
    void getUserManager().signinRedirect();
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    try {
      await fetch(`${config.apiUrl}/clear-session`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // proceed
    }
    try {
      await getUserManager().signoutRedirect();
    } catch {
      await getUserManager().removeUser();
      setIsAuthenticated(false);
      setUser(null);
      navigate('/', { replace: true });
    }
  }, [navigate]);

  const getToken = useCallback(async () => {
    const mgr = getUserManager();
    try {
      let u = await mgr.getUser();
      if (!u) return undefined;
      if (u.expired) {
        u = await mgr.signinSilent();
        if (!u) return undefined;
      }
      if (u.access_token) {
        await syncTokenToBackend(u.access_token);
        const me = await fetchAuthMeWithBearer(u.access_token);
        setUser(me ?? parseUserFromOidc(u) ?? null);
      }
      return u.access_token;
    } catch {
      return undefined;
    }
  }, []);

  useEffect(() => {
    setAuthTokenProvider(getToken);
  }, [getToken]);

  const isAdmin = hasAdminRole(user);
  const { hasPermission, canAccessConsole } = useMemo(() => buildPermissionHelpers(user), [user]);
  const { canAccessPath, permissionPatternsReady } = useFrontendPermissionGate(isAuthenticated, user, getToken);

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
        canAccessConsole,
        hasPermission,
        canAccessPath,
        permissionPatternsReady,
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
