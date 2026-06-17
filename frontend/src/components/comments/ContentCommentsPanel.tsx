import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { CommentComposer, CommentThreadList } from './CommentThreadItem';
import type { ContentCommentListResponse } from '../../data/commentsApi';
import type { useContentComments } from './useContentComments';
import './ContentCommentsRail.scss';

type CommentsApi = Pick<
  ReturnType<typeof useContentComments>,
  'data' | 'loading' | 'postTopLevel' | 'postReply' | 'patchComment' | 'removeComment'
>;

type Props = {
  onRequestCollapse: () => void;
  comments: CommentsApi;
};

export function ContentCommentsPanel({ onRequestCollapse, comments }: Props) {
  const { t } = useTranslation('comments');
  const { user } = useAuth();
  const data: ContentCommentListResponse | null = comments.data;
  const displayName = user?.name || user?.username || '';
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerInit, setComposerInit] = useState(false);

  useEffect(() => {
    if (comments.loading || composerInit) return;
    setComposerOpen((data?.total ?? 0) === 0);
    setComposerInit(true);
  }, [comments.loading, composerInit, data?.total]);

  const summaryParts: string[] = [];
  if (data?.avg_rank != null && data.rank_count > 0) {
    summaryParts.push(t('avgRank', { score: data.avg_rank.toFixed(1), count: data.rank_count }));
  }
  if (data && data.total > 0) {
    summaryParts.push(t('commentCount', { count: data.total }));
  }
  const summaryText = summaryParts.join(' · ');

  const handlePosted = async (body: string, rank: number) => {
    await comments.postTopLevel(body, rank);
    setComposerOpen(false);
  };

  return (
    <div className="content-comments-panel">
      <header className="content-comments-panel__head">
        <h2 className="content-comments-panel__title">{t('title')}</h2>
        <button
          type="button"
          className="content-comments-panel__close"
          onClick={onRequestCollapse}
          aria-label={t('close')}
        >
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="content-comments-panel__composer-section">
        <button
          type="button"
          className="content-comments-panel__composer-toggle"
          onClick={() => setComposerOpen((o) => !o)}
          aria-expanded={composerOpen}
        >
          <span className="content-comments-panel__composer-toggle-label">{t('writeComment')}</span>
          {!composerOpen && summaryText ? (
            <span className="content-comments-panel__composer-toggle-meta">{summaryText}</span>
          ) : null}
          {composerOpen ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        </button>
        {composerOpen ? (
          <div className="content-comments-panel__composer-wrap">
            {summaryText ? <p className="content-comments-panel__summary">{summaryText}</p> : null}
            <CommentComposer displayName={displayName} onSubmit={handlePosted} />
          </div>
        ) : null}
      </div>
      <div className="content-comments-panel__list">
        {comments.loading ? (
          <p className="content-comments-panel__muted">{t('loading')}</p>
        ) : data && data.items.length > 0 ? (
          <CommentThreadList
            items={data.items}
            currentSub={user?.id}
            onReply={comments.postReply}
            onPatch={comments.patchComment}
            onDelete={comments.removeComment}
          />
        ) : (
          <p className="content-comments-panel__empty">{t('empty')}</p>
        )}
      </div>
    </div>
  );
}
