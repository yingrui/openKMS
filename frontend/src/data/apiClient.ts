/** Central API client. Injects auth token from provider (set by AuthProvider). */

import { config } from '../config';
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

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

/** Builds a `?a=b&c=d` query string, skipping `undefined`/`null`/`''` values. Returns `''` when nothing remains. */
export function buildQuery(params?: QueryParams): string {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

function resolveUrl(path: string, query?: QueryParams): string {
  const base = path.startsWith('/') ? `${config.apiUrl}${path}` : path;
  return `${base}${buildQuery(query)}`;
}

/** Extracts a human-readable message from a FastAPI-style `{ detail: string | { message } | [...] }` error body. */
function extractErrorMessage(bodyText: string, fallback: string): string {
  const parsed = parseJsonDetail(bodyText);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const detail = (parsed as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail) return detail;
    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      const message = (detail as { message?: unknown }).message;
      const errors = (detail as { errors?: unknown }).errors;
      if (typeof message === 'string' && Array.isArray(errors)) return `${message}: ${errors.join('; ')}`;
      if (typeof message === 'string' && message) return message;
    }
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: unknown };
      if (first && typeof first.msg === 'string') return first.msg;
    }
  }
  return bodyText.trim() || fallback;
}

/** Error thrown by `request()`/`requestText()`/`requestBlob()`/`requestRaw()` for non-OK responses. */
export type RequestError = Error & { status: number };

async function throwForResponse(res: Response): Promise<never> {
  const bodyText = await res.text().catch(() => '');
  const err = new Error(extractErrorMessage(bodyText, `Request failed: ${res.status}`)) as RequestError;
  err.status = res.status;
  throw err;
}

async function fetchWithAuth(path: string, init?: RequestInit & { query?: QueryParams }): Promise<Response> {
  const { query, headers, ...rest } = init ?? {};
  const url = resolveUrl(path, query);
  const authHeaders = await getAuthHeaders();
  const mergedHeaders = new Headers(headers);
  for (const [key, value] of Object.entries(authHeaders)) {
    if (value && !mergedHeaders.has(key)) mergedHeaders.set(key, value);
  }
  return authAwareFetch(url, {
    credentials: 'include',
    ...rest,
    headers: mergedHeaders,
  });
}

/**
 * Central JSON request helper: resolves `path` against `config.apiUrl` (when it starts with `/`), attaches auth
 * headers, and throws a human-readable `Error` for non-OK responses. Returns `undefined` for `204 No Content`.
 */
export async function request<T>(path: string, init?: RequestInit & { query?: QueryParams }): Promise<T> {
  const res = await fetchWithAuth(path, init);
  if (!res.ok) {
    await throwForResponse(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

/** Like `request()`, but returns the raw `Response` for callers that need headers (e.g. `content-disposition`). */
export async function requestRaw(path: string, init?: RequestInit & { query?: QueryParams }): Promise<Response> {
  const res = await fetchWithAuth(path, init);
  if (!res.ok) {
    await throwForResponse(res);
  }
  return res;
}

/** Like `request()`, but resolves the raw response body as text (e.g. plain-text exports). */
export async function requestText(path: string, init?: RequestInit & { query?: QueryParams }): Promise<string> {
  const res = await fetchWithAuth(path, init);
  if (!res.ok) {
    await throwForResponse(res);
  }
  return res.text();
}

/** Like `request()`, but resolves the raw response body as a `Blob` (e.g. file downloads). */
export async function requestBlob(path: string, init?: RequestInit & { query?: QueryParams }): Promise<Blob> {
  const res = await fetchWithAuth(path, init);
  if (!res.ok) {
    await throwForResponse(res);
  }
  return res.blob();
}
