/** Articles API. */
import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

/** Same relation types as documents: supersedes, amends, implements, see_also. */
export const ARTICLE_RELATION_TYPES = ['supersedes', 'amends', 'implements', 'see_also'] as const;

export interface ArticleRelationshipEdge {
  id: string;
  relation_type: string;
  peer_article_id: string;
  peer_article_name?: string | null;
  note?: string | null;
  created_at: string;
}

export interface ArticleRelationshipsResponse {
  outgoing: ArticleRelationshipEdge[];
  incoming: ArticleRelationshipEdge[];
}

export interface ArticleOut {
  id: string;
  channel_id: string;
  name: string;
  slug: string | null;
  markdown: string | null;
  metadata: Record<string, unknown> | null;
  series_id: string;
  effective_from: string | null;
  effective_to: string | null;
  lifecycle_status: string | null;
  is_current_for_rag: boolean;
  origin_article_id: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArticleListResponse {
  items: ArticleOut[];
  total: number;
}

export interface ArticleAttachmentOut {
  id: string;
  article_id: string;
  storage_path: string;
  original_filename: string;
  size_bytes: number;
  content_type: string | null;
  created_at: string;
}

export async function fetchArticleStats(): Promise<{ total: number }> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/articles/stats`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch article stats (${res.status})`);
  return res.json();
}

export async function fetchArticles(params: {
  channel_id?: string;
  search?: string;
  offset?: number;
  limit?: number;
}): Promise<ArticleListResponse> {
  const headers = await getAuthHeaders();
  const sp = new URLSearchParams();
  if (params.channel_id) sp.set('channel_id', params.channel_id);
  if (params.search) sp.set('search', params.search);
  if (params.offset != null) sp.set('offset', String(params.offset));
  if (params.limit != null) sp.set('limit', String(params.limit));
  const q = sp.toString();
  const res = await authAwareFetch(`${config.apiUrl}/api/articles${q ? `?${q}` : ''}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch articles (${res.status})`);
  return res.json();
}

export async function fetchArticle(id: string): Promise<ArticleOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/articles/${id}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch article (${res.status})`);
  return res.json();
}

function parseApiError(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null && 'detail' in body) {
    const d = (body as { detail?: unknown }).detail;
    if (typeof d === 'string') return d;
  }
  return fallback;
}

export async function createArticle(body: {
  channel_id: string;
  name: string;
  markdown?: string | null;
  origin_article_id?: string | null;
}): Promise<ArticleOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/articles`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseApiError(err, `Failed to create article (${res.status})`));
  }
  return res.json();
}

export async function patchArticle(
  articleId: string,
  body: {
    name?: string;
    channel_id?: string | null;
    origin_article_id?: string | null;
  },
): Promise<ArticleOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/articles/${articleId}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseApiError(err, `Failed to update article (${res.status})`));
  }
  return res.json();
}

export async function putArticleMarkdown(articleId: string, markdown: string | null): Promise<ArticleOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/articles/${articleId}/markdown`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ markdown }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseApiError(err, `Failed to save content (${res.status})`));
  }
  return res.json();
}

export async function fetchArticleRelationships(articleId: string): Promise<ArticleRelationshipsResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/articles/${articleId}/relationships`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch article relationships (${res.status})`);
  return res.json();
}

export async function createArticleRelationship(
  articleId: string,
  body: { target_article_id: string; relation_type: string; note?: string | null },
): Promise<ArticleRelationshipEdge> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/articles/${articleId}/relationships`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseApiError(err, `Failed to create relationship (${res.status})`));
  }
  return res.json();
}

export async function deleteArticleRelationship(articleId: string, relationshipId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/articles/${articleId}/relationships/${relationshipId}`,
    {
      method: 'DELETE',
      headers: { ...headers },
      credentials: 'include',
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseApiError(err, `Failed to delete relationship (${res.status})`));
  }
}

export async function deleteArticle(articleId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/articles/${articleId}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseApiError(err, `Failed to delete article (${res.status})`));
  }
}

export async function fetchArticleAttachments(articleId: string): Promise<ArticleAttachmentOut[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/articles/${articleId}/attachments`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch attachments (${res.status})`);
  return res.json();
}

export async function uploadArticleAttachment(
  articleId: string,
  file: File | Blob,
  filename?: string,
): Promise<ArticleAttachmentOut> {
  const headers = await getAuthHeaders();
  const fd = new FormData();
  const name = filename || (file instanceof File ? file.name : 'attachment');
  fd.append('file', file, name);
  const res = await authAwareFetch(`${config.apiUrl}/api/articles/${articleId}/attachments`, {
    method: 'POST',
    headers: { ...headers },
    credentials: 'include',
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseApiError(err, `Failed to upload attachment (${res.status})`));
  }
  return res.json();
}

export async function deleteArticleAttachment(articleId: string, attachmentId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/articles/${articleId}/attachments/${attachmentId}`,
    {
      method: 'DELETE',
      headers: { ...headers },
      credentials: 'include',
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseApiError(err, `Failed to delete attachment (${res.status})`));
  }
}

export interface ArticleImageUploadOut {
  path: string;
  filename: string;
  size_bytes: number;
  content_type: string;
}

export async function uploadArticleImage(
  articleId: string,
  file: File | Blob,
  filename?: string,
): Promise<ArticleImageUploadOut> {
  const headers = await getAuthHeaders();
  const fd = new FormData();
  const name = filename || (file instanceof File ? file.name : 'image.png');
  fd.append('file', file, name);
  const res = await authAwareFetch(`${config.apiUrl}/api/articles/${articleId}/images`, {
    method: 'POST',
    headers: { ...headers },
    credentials: 'include',
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseApiError(err, `Failed to upload image (${res.status})`));
  }
  return res.json();
}

export function articleFileUrl(articleId: string, relativePath: string): string {
  const enc = encodeURI(relativePath.replace(/^\/+/, ''));
  return `${config.apiUrl}/api/articles/${articleId}/files/${enc}`;
}
