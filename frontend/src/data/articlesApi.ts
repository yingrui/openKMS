/** Articles API. */
import { config } from '../config';
import { request, type RequestError } from './apiClient';

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
  return request<{ total: number }>('/api/articles/stats');
}

export async function fetchArticles(params: {
  channel_id?: string;
  search?: string;
  offset?: number;
  limit?: number;
}): Promise<ArticleListResponse> {
  return request<ArticleListResponse>('/api/articles', {
    query: {
      channel_id: params.channel_id,
      search: params.search,
      offset: params.offset,
      limit: params.limit,
    },
  });
}

export async function fetchArticle(id: string): Promise<ArticleOut> {
  return request<ArticleOut>(`/api/articles/${id}`);
}

export async function createArticle(body: {
  channel_id: string;
  name: string;
  markdown?: string | null;
  origin_article_id?: string | null;
}): Promise<ArticleOut> {
  return request<ArticleOut>('/api/articles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function patchArticle(
  articleId: string,
  body: {
    name?: string;
    channel_id?: string | null;
    origin_article_id?: string | null;
  },
): Promise<ArticleOut> {
  return request<ArticleOut>(`/api/articles/${articleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function putArticleMarkdown(articleId: string, markdown: string | null): Promise<ArticleOut> {
  return request<ArticleOut>(`/api/articles/${articleId}/markdown`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown }),
  });
}

export async function fetchArticleRelationships(articleId: string): Promise<ArticleRelationshipsResponse> {
  return request<ArticleRelationshipsResponse>(`/api/articles/${articleId}/relationships`);
}

export async function createArticleRelationship(
  articleId: string,
  body: { target_article_id: string; relation_type: string; note?: string | null },
): Promise<ArticleRelationshipEdge> {
  return request<ArticleRelationshipEdge>(`/api/articles/${articleId}/relationships`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteArticleRelationship(articleId: string, relationshipId: string): Promise<void> {
  return request<void>(`/api/articles/${articleId}/relationships/${relationshipId}`, { method: 'DELETE' });
}

export async function deleteArticle(articleId: string): Promise<void> {
  return request<void>(`/api/articles/${articleId}`, { method: 'DELETE' });
}

export async function fetchArticleAttachments(articleId: string): Promise<ArticleAttachmentOut[]> {
  return request<ArticleAttachmentOut[]>(`/api/articles/${articleId}/attachments`);
}

export async function uploadArticleAttachment(
  articleId: string,
  file: File | Blob,
  filename?: string,
): Promise<ArticleAttachmentOut> {
  const fd = new FormData();
  const name = filename || (file instanceof File ? file.name : 'attachment');
  fd.append('file', file, name);
  return request<ArticleAttachmentOut>(`/api/articles/${articleId}/attachments`, {
    method: 'POST',
    body: fd,
  });
}

export async function deleteArticleAttachment(articleId: string, attachmentId: string): Promise<void> {
  return request<void>(`/api/articles/${articleId}/attachments/${attachmentId}`, { method: 'DELETE' });
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
  const fd = new FormData();
  const name = filename || (file instanceof File ? file.name : 'image.png');
  fd.append('file', file, name);
  return request<ArticleImageUploadOut>(`/api/articles/${articleId}/images`, {
    method: 'POST',
    body: fd,
  });
}

export function articleFileUrl(articleId: string, relativePath: string): string {
  const enc = encodeURI(relativePath.replace(/^\/+/, ''));
  return `${config.apiUrl}/api/articles/${articleId}/files/${enc}`;
}

export interface ArticleReviewCriterionResult {
  id: string;
  label?: string | null;
  score: number;
  notes: string;
}

export interface ArticleReviewResult {
  overall_score: number;
  pass: boolean;
  summary: string;
  criteria: ArticleReviewCriterionResult[];
  suggestions: string[];
}

export interface ArticleReviewOut {
  id: string;
  article_id: string;
  review_model_id: string | null;
  result: ArticleReviewResult;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export async function runArticleReview(
  articleId: string,
  body?: { model_id?: string; prompt?: string },
): Promise<ArticleReviewOut> {
  return request<ArticleReviewOut>(`/api/articles/${articleId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

export async function fetchLatestArticleReview(articleId: string): Promise<ArticleReviewOut | null> {
  try {
    return await request<ArticleReviewOut>(`/api/articles/${articleId}/reviews/latest`);
  } catch (e) {
    if ((e as RequestError).status === 404) return null;
    throw e;
  }
}
