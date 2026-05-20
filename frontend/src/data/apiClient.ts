/** Central API client. Injects auth token from provider (set by AuthProvider). */

import { getStoredLocale } from '../i18n/config';

let tokenProvider: (() => Promise<string | undefined>) | null = null;

/** Clears SPA auth state when the API rejects the JWT (see backend `require_auth` / verify). */
let sessionExpiredHandler: (() => void) | null = null;

let sessionExpiredNotifyLock = false;

/** One silent recover attempt (OIDC `signinSilent` + sync-session; local cookie `/me` check). */
let sessionRetryProvider: (() => Promise<boolean>) | null = null;

/** Replaces backend `Invalid or expired token` in the `Response` so UI layers (toasts, banners) show copy meant for humans. */
export const SESSION_EXPIRED_API_DETAIL = 'Your session has expired. Please sign in again.';

const AUTH_SESSION_FAILURE_CODES = new Set([
  'AUTHENTICATION_REQUIRED',
  'BEARER_TOKEN_REQUIRED',
  'INVALID_OR_EXPIRED_TOKEN',
  'INVALID_TOKEN',
]);

export function setAuthTokenProvider(provider: () => Promise<string | undefined>): void {
  tokenProvider = provider;
}

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

export function setSessionRetryProvider(provider: (() => Promise<boolean>) | null): void {
  sessionRetryProvider = provider;
}

function parseJsonDetail(bodyText: string): unknown {
  const t = bodyText.trim();
  if (!t || (t[0] !== '{' && t[0] !== '[')) {
    return null;
  }
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return null;
  }
}

function extractDetailCode(bodyText: string): string | null {
  const j = parseJsonDetail(bodyText);
  if (!j || typeof j !== 'object' || Array.isArray(j)) {
    return null;
  }
  const detail = (j as { detail?: unknown }).detail;
  if (typeof detail === 'object' && detail !== null && !Array.isArray(detail)) {
    const code = (detail as { code?: unknown }).code;
    if (typeof code === 'string') {
      return code;
    }
  }
  if (typeof detail === 'string') {
    return detail;
  }
  return null;
}

/** True when the API verified a token was present but invalid/expired (OpenKMS JWT / OIDC), or auth is required. */
export function isRejectedJwtResponse(status: number, bodyText: string): boolean {
  if (status !== 401) {
    return false;
  }
  const code = extractDetailCode(bodyText);
  if (code && AUTH_SESSION_FAILURE_CODES.has(code)) {
    return true;
  }
  if (code === 'Invalid or expired token' || code === 'Invalid token') {
    return true;
  }
  const t = bodyText.trim();
  if (t.includes('Invalid or expired token')) {
    return true;
  }
  const lower = t.toLowerCase();
  if (lower.includes('not enough segments')) {
    return true;
  }
  return false;
}

function shouldAttempt401Recovery(bodyText: string): boolean {
  if (isRejectedJwtResponse(401, bodyText)) {
    return true;
  }
  return Boolean(sessionRetryProvider && !bodyText.trim());
}

function notifySessionExpired(): void {
  if (!sessionExpiredHandler || sessionExpiredNotifyLock) {
    return;
  }
  sessionExpiredNotifyLock = true;
  try {
    sessionExpiredHandler();
  } finally {
    queueMicrotask(() => {
      sessionExpiredNotifyLock = false;
    });
  }
}

function replace401WithFriendlySessionBody(): Response {
  return new Response(JSON.stringify({ detail: SESSION_EXPIRED_API_DETAIL }), {
    status: 401,
    statusText: 'Unauthorized',
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mergeFreshAuthHeaders(init?: RequestInit): Promise<RequestInit> {
  const fresh = await getAuthHeaders();
  const h = new Headers(init?.headers ?? undefined);
  for (const [k, v] of Object.entries(fresh)) {
    if (v) {
      h.set(k, v);
    }
  }
  return { ...init, headers: h };
}

/**
 * Same as `fetch`, but when the response is 401 with an invalid/expired JWT body (or recoverable empty 401 when a
 * retry provider is registered), runs one silent session retry then the handler registered by Auth if still failing.
 */
export async function authAwareFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let res = await fetch(input, init);

  if (res.status !== 401) {
    return res;
  }

  const text = await res.clone().text();
  if (!shouldAttempt401Recovery(text)) {
    return res;
  }

  const retry = sessionRetryProvider;
  if (retry) {
    try {
      const recovered = await retry();
      if (recovered) {
        res = await fetch(input, await mergeFreshAuthHeaders(init));
        if (res.status !== 401) {
          return res;
        }
        const text2 = await res.clone().text();
        if (!shouldAttempt401Recovery(text2)) {
          return res;
        }
      }
    } catch {
      /* fall through */
    }
  }

  notifySessionExpired();
  return replace401WithFriendlySessionBody();
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = tokenProvider ? await tokenProvider() : undefined;
  const headers: Record<string, string> = {
    'Accept-Language': getStoredLocale(),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
