import { config } from '../config';
import { authAwareFetch, getAuthHeaders } from './apiClient';

export interface OntologyFunctionResponse {
  id: string;
  api_name: string;
  display_name: string;
  description?: string | null;
  source: string;
  object_type_id?: string | null;
  development_status: string;
  status: string;
  published_version_id?: string | null;
  published_version?: number | null;
  latest_version?: number | null;
  created_at: string;
  updated_at: string;
}

export interface OntologyFunctionListResponse {
  items: OntologyFunctionResponse[];
  total: number;
}

export interface OntologyFunctionVersionResponse {
  id: string;
  function_id: string;
  version: number;
  source_code: string;
  input_schema?: Record<string, unknown> | null;
  output_schema?: Record<string, unknown> | null;
  entrypoint: string;
  runtime: string;
  validation_result?: Record<string, unknown> | null;
  created_at: string;
}

export interface OntologyFunctionExecutionResponse {
  id: string;
  function_id: string;
  version_id: string;
  duration_ms?: number | null;
  status: string;
  input_payload?: Record<string, unknown> | null;
  output_payload?: Record<string, unknown> | null;
  error_message?: string | null;
  created_at: string;
}

export interface OntologyGroupResponse {
  id: string;
  display_name: string;
  description?: string | null;
  object_type_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface OntologyActionTypeResponse {
  id: string;
  api_name: string;
  display_name: string;
  description?: string | null;
  object_type_id: string;
  rule_type: string;
  function_id?: string | null;
  function_version?: number | null;
  parameters?: unknown[] | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface OntologyActionLogResponse {
  id: string;
  action_type_id: string;
  object_id?: string | null;
  caller_user_id?: string | null;
  status: string;
  input_payload?: Record<string, unknown> | null;
  output_payload?: Record<string, unknown> | null;
  error_message?: string | null;
  created_at: string;
}

const base = `${config.apiUrl}/api/ontology/functions`;

export async function fetchOntologyFunctions(): Promise<OntologyFunctionListResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(base, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to fetch functions: ${res.status}`);
  return res.json();
}

export async function fetchOntologyFunction(id: string): Promise<OntologyFunctionResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${base}/${id}`, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to fetch function: ${res.status}`);
  return res.json();
}

export async function createOntologyFunction(body: {
  api_name: string;
  display_name: string;
  description?: string;
  source_code?: string;
}): Promise<OntologyFunctionResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(base, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to create function: ${res.status}`);
  }
  return res.json();
}

export async function deleteOntologyFunction(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${base}/${id}`, { method: 'DELETE', headers, credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to delete function: ${res.status}`);
}

export async function fetchFunctionVersions(functionId: string): Promise<OntologyFunctionVersionResponse[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${base}/${functionId}/versions`, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to fetch versions: ${res.status}`);
  return res.json();
}

export async function fetchFunctionVersion(
  functionId: string,
  versionId: string,
): Promise<OntologyFunctionVersionResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${base}/${functionId}/versions/${versionId}`, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to fetch version: ${res.status}`);
  return res.json();
}

export async function saveFunctionVersion(
  functionId: string,
  body: { source_code: string; input_schema?: Record<string, unknown>; output_schema?: Record<string, unknown> },
): Promise<OntologyFunctionVersionResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${base}/${functionId}/versions`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to save version: ${res.status}`);
  return res.json();
}

export async function validateFunctionSource(
  functionId: string,
  source_code: string,
): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${base}/${functionId}/validate`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ source_code }),
  });
  if (!res.ok) throw new Error(`Validate failed: ${res.status}`);
  return res.json();
}

export async function publishOntologyFunction(functionId: string, versionId?: string): Promise<OntologyFunctionResponse> {
  const headers = await getAuthHeaders();
  const qs = versionId ? `?version_id=${encodeURIComponent(versionId)}` : '';
  const res = await authAwareFetch(`${base}/${functionId}/publish${qs}`, {
    method: 'POST',
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Publish failed: ${res.status}`);
  return res.json();
}

export async function executeOntologyFunction(
  functionId: string,
  input: Record<string, unknown>,
  options?: { use_published?: boolean; version_id?: string },
): Promise<{ status: string; output?: Record<string, unknown>; error?: string; duration_ms?: number }> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${base}/${functionId}/execute`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ input, use_published: options?.use_published, version_id: options?.version_id }),
  });
  if (!res.ok) throw new Error(`Execute failed: ${res.status}`);
  return res.json();
}

export async function fetchFunctionExecutions(functionId: string): Promise<OntologyFunctionExecutionResponse[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${base}/${functionId}/executions`, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to fetch executions: ${res.status}`);
  return res.json();
}

export async function fetchOntologyGroups(): Promise<OntologyGroupResponse[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/ontology/groups`, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to fetch groups: ${res.status}`);
  return res.json();
}

export async function createOntologyGroup(body: {
  display_name: string;
  description?: string;
  object_type_ids?: string[];
}): Promise<OntologyGroupResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/ontology/groups`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to create group: ${res.status}`);
  return res.json();
}

export async function fetchOntologyGroup(id: string): Promise<OntologyGroupResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/ontology/groups/${id}`, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to fetch group: ${res.status}`);
  return res.json();
}

export async function updateOntologyGroup(
  id: string,
  body: { display_name?: string; description?: string; object_type_ids?: string[] },
): Promise<OntologyGroupResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/ontology/groups/${id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to update group: ${res.status}`);
  return res.json();
}

export async function deleteOntologyGroup(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/ontology/groups/${id}`, {
    method: 'DELETE',
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to delete group: ${res.status}`);
}

export async function fetchOntologyActionTypes(params?: {
  object_type_id?: string;
}): Promise<OntologyActionTypeResponse[]> {
  const headers = await getAuthHeaders();
  const qs = params?.object_type_id ? `?object_type_id=${encodeURIComponent(params.object_type_id)}` : '';
  const res = await authAwareFetch(`${config.apiUrl}/api/ontology/action-types${qs}`, {
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch actions: ${res.status}`);
  return res.json();
}

export async function fetchOntologyActionType(id: string): Promise<OntologyActionTypeResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/ontology/action-types/${id}`, {
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch action: ${res.status}`);
  return res.json();
}

export async function updateOntologyActionType(
  id: string,
  body: {
    display_name?: string;
    description?: string;
    function_id?: string | null;
    function_version?: number | null;
    status?: string;
  },
): Promise<OntologyActionTypeResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/ontology/action-types/${id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to update action: ${res.status}`);
  }
  return res.json();
}

export async function executeOntologyAction(
  actionTypeId: string,
  body: { object_id?: string; input?: Record<string, unknown> },
): Promise<{
  status: string;
  output?: Record<string, unknown>;
  error?: string;
  duration_ms?: number;
  log_id?: string;
}> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/ontology/action-types/${actionTypeId}/execute`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Action execution failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchOntologyActionLogs(actionTypeId: string): Promise<OntologyActionLogResponse[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/ontology/action-types/${actionTypeId}/logs`, {
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch action logs: ${res.status}`);
  return res.json();
}

export async function createOntologyActionType(body: {
  api_name: string;
  display_name: string;
  description?: string;
  object_type_id: string;
  rule_type?: string;
  function_id?: string;
  function_version?: number;
}): Promise<OntologyActionTypeResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/ontology/action-types`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to create action: ${res.status}`);
  }
  return res.json();
}

export async function deleteOntologyActionType(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/ontology/action-types/${id}`, {
    method: 'DELETE',
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to delete action: ${res.status}`);
}

export const DEFAULT_FUNCTION_TEMPLATE = `"""Ontology Function — edit execute() and Run to preview."""
from openkms_functions import ExecuteContext


def execute(input: dict, ctx: ExecuteContext) -> dict:
    """Return a JSON-serializable dict."""
    return {"ok": True, "message": "Hello from openKMS Function"}
`;
