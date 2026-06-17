import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { CommentRankStars } from './CommentRankStars';
import type { ContentCommentOut } from './useContentComments';

function avatarLabel(name: string | null | undefined, fallback: string): string {
  const src = (name || fallback || '?').trim();
  return src.slice(0, 1).toUpperCase();
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

type ItemProps = {
  comment: ContentCommentOut;
  isReply?: boolean;
  currentSub?: string;
  onReply: (parentId: string, body: string) => Promise<void>;
  onPatch: (id: string, patch: { body?: string; rank?: number }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

function CommentRow({ comment, isReply = false, currentSub, onReply, onPatch, onDelete }: ItemProps) {
  const { t } = useTranslation('comments');
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [editRank, setEditRank] = useState(comment.rank);
  const [busy, setBusy] = useState(false);
  const isAuthor = currentSub != null && comment.created_by === currentSub;

  const submitReply = async () => {
    const text = replyDraft.trim();
    if (!text) return;
    setBusy(true);
    try {
      await onReply(comment.id, text);
      setReplyDraft('');
      setReplyOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async () => {
    const text = editBody.trim();
    if (!text) return;
    setBusy(true);
    try {
      if (isReply) {
        await onPatch(comment.id, { body: text });
      } else {
        await onPatch(comment.id, { body: text, rank: editRank ?? undefined });
      }
      setEditOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t('deleteConfirm'))) return;
    setBusy(true);
    try {
      await onDelete(comment.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`comment-thread-item${isReply ? ' comment-thread-item--reply' : ''}`}>
      <div className="comment-thread-item__avatar" aria-hidden>
        {avatarLabel(comment.created_by_name, comment.created_by)}
      </div>
      <div className="comment-thread-item__body">
        <header className="comment-thread-item__meta">
          <span className="comment-thread-item__author">{comment.created_by_name || comment.created_by}</span>
          <span className="comment-thread-item__time">{formatWhen(comment.created_at)}</span>
          {!isReply && comment.rank != null ? (
            <span className="comment-thread-item__rank">
              <CommentRankStars value={comment.rank} readonly size={12} />
            </span>
          ) : null}
        </header>
        {editOpen ? (
          <div className="comment-thread-item__edit">
            <textarea
              className="comment-thread-item__textarea"
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={3}
            />
            {!isReply ? (
              <CommentRankStars value={editRank} onChange={setEditRank} label={t('rankLabel')} />
            ) : null}
            <div className="comment-thread-item__actions">
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void submitEdit()}>
                {busy ? <Loader2 size={14} className="doc-detail-spinner" /> : null}
                {t('save')}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditOpen(false)}>
                {t('cancel')}
              </button>
            </div>
          </div>
        ) : (
          <p className="comment-thread-item__text">{comment.body}</p>
        )}
        {!editOpen ? (
          <div className="comment-thread-item__toolbar">
            {!isReply ? (
              <button type="button" className="comment-thread-item__link" onClick={() => setReplyOpen((o) => !o)}>
                {t('reply')}
              </button>
            ) : null}
            {isAuthor ? (
              <>
                <button type="button" className="comment-thread-item__link" onClick={() => setEditOpen(true)}>
                  {t('edit')}
                </button>
                <button type="button" className="comment-thread-item__link" onClick={() => void handleDelete()}>
                  {t('delete')}
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        {replyOpen && !isReply ? (
          <div className="comment-thread-item__reply-form">
            <textarea
              className="comment-thread-item__textarea"
              placeholder={t('replyPlaceholder')}
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              rows={2}
            />
            <div className="comment-thread-item__reply-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy || !replyDraft.trim()}
                onClick={() => void submitReply()}
              >
                {busy ? <Loader2 size={14} className="doc-detail-spinner" /> : null}
                {t('post')}
              </button>
            </div>
          </div>
        ) : null}
        {!isReply && comment.replies.length > 0 ? (
          <div className="comment-thread-item__replies">
            {comment.replies.map((r) => (
              <CommentRow
                key={r.id}
                comment={r}
                isReply
                currentSub={currentSub}
                onReply={onReply}
                onPatch={onPatch}
                onDelete={onDelete}
              />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

type ThreadProps = {
  items: ContentCommentOut[];
  currentSub?: string;
  onReply: (parentId: string, body: string) => Promise<void>;
  onPatch: (id: string, patch: { body?: string; rank?: number }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export function CommentThreadList({ items, currentSub, onReply, onPatch, onDelete }: ThreadProps) {
  return (
    <div className="comment-thread-list">
      {items.map((c) => (
        <CommentRow
          key={c.id}
          comment={c}
          currentSub={currentSub}
          onReply={onReply}
          onPatch={onPatch}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

export function CommentComposer({
  displayName,
  onSubmit,
}: {
  displayName: string;
  onSubmit: (body: string, rank: number) => Promise<void>;
}) {
  const { t } = useTranslation('comments');
  const [body, setBody] = useState('');
  const [rank, setRank] = useState(0);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    try {
      await onSubmit(text, rank);
      setBody('');
      setRank(0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="comment-composer">
      <div className="comment-composer__avatar" aria-hidden>
        {avatarLabel(displayName, displayName)}
      </div>
      <div className="comment-composer__fields">
        <textarea
          className="comment-composer__input"
          placeholder={t('placeholder')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
        />
        <div className="comment-composer__footer">
          <CommentRankStars value={rank} onChange={setRank} label={t('selectRank')} />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || !body.trim()}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 size={14} className="doc-detail-spinner" /> : null}
            {t('post')}
          </button>
        </div>
      </div>
    </div>
  );
}
