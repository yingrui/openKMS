/** API for documents (backend). */
import { config } from '../config';
import { getAuthHeaders } from './apiClient';

export interface DocumentResponse {
  id: string;
  name: string;
  file_type: string;
  size_bytes: number;
  channel_id: string;
  file_hash?: string | null;
  status?: string;
  markdown?: string | null;
  parsing_result?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  series_id?: string;
  effective_from?: string | null;
  effective_to?: string | null;
  lifecycle_status?: string | null;
  is_current_for_rag?: boolean;
  created_at: string;
  updated_at: string;
}

/** KB indexing / semantic search default: only `in_force` documents within effective dates; legacy rows treated as current. */
export const DOCUMENT_RELATION_TYPES = [
  'supersedes',
  'amends',
  'repeals',
  'implements',
  'see_also',
] as const;

export const DOCUMENT_LIFECYCLE_STATUSES = ['draft', 'in_force', 'superseded', 'withdrawn'] as const;

export interface DocumentRelationshipEdge {
  id: string;
  relation_type: string;
  peer_document_id: string;
  peer_document_name?: string | null;
  note?: string | null;
  created_at: string;
}

export interface DocumentRelationshipsResponse {
  outgoing: DocumentRelationshipEdge[];
  incoming: DocumentRelationshipEdge[];
}

export interface DocumentListResponse {
  items: DocumentResponse[];
  total: number;
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
];
const ACCEPTED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];

export function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export async function fetchDocumentStats(): Promise<{ total: number }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/documents/stats`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `Failed to fetch document stats: ${res.status}`);
  }
  return res.json();
}

export async function fetchDocuments(params?: {
  channel_id?: string;
  search?: string;
  offset?: number;
  limit?: number;
}): Promise<DocumentListResponse> {
  const headers = await getAuthHeaders();
  const query = new URLSearchParams();
  if (params?.channel_id) query.set('channel_id', params.channel_id);
  if (params?.search) query.set('search', params.search);
  if (params?.offset != null) query.set('offset', String(params.offset));
  if (params?.limit != null) query.set('limit', String(params.limit));
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await fetch(`${config.apiUrl}/api/documents${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `Failed to fetch documents: ${res.status}`);
  }
  return res.json();
}

export async function fetchDocumentsByChannel(channelId: string): Promise<DocumentListResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(
    `${config.apiUrl}/api/documents?channel_id=${encodeURIComponent(channelId)}`,
    { headers: { ...headers }, credentials: 'include' }
  );
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `Failed to fetch documents: ${res.status}`);
  }
  return res.json();
}

export async function fetchDocumentById(
  documentId: string,
  signal?: AbortSignal
): Promise<DocumentResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/documents/${documentId}`, {
    headers: { ...headers },
    signal,
    credentials: 'include',
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `Failed to fetch document: ${res.status}`);
  }
  return res.json();
}

/** Base URL for document files via backend proxy (no trailing slash). */
export function getDocumentFilesBaseUrl(documentId: string): string {
  return `${config.apiUrl}/api/documents/${documentId}/files`;
}

/** Full URL for a document file by path (proxied via backend). */
export function getDocumentFileUrl(documentId: string, filePath: string): string {
  const encoded = filePath.split('/').map((s) => encodeURIComponent(s)).join('/');
  return `${getDocumentFilesBaseUrl(documentId)}/${encoded}`;
}

export async function fetchParsingResult(
  documentId: string,
  signal?: AbortSignal
): Promise<{
  file_hash: string;
  parsing_res_list: unknown[];
  layout_det_res: unknown[];
  markdown: string;
  page_count: number;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/documents/${documentId}/parsing`, {
    headers: { ...headers },
    signal,
    credentials: 'include',
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `Failed to fetch parsing result: ${res.status}`);
  }
  return res.json();
}

export async function uploadDocument(
  channelId: string,
  file: File
): Promise<DocumentResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('channel_id', channelId);

  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/documents/upload`, {
    method: 'POST',
    headers: { ...headers },
    body: formData,
    credentials: 'include',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Upload failed');
  }
  return res.json();
}

export async function deleteDocument(documentId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/documents/${documentId}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Delete failed');
  }
}

export async function resetDocumentStatus(documentId: string): Promise<DocumentResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/documents/${documentId}/reset-status`, {
    method: 'POST',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Reset failed');
  }
  return res.json();
}

export interface ExtractMetadataResponse {
  document: DocumentResponse;
  warnings: string[];
}

export async function extractDocumentMetadata(documentId: string): Promise<ExtractMetadataResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/documents/${documentId}/extract-metadata`, {
    method: 'POST',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Extraction failed');
  }
  return res.json();
}

export async function patchDocumentLifecycle(
  documentId: string,
  params: {
    series_id?: string;
    effective_from?: string | null;
    effective_to?: string | null;
    lifecycle_status?: string | null;
  }
): Promise<DocumentResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/documents/${documentId}/lifecycle`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(params),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Update failed');
  }
  return res.json();
}

export async function fetchDocumentRelationships(
  documentId: string
): Promise<DocumentRelationshipsResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/documents/${documentId}/relationships`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `Failed to load relationships: ${res.status}`);
  }
  return res.json();
}

export async function createDocumentRelationship(
  documentId: string,
  body: { target_document_id: string; relation_type: string; note?: string | null }
): Promise<DocumentRelationshipEdge> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/documents/${documentId}/relationships`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      target_document_id: body.target_document_id,
      relation_type: body.relation_type,
      note: body.note ?? null,
    }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Failed to create relationship');
  }
  return res.json();
}

export async function deleteDocumentRelationship(
  documentId: string,
  relationshipId: string
): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(
    `${config.apiUrl}/api/documents/${documentId}/relationships/${encodeURIComponent(relationshipId)}`,
    {
      method: 'DELETE',
      headers: { ...headers },
      credentials: 'include',
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Delete failed');
  }
}

export async function updateDocument(
  documentId: string,
  params: { name?: string; channel_id?: string }
): Promise<DocumentResponse> {
  const headers = await getAuthHeaders();
  const body: Record<string, unknown> = {};
  if (params.name !== undefined) body.name = params.name;
  if (params.channel_id !== undefined) body.channel_id = params.channel_id;
  const res = await fetch(`${config.apiUrl}/api/documents/${documentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Update failed');
  }
  return res.json();
}

export async function updateDocumentMetadata(
  documentId: string,
  metadata: Record<string, unknown>
): Promise<DocumentResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/documents/${documentId}/metadata`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ metadata }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Update failed');
  }
  return res.json();
}

export async function updateDocumentMarkdown(
  documentId: string,
  markdown: string
): Promise<DocumentResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/documents/${documentId}/markdown`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ markdown }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Update failed');
  }
  return res.json();
}

export async function restoreDocumentMarkdown(documentId: string): Promise<DocumentResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/documents/${documentId}/restore-markdown`, {
    method: 'POST',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Restore failed');
  }
  return res.json();
}

export interface PageIndexNode {
  title: string;
  node_id?: string;
  line_num?: number;
  summary?: string;
  prefix_summary?: string;
  nodes?: PageIndexNode[];
}

export interface PageIndexResponse {
  structure: PageIndexNode[];
  doc_name?: string | null;
}

export async function fetchPageIndex(
  documentId: string,
  signal?: AbortSignal
): Promise<PageIndexResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/documents/${documentId}/page-index`, {
    headers: { ...headers },
    signal,
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Failed to fetch page index');
  }
  return res.json();
}

/** Rebuild page index from current markdown (md_to_tree) and persist to S3. */
export async function rebuildPageIndex(documentId: string): Promise<PageIndexResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/documents/${documentId}/rebuild-page-index`, {
    method: 'POST',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Failed to rebuild page index');
  }
  return res.json();
}

export interface DocumentVersionListItem {
  id: string;
  document_id: string;
  version_number: number;
  tag?: string | null;
  note?: string | null;
  created_at: string;
  created_by_sub?: string | null;
  created_by_name?: string | null;
}

export interface DocumentVersionDetail extends DocumentVersionListItem {
  markdown?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function createDocumentVersion(
  documentId: string,
  body: { tag?: string | null; note?: string | null }
): Promise<DocumentVersionDetail> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/documents/${documentId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ tag: body.tag ?? null, note: body.note ?? null }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Failed to create version');
  }
  return res.json();
}

export async function listDocumentVersions(documentId: string): Promise<{ items: DocumentVersionListItem[] }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/documents/${documentId}/versions`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Failed to list versions');
  }
  return res.json();
}

export async function getDocumentVersion(documentId: string, versionId: string): Promise<DocumentVersionDetail> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/documents/${documentId}/versions/${encodeURIComponent(versionId)}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Failed to load version');
  }
  return res.json();
}

export async function restoreDocumentVersion(
  documentId: string,
  versionId: string,
  body: { save_current_as_version?: boolean; tag?: string | null; note?: string | null }
): Promise<DocumentResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(
    `${config.apiUrl}/api/documents/${documentId}/versions/${encodeURIComponent(versionId)}/restore`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        save_current_as_version: body.save_current_as_version ?? false,
        tag: body.tag ?? null,
        note: body.note ?? null,
      }),
      credentials: 'include',
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Failed to restore version');
  }
  return res.json();
}
