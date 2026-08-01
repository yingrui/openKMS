import { ChevronDown, ChevronUp, ClipboardCheck, GitBranch, Loader2, Paperclip, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  ARTICLE_RELATION_TYPES,
  articleFileUrl,
  type ArticleAttachmentOut,
  type ArticleRelationshipsResponse,
  type ArticleReviewOut,
} from '../../data/articlesApi';

/**
 * Article detail has no true dialog overlays (delete / restore use the shared
 * `useConfirm()` confirm dialog); these are the info panel's largest self-contained,
 * independently-toggled sections, split out to keep `ArticleDetail.tsx` thin.
 */

export interface ArticleRelationshipsPanelProps {
  relSectionOpen: boolean;
  onToggle: () => void;
  lineageLoading: boolean;
  lineageRels: ArticleRelationshipsResponse | null;
  onDeleteRelationship: (relationshipId: string) => void;
  newRelTarget: string;
  onNewRelTargetChange: (value: string) => void;
  newRelType: string;
  onNewRelTypeChange: (value: string) => void;
  newRelNote: string;
  onNewRelNoteChange: (value: string) => void;
  relSaving: boolean;
  onAddRelationship: () => void;
}

export function ArticleRelationshipsPanel({
  relSectionOpen,
  onToggle,
  lineageLoading,
  lineageRels,
  onDeleteRelationship,
  newRelTarget,
  onNewRelTargetChange,
  newRelType,
  onNewRelTypeChange,
  newRelNote,
  onNewRelNoteChange,
  relSaving,
  onAddRelationship,
}: ArticleRelationshipsPanelProps) {
  return (
    <div className="document-detail-lineage document-detail-lineage--article">
      <button
        type="button"
        className="document-detail-lineage-header"
        onClick={onToggle}
        aria-expanded={relSectionOpen}
        aria-controls="article-relationships-panel"
        id="article-relationships-heading"
      >
        <GitBranch size={16} aria-hidden />
        <span>Relationships</span>
        {relSectionOpen ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
      </button>
      {!relSectionOpen && (
        <p className="document-detail-lineage-hint document-detail-muted">
          Link this article to others (supersedes, amends, see also, …). Click to expand.
        </p>
      )}
      {relSectionOpen && (
        <div
          id="article-relationships-panel"
          className="document-detail-lineage-panel"
          role="region"
          aria-labelledby="article-relationships-heading"
        >
          <div className="document-detail-lineage-rel-block">
            {lineageLoading ? (
              <p className="document-detail-muted">Loading…</p>
            ) : (
              <>
                <div className="document-detail-lineage-tables">
                  <div>
                    <div className="document-detail-lineage-dir">Outgoing (this → other)</div>
                    {lineageRels && lineageRels.outgoing.length > 0 ? (
                      <table className="document-detail-lineage-table">
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Other article</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {lineageRels.outgoing.map((r) => (
                            <tr key={r.id}>
                              <td>{r.relation_type}</td>
                              <td>
                                <Link to={`/articles/view/${r.peer_article_id}`}>
                                  {r.peer_article_name || r.peer_article_id}
                                </Link>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="document-detail-lineage-rm"
                                  title="Remove"
                                  onClick={() => onDeleteRelationship(r.id)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="document-detail-muted document-detail-lineage-empty">No outgoing links.</p>
                    )}
                  </div>
                  <div>
                    <div className="document-detail-lineage-dir">Incoming (other → this)</div>
                    {lineageRels && lineageRels.incoming.length > 0 ? (
                      <table className="document-detail-lineage-table">
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Other article</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lineageRels.incoming.map((r) => (
                            <tr key={r.id}>
                              <td>{r.relation_type}</td>
                              <td>
                                <Link to={`/articles/view/${r.peer_article_id}`}>
                                  {r.peer_article_name || r.peer_article_id}
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="document-detail-muted document-detail-lineage-empty">No incoming links.</p>
                    )}
                  </div>
                </div>
                <div className="document-detail-lineage-add">
                  <span className="document-detail-lineage-dir">Add outgoing edge</span>
                  <div className="document-detail-lineage-add-row">
                    <select
                      value={newRelType}
                      onChange={(e) => onNewRelTypeChange(e.target.value)}
                      className="document-detail-info-input"
                      aria-label="Relation type"
                    >
                      {ARTICLE_RELATION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      className="document-detail-info-input"
                      placeholder="Target article ID"
                      value={newRelTarget}
                      onChange={(e) => onNewRelTargetChange(e.target.value)}
                      aria-label="Target article ID"
                    />
                    <input
                      type="text"
                      className="document-detail-info-input"
                      placeholder="Note (optional)"
                      value={newRelNote}
                      onChange={(e) => onNewRelNoteChange(e.target.value)}
                      aria-label="Note"
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={onAddRelationship}
                      disabled={relSaving}
                    >
                      {relSaving ? <Loader2 size={12} className="doc-detail-spinner" /> : null}
                      Add
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export interface ArticleReviewPanelProps {
  reviewSectionOpen: boolean;
  onToggle: () => void;
  latestReview: ArticleReviewOut | null;
  reviewLoading: boolean;
  reviewRunning: boolean;
  channelReviewConfigured: boolean;
  channelId: string | null;
  onRunReview: () => void;
}

export function ArticleReviewPanel({
  reviewSectionOpen,
  onToggle,
  latestReview,
  reviewLoading,
  reviewRunning,
  channelReviewConfigured,
  channelId,
  onRunReview,
}: ArticleReviewPanelProps) {
  const { t } = useTranslation('articles');
  return (
    <div className="document-detail-lineage document-detail-lineage--article">
      <button
        type="button"
        className="document-detail-lineage-header"
        onClick={onToggle}
        aria-expanded={reviewSectionOpen}
        aria-controls="article-review-panel"
        id="article-review-heading"
      >
        <ClipboardCheck size={16} aria-hidden />
        <span>{t('articleDetail.reviewTitle')}</span>
        {latestReview && !reviewSectionOpen && (
          <span
            className={`article-review-badge article-review-badge--${latestReview.result.pass ? 'pass' : 'fail'}`}
          >
            {latestReview.result.pass ? t('articleDetail.reviewPass') : t('articleDetail.reviewFail')}
          </span>
        )}
        {reviewSectionOpen ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
      </button>
      {!reviewSectionOpen && (
        <p className="document-detail-lineage-hint document-detail-muted">
          {t('articleDetail.reviewCollapsedHint')}
        </p>
      )}
      {reviewSectionOpen && (
        <div
          id="article-review-panel"
          className="document-detail-lineage-panel article-review-panel"
          role="region"
          aria-labelledby="article-review-heading"
        >
          {!channelReviewConfigured && (
            <p className="document-detail-muted article-review-config-hint">
              {t('articleDetail.reviewNotConfigured')}{' '}
              {channelId && (
                <Link to={`/articles/channels/${channelId}/settings?tab=review`}>
                  {t('articleDetail.reviewConfigureLink')}
                </Link>
              )}
            </p>
          )}
          <div className="article-review-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onRunReview}
              disabled={reviewRunning || !channelReviewConfigured}
            >
              {reviewRunning ? <Loader2 size={12} className="doc-detail-spinner" /> : null}
              {reviewRunning ? t('articleDetail.reviewRunning') : t('articleDetail.reviewRun')}
            </button>
          </div>
          {reviewLoading ? (
            <p className="document-detail-muted">{t('articleDetail.reviewLoading')}</p>
          ) : latestReview ? (
            <div className="article-review-result">
              <div className="article-review-summary-row">
                <span
                  className={`article-review-badge article-review-badge--${latestReview.result.pass ? 'pass' : 'fail'}`}
                >
                  {latestReview.result.pass ? t('articleDetail.reviewPass') : t('articleDetail.reviewFail')}
                </span>
                <span className="article-review-score">
                  {t('articleDetail.reviewScore', {
                    score: Math.round(latestReview.result.overall_score * 100),
                  })}
                </span>
                <span className="document-detail-muted article-review-meta">
                  {new Date(latestReview.created_at).toLocaleString()}
                  {latestReview.created_by_name ? ` · ${latestReview.created_by_name}` : ''}
                </span>
              </div>
              {latestReview.result.summary && (
                <p className="article-review-summary">{latestReview.result.summary}</p>
              )}
              {latestReview.result.criteria.length > 0 && (
                <table className="document-detail-lineage-table article-review-criteria-table">
                  <thead>
                    <tr>
                      <th>{t('articleDetail.reviewCriterion')}</th>
                      <th>{t('articleDetail.reviewCriterionScore')}</th>
                      <th>{t('articleDetail.reviewCriterionNotes')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestReview.result.criteria.map((c) => (
                      <tr key={c.id}>
                        <td>{c.label || c.id}</td>
                        <td>{c.score.toFixed(1)}</td>
                        <td>{c.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {latestReview.result.suggestions.length > 0 && (
                <div className="article-review-suggestions">
                  <div className="document-detail-lineage-dir">{t('articleDetail.reviewSuggestions')}</div>
                  <ul>
                    {latestReview.result.suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="document-detail-muted">{t('articleDetail.reviewEmpty')}</p>
          )}
        </div>
      )}
    </div>
  );
}

export interface ArticleAttachmentsPanelProps {
  attachmentsSectionOpen: boolean;
  onToggle: () => void;
  attachments: ArticleAttachmentOut[];
  articleId: string;
  markdownEditMode: boolean;
  onInsertAttachmentRef: (relPath: string, label?: string) => void;
  onDeleteAttachment: (att: ArticleAttachmentOut) => void;
}

export function ArticleAttachmentsPanel({
  attachmentsSectionOpen,
  onToggle,
  attachments,
  articleId,
  markdownEditMode,
  onInsertAttachmentRef,
  onDeleteAttachment,
}: ArticleAttachmentsPanelProps) {
  if (attachments.length === 0) return null;
  return (
    <div className="document-detail-lineage document-detail-lineage--article">
      <button
        type="button"
        className="document-detail-lineage-header"
        onClick={onToggle}
        aria-expanded={attachmentsSectionOpen}
        aria-controls="article-attachments-panel"
        id="article-attachments-heading"
      >
        <Paperclip size={16} aria-hidden />
        <span className="article-detail-attachments-label">
          Attachments
          <span
            className="document-detail-lineage-count"
            aria-label={`${attachments.length} file${attachments.length === 1 ? '' : 's'}`}
          >
            {attachments.length}
          </span>
        </span>
        {attachmentsSectionOpen ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
      </button>
      {attachmentsSectionOpen && (
        <div
          id="article-attachments-panel"
          className="document-detail-lineage-panel"
          role="region"
          aria-labelledby="article-attachments-heading"
        >
          <ul className="article-detail-attachments-list">
            {attachments.map((att) => (
              <li key={att.id}>
                <a href={articleFileUrl(articleId, att.storage_path)} target="_blank" rel="noopener noreferrer">
                  {att.original_filename}
                </a>
                <span className="document-detail-muted"> ({att.size_bytes} bytes)</span>
                {markdownEditMode && (
                  <span className="article-detail-attachment-actions">
                    <button
                      type="button"
                      className="article-detail-attachment-btn"
                      onClick={() => onInsertAttachmentRef(att.storage_path, att.original_filename)}
                      title="Insert link in markdown"
                    >
                      Insert link
                    </button>
                    <button
                      type="button"
                      className="article-detail-attachment-btn article-detail-attachment-btn--danger"
                      onClick={() => onDeleteAttachment(att)}
                      title="Remove attachment"
                      aria-label="Remove attachment"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
