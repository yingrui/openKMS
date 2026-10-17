/** API for Data Insights stories. */
import { request } from './apiClient';

/** What a finding reads: a Catalog dataset, or a semantic model (fields + metrics). */
export type ExplorerSourceKind = 'dataset' | 'semantic_model';

/**
 * One finding in a story — a tile, not the document.
 *
 * It owns **its own source** and the query it came from, so a story can put a model metric
 * beside a raw-dataset check. The rows/columns are the result of its last run.
 */
export interface StoryFinding {
  title?: string;
  takeaway?: string;
  source_kind?: ExplorerSourceKind;
  dataset_id?: string | null;
  semantic_model_id?: string | null;
  /** The source's own query spec (a dataset rows/summary query, or a model metric query). */
  query?: Record<string, unknown>;
  /** How to present the result — `{kind: 'chart'|'metric'|'bar_list', …}` (presentation only). */
  view?: unknown;
  columns?: string[];
  rows?: Record<string, unknown>[];
  /** Rows the query matches (a dataset finding's page may be a slice of this). */
  total?: number;
  /** The last run's classified failure, localized for the reader by the API. */
  error?: { code?: string; message?: string; kind?: string; detail?: string | null } | null;
  ran_at?: string | null;
  capped?: boolean;
  duration_ms?: number;
  sql?: string;
}

/** The document: a question, a narrative, and the findings in it. */
export interface Story {
  id: string;
  name: string;
  question: string | null;
  status: string;
  narrative: string | null;
  findings: StoryFinding[] | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

/** One source a story's findings read. */
export interface StorySource {
  kind: ExplorerSourceKind;
  id: string;
  label: string;
}

/**
 * A story *in a list* — what it is, how many findings, which sources. Deliberately not the
 * document: listing must not carry every finding's rows.
 */
export interface StorySummary {
  id: string;
  name: string;
  question: string | null;
  status: string;
  finding_count: number;
  sources: StorySource[];
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoryListResponse {
  items: StorySummary[];
  total: number;
}

export async function fetchStories(params?: {
  search?: string;
  /** Reverse lookup: stories with a finding on this dataset. */
  datasetId?: string;
}): Promise<StoryListResponse> {
  return request<StoryListResponse>('/api/stories', {
    query: { search: params?.search, dataset_id: params?.datasetId },
  });
}

export async function fetchStory(id: string): Promise<Story> {
  return request<Story>(`/api/stories/${id}`);
}

export async function createStory(data: {
  name: string;
  question?: string | null;
  narrative?: string | null;
  findings?: StoryFinding[] | null;
}): Promise<Story> {
  return request<Story>('/api/stories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateStory(
  id: string,
  data: {
    name?: string;
    question?: string;
    status?: string;
    narrative?: string | null;
    findings?: StoryFinding[] | null;
  },
): Promise<Story> {
  return request<Story>(`/api/stories/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function runStory(id: string): Promise<Story> {
  return request<Story>(`/api/stories/${id}/run`, { method: 'POST' });
}

export async function deleteStory(id: string): Promise<void> {
  await request<void>(`/api/stories/${id}`, { method: 'DELETE' });
}
