/** Content comments API. */
import { request } from './apiClient';

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
  return request<ContentCommentListResponse>('/api/comments', {
    query: {
      resource_type: resourceType,
      resource_id: resourceId,
      limit: opts?.limit,
      offset: opts?.offset,
    },
  });
}

export async function createComment(input: {
  resource_type: CommentResourceType;
  resource_id: string;
  body: string;
  rank: number;
}): Promise<ContentCommentOut> {
  return request<ContentCommentOut>('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function createCommentReply(
  commentId: string,
  body: string,
): Promise<ContentCommentOut> {
  return request<ContentCommentOut>(`/api/comments/${commentId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
}

export async function updateComment(
  commentId: string,
  body: { body?: string; rank?: number },
): Promise<ContentCommentOut> {
  return request<ContentCommentOut>(`/api/comments/${commentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteComment(commentId: string): Promise<void> {
  return request<void>(`/api/comments/${commentId}`, { method: 'DELETE' });
}
