/** API for Data Explorer reports. */
import { request } from './apiClient';

export interface ExplorerReportChart {
  title?: string;
  insight?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
}

export interface ExplorerReport {
  id: string;
  name: string;
  question: string | null;
  dataset_id: string | null;
  status: string;
  narrative: string | null;
  charts: ExplorerReportChart[] | null;
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
  dataset_id?: string | null;
  narrative?: string | null;
  charts?: ExplorerReportChart[] | null;
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

export async function deleteExplorerReport(id: string): Promise<void> {
  return request<void>(`/api/explorer-reports/${id}`, { method: 'DELETE' });
}
