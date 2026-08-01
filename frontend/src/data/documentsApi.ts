/** API for documents (backend). */
import { config } from '../config';
import { request, requestRaw } from './apiClient';

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
  /** Computed from lifecycle + dates: currently applicable for normal KB answers/indexing. API name unchanged. */
  is_current_for_rag?: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentListItemResponse {
  id: string;
  name: string;
  file_type: string;
  size_bytes: number;
  channel_id: string;
  file_hash?: string | null;
  status?: string;
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
  items: DocumentListItemResponse[];
  total: number;
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/epub+zip',
  'application/vnd.xmind.workbook',
];
const ACCEPTED_EXTENSIONS = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.docx',
  '.pptx',
  '.xlsx',
  '.epub',
  '.xmind',
];

export function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export async function fetchDocumentStats(): Promise<{ total: number }> {
  return request<{ total: number }>('/api/documents/stats');
}

export async function fetchDocuments(params?: {
  channel_id?: string;
  search?: string;
  status?: string;
  applicable?: boolean;
  offset?: number;
  limit?: number;
}): Promise<DocumentListResponse> {
  return request<DocumentListResponse>('/api/documents', {
    query: {
      channel_id: params?.channel_id,
      search: params?.search,
      status: params?.status,
      applicable: params?.applicable != null ? (params.applicable ? 'true' : 'false') : undefined,
      offset: params?.offset,
      limit: params?.limit,
    },
  });
}

export async function fetchDocumentsByChannel(
  channelId: string,
  params?: { search?: string; status?: string; applicable?: boolean; offset?: number; limit?: number },
): Promise<DocumentListResponse> {
  return request<DocumentListResponse>('/api/documents', {
    query: {
      channel_id: channelId,
      search: params?.search,
      status: params?.status,
      applicable: params?.applicable != null ? (params.applicable ? 'true' : 'false') : undefined,
      offset: params?.offset,
      limit: params?.limit,
    },
  });
}

export async function fetchDocumentById(
  documentId: string,
  signal?: AbortSignal
): Promise<DocumentResponse> {
  return request<DocumentResponse>(`/api/documents/${documentId}`, { signal });
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

/** Presigned object URL from the authenticated files API (redirect target as JSON). */
async function resolveDocumentFileUrl(apiUrl: string): Promise<string> {
  const data = await request<{ url?: string }>(`${apiUrl}?url_only=1`);
  if (!data.url) throw new Error('Download failed (missing file URL)');
  return data.url;
}

async function fetchDocumentFileBlob(apiUrl: string): Promise<Blob> {
  const objectUrl = await resolveDocumentFileUrl(apiUrl);
  const objectRes = await fetch(objectUrl);
  if (!objectRes.ok) throw new Error(`Download failed (${objectRes.status})`);
  return objectRes.blob();
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

/** Download the original uploaded file for a document list row. */
export async function downloadDocumentOriginal(
  doc: Pick<DocumentListItemResponse, 'id' | 'file_hash' | 'file_type' | 'name'>,
): Promise<void> {
  if (!doc.file_hash) {
    throw new Error('Document has no stored file');
  }
  const ext = doc.file_type.toLowerCase().replace(/^\./, '') || 'bin';
  const url = `${getDocumentFilesBaseUrl(doc.id)}/${encodeURIComponent(doc.file_hash)}/original.${ext}`;
  const blob = await fetchDocumentFileBlob(url);
  triggerBlobDownload(blob, doc.name);
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
  return request(`/api/documents/${documentId}/parsing`, { signal });
}

export async function uploadDocument(
  channelId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<DocumentResponse> {
  if (file.size > CHUNK_SIZE) {
    return uploadDocumentChunked(channelId, file, onProgress);
  }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('channel_id', channelId);
  return request<DocumentResponse>('/api/documents/upload', { method: 'POST', body: formData });
}

export async function uploadDocumentChunked(
  channelId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<DocumentResponse> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  let lastResponse: DocumentResponse | undefined;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const formData = new FormData();
    formData.append('file_chunk', chunk);
    formData.append('chunk_index', String(i));
    formData.append('total_chunks', String(totalChunks));
    formData.append('channel_id', channelId);
    formData.append('filename', file.name);

    const data = await request<DocumentResponse>('/api/documents/upload-chunk', {
      method: 'POST',
      body: formData,
    });
    if (data.id !== 'pending') {
      lastResponse = data;
    }
    onProgress?.(Math.round(((i + 1) / totalChunks) * 100));
  }

  if (!lastResponse) throw new Error('Upload produced no response');
  return lastResponse;
}

export async function deleteDocument(documentId: string): Promise<void> {
  return request<void>(`/api/documents/${documentId}`, { method: 'DELETE' });
}

export async function resetDocumentStatus(documentId: string): Promise<DocumentResponse> {
  return request<DocumentResponse>(`/api/documents/${documentId}/reset-status`, { method: 'POST' });
}

export interface ExtractMetadataResponse {
  document: DocumentResponse;
  warnings: string[];
}

export async function extractDocumentMetadata(documentId: string): Promise<ExtractMetadataResponse> {
  return request<ExtractMetadataResponse>(`/api/documents/${documentId}/extract-metadata`, { method: 'POST' });
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
  return request<DocumentResponse>(`/api/documents/${documentId}/lifecycle`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export async function fetchDocumentRelationships(
  documentId: string
): Promise<DocumentRelationshipsResponse> {
  return request<DocumentRelationshipsResponse>(`/api/documents/${documentId}/relationships`);
}

export async function createDocumentRelationship(
  documentId: string,
  body: { target_document_id: string; relation_type: string; note?: string | null }
): Promise<DocumentRelationshipEdge> {
  return request<DocumentRelationshipEdge>(`/api/documents/${documentId}/relationships`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      target_document_id: body.target_document_id,
      relation_type: body.relation_type,
      note: body.note ?? null,
    }),
  });
}

export async function deleteDocumentRelationship(
  documentId: string,
  relationshipId: string
): Promise<void> {
  return request<void>(
    `/api/documents/${documentId}/relationships/${encodeURIComponent(relationshipId)}`,
    { method: 'DELETE' },
  );
}

export async function updateDocument(
  documentId: string,
  params: { name?: string; channel_id?: string }
): Promise<DocumentResponse> {
  const body: Record<string, unknown> = {};
  if (params.name !== undefined) body.name = params.name;
  if (params.channel_id !== undefined) body.channel_id = params.channel_id;
  return request<DocumentResponse>(`/api/documents/${documentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function updateDocumentMetadata(
  documentId: string,
  metadata: Record<string, unknown>
): Promise<DocumentResponse> {
  return request<DocumentResponse>(`/api/documents/${documentId}/metadata`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata }),
  });
}

export async function updateDocumentMarkdown(
  documentId: string,
  markdown: string
): Promise<DocumentResponse> {
  return request<DocumentResponse>(`/api/documents/${documentId}/markdown`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown }),
  });
}

export async function restoreDocumentMarkdown(documentId: string): Promise<DocumentResponse> {
  return request<DocumentResponse>(`/api/documents/${documentId}/restore-markdown`, { method: 'POST' });
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
  return request<PageIndexResponse>(`/api/documents/${documentId}/page-index`, { signal });
}

/** Rebuild page index from current markdown (md_to_tree) and persist to S3. */
export async function rebuildPageIndex(documentId: string): Promise<PageIndexResponse> {
  return request<PageIndexResponse>(`/api/documents/${documentId}/rebuild-page-index`, { method: 'POST' });
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
  return request<DocumentVersionDetail>(`/api/documents/${documentId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag: body.tag ?? null, note: body.note ?? null }),
  });
}

export async function listDocumentVersions(documentId: string): Promise<{ items: DocumentVersionListItem[] }> {
  return request<{ items: DocumentVersionListItem[] }>(`/api/documents/${documentId}/versions`);
}

export async function getDocumentVersion(documentId: string, versionId: string): Promise<DocumentVersionDetail> {
  return request<DocumentVersionDetail>(
    `/api/documents/${documentId}/versions/${encodeURIComponent(versionId)}`,
  );
}

export async function restoreDocumentVersion(
  documentId: string,
  versionId: string,
  body: { save_current_as_version?: boolean; tag?: string | null; note?: string | null }
): Promise<DocumentResponse> {
  return request<DocumentResponse>(
    `/api/documents/${documentId}/versions/${encodeURIComponent(versionId)}/restore`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        save_current_as_version: body.save_current_as_version ?? false,
        tag: body.tag ?? null,
        note: body.note ?? null,
      }),
    },
  );
}

export async function exportDocumentParsing(documentId: string): Promise<void> {
  const res = await requestRaw(`/api/documents/${documentId}/export`);
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] || 'document-parsing.zip';
  triggerBlobDownload(blob, filename);
}

export async function importDocumentParsing(
  documentId: string,
  file: File
): Promise<DocumentResponse> {
  const formData = new FormData();
  formData.append('archive', file);
  return request<DocumentResponse>(`/api/documents/${documentId}/import`, { method: 'POST', body: formData });
}

const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB

export async function importDocumentParsingChunked(
  documentId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<DocumentResponse> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  let lastResponse: DocumentResponse | undefined;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const formData = new FormData();
    formData.append('archive', chunk, `${file.name}.chunk`);
    formData.append('chunk_index', String(i));
    formData.append('total_chunks', String(totalChunks));

    const data = await request<DocumentResponse>(`/api/documents/${documentId}/import-chunk`, {
      method: 'POST',
      body: formData,
    });
    lastResponse = data;
    onProgress?.(Math.round(((i + 1) / totalChunks) * 100));
  }

  if (!lastResponse) throw new Error('Import produced no response');
  return lastResponse;
}
