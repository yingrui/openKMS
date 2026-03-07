import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Keycloak from 'keycloak-js';
import { config } from '../config';

export interface AuthUser {
  username: string;
  email?: string;
  name?: string;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  login: () => void;
  logout: () => void;
  getToken: () => Promise<string | undefined>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

let keycloak: Keycloak | null = null;

function getKeycloak() {
  if (!keycloak) {
    keycloak = new Keycloak({
      url: config.keycloak.url,
      realm: config.keycloak.realm,
      clientId: config.keycloak.clientId,
    });
  }
  return keycloak;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const kc = getKeycloak();
    kc.init({ onLoad: 'check-sso' })
      .then((auth) => {
        setIsAuthenticated(auth);
        if (auth && kc.tokenParsed) {
          const parsed = kc.tokenParsed as Record<string, unknown>;
          setUser({
            username: (parsed.preferred_username as string) || 'user',
            email: parsed.email as string | undefined,
            name: (parsed.name as string) || (parsed.preferred_username as string),
          });
        }
      })
      .catch(() => setIsAuthenticated(false))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(() => {
    getKeycloak().login();
  }, []);

  const logout = useCallback(() => {
    getKeycloak().logout();
  }, []);

  const getToken = useCallback(async () => {
    const kc = getKeycloak();
    try {
      const refreshed = await kc.updateToken(30);
      if (refreshed && kc.tokenParsed) {
        const parsed = kc.tokenParsed as Record<string, unknown>;
        setUser({
          username: (parsed.preferred_username as string) || 'user',
          email: parsed.email as string | undefined,
          name: (parsed.name as string) || (parsed.preferred_username as string),
        });
      }
      return kc.token;
    } catch {
      return undefined;
    }
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
