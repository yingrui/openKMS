/** Shared auth-aware fetch helper for ontology HTTP APIs. */

import { request } from './apiClient';

export async function ontologyFetch<T>(
  path: string,
  init?: RequestInit,
  errorLabel = 'Request failed',
): Promise<T> {
  try {
    return await request<T>(path, {
      ...init,
      headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) },
    });
  } catch (e) {
    throw new Error(e instanceof Error && e.message ? e.message : errorLabel);
  }
}

export type OntologyExecutionResult = {
  status: 'ok' | 'error' | string;
  output?: Record<string, unknown>;
  error?: string;
  duration_ms?: number;
  execution_id?: string;
  log_id?: string;
};
