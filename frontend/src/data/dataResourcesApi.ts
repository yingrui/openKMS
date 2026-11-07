/**
 * API for Catalog data resources: named, row-scoped slices of one semantic model.
 *
 * A data resource is the *access capability* operators grant in Data Security. The grants
 * themselves go through the shared resource-ACL API under `data_resource`.
 */
import { request } from './apiClient';

export type RowPolicyOperator =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'like'
  | 'in'
  | 'between'
  | 'is_null'
  | 'is_not_null';

export interface RowPolicyCondition {
  column: string;
  op: RowPolicyOperator;
  /** A literal value — mutually exclusive with `claim`. */
  value?: unknown;
  /** A dotted path into the caller's token claims, e.g. `org_id` or `ext.org.id`. */
  claim?: string;
}

export interface DataResourceResponse {
  id: string;
  name: string;
  description: string | null;
  semantic_model_id: string;
  row_policy: RowPolicyCondition[];
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface DataResourceListResponse {
  items: DataResourceResponse[];
  total: number;
}

export interface DataResourcePayload {
  name: string;
  description?: string | null;
  semantic_model_id: string;
  row_policy?: RowPolicyCondition[];
}

export async function fetchDataResources(
  semanticModelId?: string,
  opts?: { grantedOnly?: boolean },
): Promise<DataResourceListResponse> {
  const params = new URLSearchParams();
  if (semanticModelId) params.set('semantic_model_id', semanticModelId);
  if (opts?.grantedOnly) params.set('granted_only', '1');
  const qs = params.toString();
  return request<DataResourceListResponse>(`/api/data-resources${qs ? `?${qs}` : ''}`);
}

export async function fetchDataResource(id: string): Promise<DataResourceResponse> {
  return request<DataResourceResponse>(`/api/data-resources/${id}`);
}

export async function createDataResource(body: DataResourcePayload): Promise<DataResourceResponse> {
  return request<DataResourceResponse>('/api/data-resources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function updateDataResource(
  id: string,
  body: Partial<Omit<DataResourcePayload, 'semantic_model_id'>>,
): Promise<DataResourceResponse> {
  return request<DataResourceResponse>(`/api/data-resources/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteDataResource(id: string): Promise<void> {
  return request<void>(`/api/data-resources/${id}`, { method: 'DELETE' });
}
