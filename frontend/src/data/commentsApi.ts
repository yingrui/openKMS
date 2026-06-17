/** Content comments API. */
import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

export type CommentResourceType =
  | 'article'
  | 'document'
  | 'knowledge_base'
  | 'wiki_space'
  | 'project';

export interface ContentCommentOut {
  id: string;
  resource_type: CommentResourceType;
  resource_id: string;
  parent_comment_id: string | null;
  body: string;
  rank: number | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  replies: ContentCommentOut[];
}

export interface ContentCommentListResponse {
  items: ContentCommentOut[];
  total: number;
  avg_rank: number | null;
  rank_count: number;
}

export async function fetchComments(
  resourceType: CommentResourceType,
  resourceId: string,
  opts?: { limit?: number; offset?: number },
): Promise<ContentCommentListResponse> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({
    resource_type: resourceType,
    resource_id: resourceId,
  });
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  if (opts?.offset != null) params.set('offset', String(opts.offset));
  const res = await authAwareFetch(`${config.apiUrl}/api/comments?${params}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createComment(input: {
  resource_type: CommentResourceType;
  resource_id: string;
  body: string;
  rank: number;
}): Promise<ContentCommentOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createCommentReply(
  commentId: string,
  body: string,
): Promise<ContentCommentOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/comments/${commentId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    credentials: 'include',
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateComment(
  commentId: string,
  body: { body?: string; rank?: number },
): Promise<ContentCommentOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/comments/${commentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteComment(commentId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/comments/${commentId}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await res.text());
}
