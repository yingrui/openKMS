/** API for external data connectors (inputs, dataset outputs, settings, encrypted secrets). */
import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

export interface ConnectorKindInputFieldOut {
  key: string;
  label: string;
  field_type: string;
  required: boolean;
  default?: string | null;
  placeholder?: string | null;
  options?: string[];
}

export interface ConnectorKindOutputSlotOut {
  slot: string;
  label: string;
  description: string;
  resource: string;
}

export interface ConnectorKindOut {
  kind: string;
  category: 'sync' | 'search_tool';
  label: string;
  description: string;
  secret_keys: string[];
  input_fields: ConnectorKindInputFieldOut[];
  output_slots: ConnectorKindOutputSlotOut[];
  output_schema?: Record<string, unknown> | null;
  default_settings?: Record<string, unknown> | null;
}

export interface ConnectorSearchDebug {
  method: string;
  endpoint: string;
  request_body: Record<string, unknown>;
  status_code?: number;
  provider_response?: Record<string, unknown>;
}

export interface ConnectorSearchResult {
  query: string;
  provider?: Record<string, unknown>;
  search_intent: Array<Record<string, unknown>>;
  results: Array<Record<string, unknown>>;
  debug?: ConnectorSearchDebug;
}

export interface ConnectorResponse {
  id: string;
  name: string;
  kind: string;
  inputs: Record<string, unknown> | null;
  outputs: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  enabled: boolean;
  secrets_configured: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export interface ConnectorListResponse {
  items: ConnectorResponse[];
  total: number;
}

export async function fetchConnectorKinds(category?: string): Promise<ConnectorKindOut[]> {
  const headers = await getAuthHeaders();
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  const res = await authAwareFetch(`${config.apiUrl}/api/connectors/kinds${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch connector kinds: ${res.status}`);
  return res.json();
}

export async function fetchConnectors(category?: string): Promise<ConnectorListResponse> {
  const headers = await getAuthHeaders();
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  const res = await authAwareFetch(`${config.apiUrl}/api/connectors${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch connectors: ${res.status}`);
  return res.json();
}

export async function fetchConnector(id: string): Promise<ConnectorResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/connectors/${id}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `Failed to fetch connector: ${res.status}`);
  }
  return res.json();
}

export async function createConnector(body: {
  name: string;
  kind: string;
  inputs?: Record<string, string> | null;
  outputs?: Record<string, string> | null;
  settings?: Record<string, unknown> | null;
  secrets?: Record<string, string> | null;
  enabled?: boolean;
}): Promise<ConnectorResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/connectors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Failed to create connector');
  }
  return res.json();
}

export async function updateConnector(
  id: string,
  body: {
    name?: string;
    inputs?: Record<string, string> | null;
    outputs?: Record<string, string> | null;
    settings?: Record<string, unknown> | null;
    secrets?: Record<string, string> | null;
    enabled?: boolean;
  }
): Promise<ConnectorResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/connectors/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Failed to update connector');
  }
  return res.json();
}

export async function deleteConnector(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/connectors/${id}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Failed to delete connector');
  }
}

export async function searchConnector(
  id: string,
  body: { query: string; params?: Record<string, unknown> }
): Promise<ConnectorSearchResult> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/connectors/${id}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = (err as { detail?: string }).detail || 'Search failed';
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return res.json();
}
