/** Central API client. Injects auth token from provider (set by AuthProvider). */

let tokenProvider: (() => Promise<string | undefined>) | null = null;

/** Clears SPA auth state when the API rejects the JWT (see backend `require_auth` / verify). */
let sessionExpiredHandler: (() => void) | null = null;

let sessionExpiredNotifyLock = false;

/** Replaces backend `Invalid or expired token` in the `Response` so UI layers (toasts, banners) show copy meant for humans. */
export const SESSION_EXPIRED_API_DETAIL = 'Your session has expired. Please sign in again.';

export function setAuthTokenProvider(provider: () => Promise<string | undefined>): void {
  tokenProvider = provider;
}

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

/** True when the API verified a token was present but invalid/expired (OpenKMS JWT / OIDC). */
export function isRejectedJwtResponse(status: number, bodyText: string): boolean {
  if (status !== 401) return false;
  const t = bodyText.trim();
  if (t.includes('Invalid or expired token')) return true;
  try {
    const j = JSON.parse(t) as { detail?: unknown };
    const d = j.detail;
    if (typeof d === 'string') {
      return d === 'Invalid or expired token' || d === 'Invalid token';
    }
  } catch {
    /* not JSON */
  }
  return false;
}

function notifySessionExpired(): void {
  if (!sessionExpiredHandler || sessionExpiredNotifyLock) return;
  sessionExpiredNotifyLock = true;
  try {
    sessionExpiredHandler();
  } finally {
    queueMicrotask(() => {
      sessionExpiredNotifyLock = false;
    });
  }
}

/**
 * Same as `fetch`, but when the response is 401 with an invalid/expired JWT body, runs the
 * handler registered by Auth (clears session so MainLayout shows "Authentication Required").
 */
export async function authAwareFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    const text = await res.clone().text();
    if (isRejectedJwtResponse(401, text)) {
      notifySessionExpired();
      // Still return 401 so callers branch on !res.ok, but avoid surfacing FastAPI's internal phrase in toasts.
      return new Response(JSON.stringify({ detail: SESSION_EXPIRED_API_DETAIL }), {
        status: 401,
        statusText: res.statusText,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
  return res;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = tokenProvider ? await tokenProvider() : undefined;
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}
