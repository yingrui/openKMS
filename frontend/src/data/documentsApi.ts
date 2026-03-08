/** API for documents (backend). */
import { config } from '../config';

export interface DocumentResponse {
  id: string;
  name: string;
  file_type: string;
  size_bytes: number;
  channel_id: string;
  file_hash?: string | null;
  markdown?: string | null;
  parsing_result?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
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

export async function fetchDocumentsByChannel(channelId: string): Promise<DocumentListResponse> {
  const res = await fetch(
    `${config.apiUrl}/api/documents?channel_id=${encodeURIComponent(channelId)}`
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
  const res = await fetch(`${config.apiUrl}/api/documents/${documentId}`, { signal });
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
  const res = await fetch(`${config.apiUrl}/api/documents/${documentId}/parsing`, { signal });
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

  const res = await fetch(`${config.apiUrl}/api/documents/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Upload failed');
  }
  return res.json();
}

export async function deleteDocument(documentId: string): Promise<void> {
  const res = await fetch(`${config.apiUrl}/api/documents/${documentId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Delete failed');
  }
}
