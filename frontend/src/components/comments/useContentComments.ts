import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  createComment,
  createCommentReply,
  deleteComment,
  fetchComments,
  updateComment,
  type CommentResourceType,
  type ContentCommentListResponse,
  type ContentCommentOut,
} from '../../data/commentsApi';

export function useContentComments(resourceType: CommentResourceType, resourceId: string, enabled: boolean) {
  const { t } = useTranslation('comments');
  const [data, setData] = useState<ContentCommentListResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !resourceId) return;
    setLoading(true);
    try {
      const res = await fetchComments(resourceType, resourceId, { limit: 100 });
      setData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('loadFailed'));
      setData({ items: [], total: 0, avg_rank: null, rank_count: 0 });
    } finally {
      setLoading(false);
    }
  }, [enabled, resourceId, resourceType, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const postTopLevel = useCallback(
    async (body: string, rank: number) => {
      try {
        await createComment({ resource_type: resourceType, resource_id: resourceId, body, rank });
        await refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('postFailed'));
        throw e;
      }
    },
    [resourceId, resourceType, refresh, t],
  );

  const postReply = useCallback(
    async (parentId: string, body: string) => {
      try {
        await createCommentReply(parentId, body);
        await refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('replyFailed'));
        throw e;
      }
    },
    [refresh, t],
  );

  const patchComment = useCallback(
    async (commentId: string, patch: { body?: string; rank?: number }) => {
      try {
        await updateComment(commentId, patch);
        await refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('updateFailed'));
        throw e;
      }
    },
    [refresh, t],
  );

  const removeComment = useCallback(
    async (commentId: string) => {
      try {
        await deleteComment(commentId);
        await refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('deleteFailed'));
        throw e;
      }
    },
    [refresh, t],
  );

  return {
    data,
    loading,
    refresh,
    postTopLevel,
    postReply,
    patchComment,
    removeComment,
  };
}

export type { ContentCommentOut };
