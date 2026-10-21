import { request } from './apiClient';

/** One mutation from the backend's log. Shape mirrors `audit_events` (see `docs/security.md`). */
export interface AuditEvent {
  id: string;
  at: string;
  actor_sub: string | null;
  actor_name: string | null;
  auth_mode: string | null;
  method: string;
  path: string;
  status_code: number;
  resource_type: string | null;
  resource_id: string | null;
  detail: Record<string, unknown> | null;
}

export interface AuditEventListResponse {
  items: AuditEvent[];
  total: number;
}

export interface AuditFilters {
  actor_sub?: string;
  resource_type?: string;
  resource_id?: string;
  method?: string;
  path?: string;
  /** A group: `ok` (2xx), `4xx`, `5xx`, `error`. */
  status?: string;
  limit: number;
  /** Keyset cursor: the `at` of the last row you have. */
  before?: string;
}

export async function fetchAuditEvents(filters: AuditFilters): Promise<AuditEventListResponse> {
  return request<AuditEventListResponse>('/api/console/audit-events', {
    query: {
      actor_sub: filters.actor_sub,
      resource_type: filters.resource_type,
      resource_id: filters.resource_id,
      method: filters.method,
      path: filters.path,
      status: filters.status,
      limit: filters.limit,
      before: filters.before,
    },
  });
}

export interface AuditFacet {
  value: string;
  label: string | null;
  count: number;
}

export interface AuditFacetsResponse {
  resource_types: AuditFacet[];
  statuses: AuditFacet[];
  actors: AuditFacet[];
  since: string;
}

/** Counts for the rail — where changes happened, how they turned out, who made them. */
export async function fetchAuditFacets(days = 30): Promise<AuditFacetsResponse> {
  return request<AuditFacetsResponse>('/api/console/audit-events/facets', { query: { days } });
}
