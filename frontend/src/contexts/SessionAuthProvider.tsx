import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { config, type AuthMode } from '../config';
import { setAuthTokenProvider, setSessionExpiredHandler, setSessionRetryProvider } from '../data/apiClient';
import { applyLocaleFromAuthMe } from '../i18n/config';
import { clearReturnTo, consumeReturnTo, rememberReturnTo } from './authReturnTo';
import {
  AuthContext,
  type AuthUser,
  buildPermissionHelpers,
  hasAdminRole,
  useFrontendPermissionGate,
  userFromMeJson,
} from './authCore';

export function SessionAuthProvider({
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

  const loadSession = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${config.apiUrl}/api/auth/me`, { credentials: 'include' });
      if (!res.ok) {
        setUser(null);
        setIsAuthenticated(false);
        return false;
      }
      const data = await res.json();
      applyLocaleFromAuthMe((data as { ui_locale?: string | null }).ui_locale);
      setUser(userFromMeJson(data));
      setIsAuthenticated(true);
      return true;
    } catch {
      setUser(null);
      setIsAuthenticated(false);
      return false;
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      await loadSession();
      if (active) setIsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [loadSession]);

  const login = useCallback(() => {
    setAuthError(null);
    toast.dismiss();
    if (authMode === 'oidc') {
      const current = `${window.location.pathname}${window.location.search}`;
      const returnTo = consumeReturnTo(current.startsWith('/login') ? '/' : current);
      window.location.assign(
        `${config.apiUrl}/api/auth/oidc/login?returnTo=${encodeURIComponent(returnTo)}`,
      );
      return;
    }
    navigate('/login');
  }, [authMode, navigate]);

  const logout = useCallback(() => {
    setAuthError(null);
    toast.dismiss();
    setUser(null);
    setIsAuthenticated(false);
    clearReturnTo();
    if (authMode === 'oidc') {
      window.location.assign(`${config.apiUrl}/api/auth/oidc/logout`);
      return;
    }
    void (async () => {
      try {
        await fetch(`${config.apiUrl}/api/auth/logout`, {
          method: 'POST',
          credentials: 'include',
        });
      } catch {
        // local state is already cleared
      }
      navigate('/login', { replace: true });
    })();
  }, [authMode, navigate]);

  const sessionRetry = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${config.apiUrl}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return false;
      return await loadSession();
    } catch {
      return false;
    }
  }, [loadSession]);

  const completeLocalSession = useCallback(
    async (accessToken: string) => {
      void accessToken;
      if (!(await loadSession())) {
        throw new Error('Could not load profile');
      }
      setAuthError(null);
    },
    [loadSession],
  );

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const retryAuth = useCallback(async () => {
    setAuthError(null);
    setIsLoading(true);
    await loadSession();
    setIsLoading(false);
  }, [loadSession]);

  const getToken = useCallback(async () => undefined, []);

  useEffect(() => {
    setAuthTokenProvider(getToken);
  }, [getToken]);

  const onApiSessionInvalid = useCallback(() => {
    setAuthError(null);
    toast.dismiss();
    rememberReturnTo(`${window.location.pathname}${window.location.search}`);
    void (async () => {
      try {
        // Do not leave a still-valid server-side session behind: reloading /login
        // would otherwise call /me and sign the user straight back in.
        await fetch(`${config.apiUrl}/api/auth/logout`, {
          method: 'POST',
          credentials: 'include',
        });
      } catch {
        // local state is cleared below regardless
      }
      setUser(null);
      setIsAuthenticated(false);
      navigate('/login?notice=session_expired', { replace: true });
    })();
  }, [navigate]);

  useEffect(() => {
    setSessionRetryProvider(sessionRetry);
    return () => setSessionRetryProvider(null);
  }, [sessionRetry]);

  useEffect(() => {
    setSessionExpiredHandler(onApiSessionInvalid);
    return () => setSessionExpiredHandler(null);
  }, [onApiSessionInvalid]);

  const isAdmin = hasAdminRole(user);
  const { hasPermission, canAccessConsole } = useMemo(() => buildPermissionHelpers(user), [user]);
  const { canAccessPath, permissionPatternsReady } = useFrontendPermissionGate(isAuthenticated, user, getToken);

  const refreshUser = useCallback(async () => {
    await loadSession();
  }, [loadSession]);

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
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}


