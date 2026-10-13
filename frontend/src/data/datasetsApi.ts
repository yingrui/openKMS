/** API for datasets. */
import { request } from './apiClient';

export interface DatasetResponse {
  id: string;
  data_source_id: string;
  data_source_name: string | null;
  schema_name: string;
  table_name: string;
  display_name: string | null;
  description: string | null;
  owner_sub: string | null;
  domain: string | null;
  tags: string[];
  business_definition: string | null;
  sensitivity: string | null;
  primary_key_columns: string[] | null;
  unique_keys: string[][];
  ai_context: Record<string, unknown> | null;
  is_editable: boolean;
  created_at: string;
  updated_at: string;
}

export interface DatasetListResponse {
  items: DatasetResponse[];
  total: number;
}

export interface TableInfo {
  schema_name: string;
  table_name: string;
}

export async function fetchDatasets(params?: { data_source_id?: string }): Promise<DatasetListResponse> {
  return request<DatasetListResponse>('/api/datasets', {
    query: { data_source_id: params?.data_source_id },
  });
}

export async function fetchTablesFromSource(dataSourceId: string): Promise<TableInfo[]> {
  return request<TableInfo[]>(`/api/datasets/from-source/${dataSourceId}`);
}

export async function createDataset(data: {
  data_source_id: string;
  schema_name: string;
  table_name: string;
  display_name?: string;
  description?: string;
  domain?: string;
  tags?: string[];
  business_definition?: string;
  sensitivity?: string;
}): Promise<DatasetResponse> {
  return request<DatasetResponse>('/api/datasets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateDataset(
  id: string,
  data: {
    schema_name?: string;
    table_name?: string;
    display_name?: string | null;
    description?: string | null;
    owner_sub?: string | null;
    domain?: string | null;
    tags?: string[];
    business_definition?: string | null;
    sensitivity?: string | null;
    primary_key_columns?: string[] | null;
    unique_keys?: string[][];
    ai_context?: Record<string, unknown> | null;
    is_editable?: boolean;
  }
): Promise<DatasetResponse> {
  return request<DatasetResponse>(`/api/datasets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function fetchDataset(id: string): Promise<DatasetResponse> {
  return request<DatasetResponse>(`/api/datasets/${id}`);
}

export interface ColumnMetadata {
  column_name: string;
  /** Source-native type (e.g. PostgreSQL ``uuid``). */
  data_type: string;
  /** Canonical ontology property type from the datasource adapter. Prefer this for schemas. */
  ontology_type: string;
  is_nullable: boolean;
  ordinal_position: number;
}

export interface DatasetRowsResponse {
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  next_after: string | null;
}

export async function fetchDatasetRows(
  id: string,
  params?: { limit?: number; offset?: number; sort?: string; order?: 'asc' | 'desc'; after?: string },
): Promise<DatasetRowsResponse> {
  return request<DatasetRowsResponse>(`/api/datasets/${id}/rows`, {
    query: {
      limit: params?.limit,
      offset: params?.offset,
      sort: params?.sort,
      order: params?.order,
      after: params?.after,
    },
  });
}

export interface DatasetRowOp {
  op: 'insert' | 'update' | 'delete';
  pk?: Record<string, unknown>;
  values?: Record<string, unknown>;
  expect?: Record<string, unknown>;
}

export interface DatasetRowsApplyResponse {
  inserted: number;
  updated: number;
  deleted: number;
  dry_run: boolean;
}

export async function applyDatasetRows(
  id: string,
  ops: DatasetRowOp[],
  dryRun = false,
): Promise<DatasetRowsApplyResponse> {
  return request<DatasetRowsApplyResponse>(`/api/datasets/${id}/rows/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ops, dry_run: dryRun }),
  });
}

export async function fetchDatasetMetadata(id: string): Promise<ColumnMetadata[]> {
  return request<ColumnMetadata[]>(`/api/datasets/${id}/metadata`);
}

export async function deleteDataset(id: string): Promise<void> {
  return request<void>(`/api/datasets/${id}`, { method: 'DELETE' });
}

export interface DatasetProfileColumn {
  column: string;
  null_count: number | null;
  distinct_count: number | null;
  min: unknown;
  max: unknown;
}

export interface DatasetProfileResponse {
  dataset_id: string;
  row_count: number | null;
  column_stats: DatasetProfileColumn[];
  computed_at: string | null;
}

export interface SchemaSnapshotResponse {
  id: string;
  dataset_id: string;
  columns: ColumnMetadata[];
  captured_at: string;
}

export interface LineageNode {
  type: string;
  id: string;
  label: string | null;
}

export interface LineageJoin {
  join_id: string;
  dataset_id: string;
  dataset_name: string | null;
  join_type: string;
}

export interface DatasetLineageResponse {
  dataset: LineageNode;
  upstream: LineageNode[];
  downstream: LineageNode[];
  joined_datasets: LineageJoin[];
}

export async function fetchDatasetProfile(id: string): Promise<DatasetProfileResponse> {
  return request<DatasetProfileResponse>(`/api/datasets/${id}/profile`);
}

export async function refreshDatasetProfile(id: string): Promise<DatasetProfileResponse> {
  return request<DatasetProfileResponse>(`/api/datasets/${id}/profile`, { method: 'POST' });
}

export async function fetchSchemaHistory(id: string): Promise<SchemaSnapshotResponse[]> {
  return request<SchemaSnapshotResponse[]>(`/api/datasets/${id}/schema-history`);
}

export async function fetchDatasetLineage(id: string): Promise<DatasetLineageResponse> {
  return request<DatasetLineageResponse>(`/api/datasets/${id}/lineage`);
}
