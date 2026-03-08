// Configuration for the openKMS frontend (Vite uses import.meta.env, not process.env)
/** In dev, use proxy ('' = same origin). Override with VITE_API_URL if backend runs elsewhere. */
export const config = {
  apiUrl: import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : 'http://localhost:8102'),
  /** Frontend origin for Keycloak redirect URIs (must match Keycloak client config) */
  origin: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
  keycloak: {
    url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8081',
    realm: import.meta.env.VITE_KEYCLOAK_REALM || 'openkms',
    clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'openkms-frontend',
  },
};
