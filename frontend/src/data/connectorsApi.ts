/** API for external data connectors (inputs, dataset outputs, settings, encrypted secrets). */
import { request } from './apiClient';

export interface ConnectorKindInputFieldOut {
  key: string;
  label: string;
  field_type: string;
  required: boolean;
  default?: string | null;
  placeholder?: string | null;
  options?: string[];
}

export interface ConnectorDatasetColumnOut {
  name: string;
  pg_type: string;
  nullable: boolean;
  primary_key: boolean;
}

export interface ConnectorKindOutputSlotOut {
  slot: string;
  label: string;
  description: string;
  resource: string;
  dataset_schema?: ConnectorDatasetColumnOut[];
  default_pg_schema?: string | null;
  default_table_name?: string | null;
}

export interface ConnectorProvisionDatasetBody {
  kind: string;
  slot: string;
  data_source_id: string;
  schema_name?: string;
  table_name?: string;
  display_name?: string;
}

export interface ConnectorProvisionDatasetResponse {
  id: string;
  data_source_id: string;
  data_source_name: string | null;
  schema_name: string;
  table_name: string;
  display_name: string | null;
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

export interface ConnectorProbeDebug {
  method: string;
  endpoint: string;
  api_name: string;
  request_body: Record<string, unknown>;
}

export interface ConnectorProbeResult {
  api_name: string;
  params: Record<string, unknown>;
  row_count: number;
  truncated: boolean;
  rows: Array<Record<string, unknown>>;
  debug?: ConnectorProbeDebug;
}

export interface ConnectorProbeBody {
  api_name?: string;
  ts_code?: string;
  trade_date?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

export interface ConnectorSyncSchedule {
  enabled: boolean;
  cron: string | null;
  timezone: string;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_job_id: number | null;
}

export interface ConnectorSyncTriggerBody {
  start_date: string;
  end_date: string;
}

export interface ConnectorResponse {
  id: string;
  name: string;
  kind: string;
  inputs: Record<string, unknown> | null;
  outputs: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  sync_schedule: ConnectorSyncSchedule | null;
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
  return request<ConnectorKindOut[]>('/api/connectors/kinds', { query: { category } });
}

export async function fetchConnectors(category?: string): Promise<ConnectorListResponse> {
  return request<ConnectorListResponse>('/api/connectors', { query: { category } });
}

export async function fetchConnector(id: string): Promise<ConnectorResponse> {
  return request<ConnectorResponse>(`/api/connectors/${id}`);
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
  return request<ConnectorResponse>('/api/connectors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
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
  return request<ConnectorResponse>(`/api/connectors/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteConnector(id: string): Promise<void> {
  return request<void>(`/api/connectors/${id}`, { method: 'DELETE' });
}

export async function provisionConnectorDataset(
  body: ConnectorProvisionDatasetBody
): Promise<ConnectorProvisionDatasetResponse> {
  return request<ConnectorProvisionDatasetResponse>('/api/connectors/provision-dataset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function triggerConnectorSync(
  connectorId: string,
  body: ConnectorSyncTriggerBody
): Promise<{ job_id: number }> {
  return request<{ job_id: number }>(`/api/connectors/${connectorId}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function searchConnector(
  id: string,
  body: { query: string; params?: Record<string, unknown> }
): Promise<ConnectorSearchResult> {
  return request<ConnectorSearchResult>(`/api/connectors/${id}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function probeConnector(
  id: string,
  body: ConnectorProbeBody
): Promise<ConnectorProbeResult> {
  return request<ConnectorProbeResult>(`/api/connectors/${id}/probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
