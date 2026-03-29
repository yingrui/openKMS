// Configuration for the openKMS frontend (Vite uses import.meta.env, not process.env)
/** In dev, use proxy ('' = same origin). Override with VITE_API_URL if backend runs elsewhere. */
export type AuthMode = 'oidc' | 'local';

function buildOidcAuthority(): string {
  const issuer = import.meta.env.VITE_OIDC_ISSUER?.trim();
  if (issuer) return issuer.replace(/\/$/, '');
  const base = (import.meta.env.VITE_OIDC_AUTH_SERVER_BASE_URL || 'http://localhost:8081')
    .toString()
    .replace(/\/$/, '');
  const realm = (import.meta.env.VITE_OIDC_REALM || 'openkms').toString();
  return `${base}/realms/${realm}`;
}

export const config = {
  apiUrl: import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : 'http://localhost:8102'),
  /**
   * Fallback when /api/auth/public-config is unreachable. At runtime the app prefers the API value
   * so OPENKMS_AUTH_MODE (local vs OIDC IdP) stays aligned with the UI.
   */
  authMode: (import.meta.env.VITE_AUTH_MODE === 'local' ? 'local' : 'oidc') as AuthMode,
  /** Frontend origin for OIDC redirect URIs (must match IdP client config) */
  origin: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
  /** Standard OIDC: issuer URL (OpenID Provider metadata at {issuer}/.well-known/openid-configuration). */
  oidc: {
    authority: buildOidcAuthority(),
    clientId: import.meta.env.VITE_OIDC_CLIENT_ID || 'openkms-frontend',
  },
};
