/** API for Data Explorer dashboards. */
import { request } from './apiClient';

/** What a report reads: a Catalog dataset, or a semantic model (fields + metrics). */
export type ExplorerSourceKind = 'dataset' | 'semantic_model';

/**
 * One report in a dashboard — a tile, not the document.
 *
 * It owns **its own source** and the query it came from, so a dashboard can put a model metric
 * beside a raw-dataset check. The rows/columns are the result of its last run.
 */
export interface DashboardReport {
  title?: string;
  insight?: string;
  source_kind?: ExplorerSourceKind;
  dataset_id?: string | null;
  semantic_model_id?: string | null;
  /** The source's own query spec (a dataset rows/summary query, or a model metric query). */
  query?: Record<string, unknown>;
  /** How to present the result — `{kind: 'chart'|'metric'|'bar_list', …}` (presentation only). */
  view?: unknown;
  columns?: string[];
  rows?: Record<string, unknown>[];
  /** Rows the query matches (a dataset report's page may be a slice of this). */
  total?: number;
  /** The last run's classified failure, localized for the reader by the API. */
  error?: { code?: string; message?: string; kind?: string; detail?: string | null } | null;
  ran_at?: string | null;
  capped?: boolean;
  duration_ms?: number;
  sql?: string;
}

/** The document: a question, a narrative, and the reports in it. */
export interface ExplorerDashboard {
  id: string;
  name: string;
  question: string | null;
  status: string;
  narrative: string | null;
  reports: DashboardReport[] | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

/** One source a dashboard's reports read. */
export interface DashboardSource {
  kind: ExplorerSourceKind;
  id: string;
  label: string;
}

/**
 * A dashboard *in a list* — what it is, how many reports, which sources. Deliberately not the
 * document: listing must not carry every report's rows.
 */
export interface DashboardSummary {
  id: string;
  name: string;
  question: string | null;
  status: string;
  report_count: number;
  sources: DashboardSource[];
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExplorerDashboardListResponse {
  items: DashboardSummary[];
  total: number;
}

export async function fetchDashboards(): Promise<ExplorerDashboardListResponse> {
  return request<ExplorerDashboardListResponse>('/api/explorer-dashboards');
}

export async function fetchDashboard(id: string): Promise<ExplorerDashboard> {
  return request<ExplorerDashboard>(`/api/explorer-dashboards/${id}`);
}

export async function createDashboard(data: {
  name: string;
  question?: string | null;
  narrative?: string | null;
  reports?: DashboardReport[] | null;
}): Promise<ExplorerDashboard> {
  return request<ExplorerDashboard>('/api/explorer-dashboards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateDashboard(
  id: string,
  data: {
    name?: string;
    question?: string;
    status?: string;
    narrative?: string | null;
    reports?: DashboardReport[] | null;
  },
): Promise<ExplorerDashboard> {
  return request<ExplorerDashboard>(`/api/explorer-dashboards/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function runDashboard(id: string): Promise<ExplorerDashboard> {
  return request<ExplorerDashboard>(`/api/explorer-dashboards/${id}/run`, { method: 'POST' });
}

/** One run of a dashboard: when, how long, and how many of its reports failed. */
export interface DashboardRun {
  id: string;
  ran_at: string;
  duration_ms: number;
  reports: number;
  failed: number;
  ran_by_name: string | null;
}

export interface DashboardRunListResponse {
  items: DashboardRun[];
  total: number;
}

export async function fetchDashboardRuns(id: string): Promise<DashboardRunListResponse> {
  return request<DashboardRunListResponse>(`/api/explorer-dashboards/${id}/runs`);
}

export async function deleteDashboard(id: string): Promise<void> {
  await request<void>(`/api/explorer-dashboards/${id}`, { method: 'DELETE' });
}
