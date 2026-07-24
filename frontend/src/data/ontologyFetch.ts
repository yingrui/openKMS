/** Shared auth-aware fetch helper for ontology HTTP APIs. */

import { authAwareFetch, getAuthHeaders } from './apiClient';

function formatDetail(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && 'message' in detail) {
    const msg = (detail as { message?: unknown }).message;
    const errors = (detail as { errors?: unknown }).errors;
    if (typeof msg === 'string' && Array.isArray(errors)) {
      return `${msg}: ${errors.join('; ')}`;
    }
    if (typeof msg === 'string') return msg;
  }
  return fallback;
}

export async function ontologyFetch<T>(
  path: string,
  init?: RequestInit,
  errorLabel = 'Request failed',
): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(path, {
    ...init,
    headers: {
      ...headers,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(formatDetail((err as { detail?: unknown }).detail, `${errorLabel}: ${res.status}`));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type OntologyExecutionResult = {
  status: 'ok' | 'error' | string;
  output?: Record<string, unknown>;
  error?: string;
  duration_ms?: number;
  execution_id?: string;
  log_id?: string;
};
