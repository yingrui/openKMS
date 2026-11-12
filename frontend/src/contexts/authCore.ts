import { createContext, useCallback, useContext, useEffect, useMemo, useState, startTransition } from 'react';
import { config, type AuthMode } from '../config';
import { authAwareFetch } from '../data/apiClient';
import {
  buildFrontendPatternUnion,
  isSpaPublicPath,
  pathnameAllowedByPatterns,
  type PermissionCatalogEntry,
} from '../utils/permissionPatterns';
import { PERM_CONSOLE_ACCESS } from '../config/permissions';

const ADMIN_ROLE = 'admin';

export interface AuthUser {
  /** JWT ``sub`` — matches ``created_by`` on server records. */
  id: string;
  username: string;
  email?: string;
  name?: string;
  roles: string[];
  /** From GET /api/auth/me (full list for IdP admins). */
  permissions: string[];
  /** Saved UI language when set in Settings (synced from DB). */
  ui_locale?: 'en' | 'zh-CN' | null;
}

export interface AuthContextValue {
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
  /** True if JWT admin / `all`, or user has `console:access`. */
  canAccessConsole: boolean;
  hasPermission: (permissionKey: string) => boolean;
  /** Union of ``frontend_route_patterns`` for the user's keys; public SPA paths always allowed. */
  canAccessPath: (pathname: string) => boolean;
  /** False until permission-catalog fetch finished (or skipped when logged out). */
  permissionPatternsReady: boolean;
  /** Re-fetch ``/api/auth/me`` (e.g. after updating locale in Settings). */
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function userFromMeJson(u: {
  id?: string;
  username: string;
  email?: string;
  is_admin?: boolean;
  roles?: string[];
  permissions?: string[];
  ui_locale?: string | null;
}): AuthUser {
  const roles = u.roles?.length ? u.roles : u.is_admin ? [ADMIN_ROLE] : [];
  const ul = u.ui_locale === 'en' || u.ui_locale === 'zh-CN' ? u.ui_locale : null;
  return {
    id: (u.id && u.id.trim()) || u.username,
    username: u.username,
    email: u.email,
    name: u.username,
    roles,
    permissions: Array.isArray(u.permissions) ? u.permissions : [],
    ui_locale: ul,
  };
}

export function hasAdminRole(user: AuthUser | null): boolean {
  return user?.roles?.includes(ADMIN_ROLE) ?? false;
}

export function buildPermissionHelpers(user: AuthUser | null) {
  const hasPermission = (key: string) => {
    if (!user) return false;
    if (user.roles.includes(ADMIN_ROLE)) return true;
    if (user.permissions.includes('all')) return true;
    return user.permissions.includes(key);
  };
  const canAccessConsole = hasPermission(PERM_CONSOLE_ACCESS);
  return { hasPermission, canAccessConsole };
}

export function useFrontendPermissionGate(
  isAuthenticated: boolean,
  user: AuthUser | null,
  getToken: () => Promise<string | undefined>,
): { canAccessPath: (pathname: string) => boolean; permissionPatternsReady: boolean } {
  const [catalog, setCatalog] = useState<PermissionCatalogEntry[] | null>(null);
  const [ready, setReady] = useState(false);

  /** Stable key so we do not re-fetch when `user` is a new object reference with the same identity/permissions. */
  const catalogFetchKey = useMemo(() => {
    if (!isAuthenticated || !user) return '';
    const roles = [...user.roles].sort().join(',');
    const perms = [...user.permissions].sort().join(',');
    return `${user.username}\x1e${roles}\x1e${perms}`;
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (!catalogFetchKey) {
      startTransition(() => {
        setCatalog(null);
        setReady(true);
      });
      return;
    }
    let cancelled = false;
    startTransition(() => {
      setReady(false);
    });
    void (async () => {
      try {
        const headers: Record<string, string> = {};
        const token = await getToken();
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
        const res = await authAwareFetch(`${config.apiUrl}/api/auth/permission-catalog`, {
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
  }, [catalogFetchKey, getToken]);

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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
