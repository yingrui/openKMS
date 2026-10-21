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
      limit: filters.limit,
      before: filters.before,
    },
  });
}
