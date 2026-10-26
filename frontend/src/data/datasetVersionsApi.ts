import { request } from './apiClient';

/** One published (or draft) version of a file dataset — frozen when published. */
export interface DatasetVersion {
  dataset_id: string;
  version: number;
  notes: string | null;
  status: 'draft' | 'published' | 'deprecated' | string;
  columns: { name: string; type: string }[];
  file_count: number;
  row_count: number;
  byte_size: number;
  date_from: string | null;
  date_to: string | null;
  published_at: string | null;
  created_by_name: string | null;
  created_at: string;
}

/** Rows selected out of a version: column and row selection, never SQL and never a join. */
export interface FileRows {
  version: number;
  columns: string[];
  rows: Record<string, unknown>[];
  total_scanned: number;
}

export interface DatasetVersionFile {
  name: string;
  row_count?: number;
  byte_size?: number;
}

export async function fetchDatasetVersions(datasetId: string): Promise<DatasetVersion[]> {
  return request<DatasetVersion[]>(`/api/dataset-versions/${datasetId}`);
}

export async function fetchFileRows(
  datasetId: string,
  version: number,
  options: { columns?: string[]; start?: string; end?: string; limit?: number; offset?: number } = {},
): Promise<FileRows> {
  return request<FileRows>(`/api/dataset-versions/${datasetId}/${version}/rows`, {
    query: {
      columns: options.columns?.join(','),
      start: options.start,
      end: options.end,
      limit: options.limit,
      offset: options.offset,
    },
  });
}

export async function fetchVersionDownloadUrl(
  datasetId: string,
  version: number,
  name: string,
): Promise<string> {
  const result = await request<{ url: string }>(
    `/api/dataset-versions/${datasetId}/${version}/files/${encodeURIComponent(name)}/download-url`,
  );
  return result.url;
}
