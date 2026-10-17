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

export async function fetchDatasets(params?: {
  data_source_id?: string;
  search?: string;
  domain?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}): Promise<DatasetListResponse> {
  return request<DatasetListResponse>('/api/datasets', {
    query: {
      data_source_id: params?.data_source_id,
      search: params?.search,
      domain: params?.domain,
      tag: params?.tag,
      limit: params?.limit,
      offset: params?.offset,
    },
  });
}

export interface DatasetFacet {
  value: string;
  count: number;
}

export interface DatasetFacets {
  domains: DatasetFacet[];
  tags: DatasetFacet[];
  sources: DatasetFacet[];
}

/** The filter values the reader can see, with counts — a count says where things are. */
export async function fetchDatasetFacets(): Promise<DatasetFacets> {
  return request<DatasetFacets>('/api/datasets/facets');
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
  description: string | null;
}

export async function updateColumnDescription(
  id: string,
  columnName: string,
  description: string | null,
): Promise<{ column_name: string; description: string | null }> {
  return request<{ column_name: string; description: string | null }>(
    `/api/datasets/${id}/columns/${encodeURIComponent(columnName)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
    },
  );
}

/** One grid filter: a table **column**, a whitelisted operator, a value. */
export interface DatasetRowFilter {
  field: string;
  op: string;
  value?: unknown;
}

/** A browse of a dataset table. Omitted fields fall back to the server's defaults. */
export interface DatasetRowsQuery {
  filters?: DatasetRowFilter[];
  sort?: string | null;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  after?: string | null;
}

export interface DatasetRowsResponse {
  /** The table's columns — present even when nothing matched, so the header still renders. */
  columns: string[];
  rows: Record<string, unknown>[];
  /** Rows matching the filters (not the whole table). */
  total: number;
  limit: number;
  offset: number;
  next_after: string | null;
  /** The page is full: there may be more rows. */
  capped: boolean;
}

/** Browse a dataset's table (read-only): filters + sort + paging. */
export async function queryDatasetRows(
  id: string,
  spec: DatasetRowsQuery = {},
): Promise<DatasetRowsResponse> {
  return request<DatasetRowsResponse>(`/api/datasets/${id}/rows/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filters: [], order: 'asc', limit: 100, offset: 0, ...spec }),
  });
}

/** One aggregate of a dataset summary — `count` needs no column (`COUNT(*)`). */
export interface DatasetAggregate {
  fn: string;
  column?: string;
  name?: string;
}

export interface DatasetSummaryQuery {
  group_by?: Array<string | { column: string; granularity?: string }>;
  aggregates?: DatasetAggregate[];
  filters?: DatasetRowFilter[];
  order_by?: Array<{ field: string; direction?: string }>;
  limit?: number;
  offset?: number;
}

/** A summary answer, shaped like the model query's so callers treat both alike. */
export interface DatasetSummaryResponse {
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  capped: boolean;
  duration_ms: number;
}

export async function queryDatasetSummary(
  id: string,
  spec: DatasetSummaryQuery = {},
): Promise<DatasetSummaryResponse> {
  return request<DatasetSummaryResponse>(`/api/datasets/${id}/aggregate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group_by: [], aggregates: [], filters: [], limit: 100, offset: 0, ...spec }),
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

export async function fetchDatasetProfile(id: string): Promise<DatasetProfileResponse> {
  return request<DatasetProfileResponse>(`/api/datasets/${id}/profile`);
}

export async function refreshDatasetProfile(id: string): Promise<DatasetProfileResponse> {
  return request<DatasetProfileResponse>(`/api/datasets/${id}/profile`, { method: 'POST' });
}

export async function fetchSchemaHistory(id: string): Promise<SchemaSnapshotResponse[]> {
  return request<SchemaSnapshotResponse[]>(`/api/datasets/${id}/schema-history`);
}
