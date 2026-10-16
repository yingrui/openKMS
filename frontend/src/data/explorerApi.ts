/** API for Data Explorer reports. */
import { request } from './apiClient';

/** What a report analyzes: a Catalog dataset, or a semantic model (fields + metrics). */
export type ExplorerSourceKind = 'dataset' | 'semantic_model';

/** One block: the query it came from, plus the result of its last run. */
export interface ExplorerReportBlock {
  title?: string;
  insight?: string;
  /** The source's own query spec (a dataset rows query, or a model metric query). */
  query?: Record<string, unknown>;
  /** How to draw the result: `{type: 'line'|'bar', x, y, series?}` (presentation only). */
  chart?: unknown;
  columns?: string[];
  rows?: Record<string, unknown>[];
  /** Rows the query matches (a dataset block's page may be a slice of this). */
  total?: number;
  /** The last run's classified failure, localized for the reader by the API. */
  error?: { code?: string; message?: string; kind?: string; detail?: string | null } | null;
  ran_at?: string | null;
  capped?: boolean;
  duration_ms?: number;
  sql?: string;
}

export interface ExplorerReport {
  id: string;
  name: string;
  question: string | null;
  source_kind: ExplorerSourceKind;
  dataset_id: string | null;
  semantic_model_id: string | null;
  status: string;
  narrative: string | null;
  blocks: ExplorerReportBlock[] | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExplorerReportListResponse {
  items: ExplorerReport[];
  total: number;
}

export async function fetchExplorerReports(): Promise<ExplorerReportListResponse> {
  return request<ExplorerReportListResponse>('/api/explorer-reports');
}

export async function fetchExplorerReport(id: string): Promise<ExplorerReport> {
  return request<ExplorerReport>(`/api/explorer-reports/${id}`);
}

export async function createExplorerReport(data: {
  name: string;
  question?: string | null;
  source_kind?: ExplorerSourceKind;
  dataset_id?: string | null;
  semantic_model_id?: string | null;
  narrative?: string | null;
  blocks?: ExplorerReportBlock[] | null;
}): Promise<ExplorerReport> {
  return request<ExplorerReport>('/api/explorer-reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateExplorerReport(
  id: string,
  data: { name?: string; question?: string; status?: string; narrative?: string | null },
): Promise<ExplorerReport> {
  return request<ExplorerReport>(`/api/explorer-reports/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

/** Run every block against the report's source and keep the results. */
export async function runExplorerReport(id: string): Promise<ExplorerReport> {
  return request<ExplorerReport>(`/api/explorer-reports/${id}/run`, { method: 'POST' });
}

export async function deleteExplorerReport(id: string): Promise<void> {
  return request<void>(`/api/explorer-reports/${id}`, { method: 'DELETE' });
}
