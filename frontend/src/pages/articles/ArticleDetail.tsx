import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  Paperclip,
  Printer,
  Save,
  Trash2,
  Upload,
  X as XIcon,
} from 'lucide-react';
import {
  RichMarkdown,
} from '../../components/markdown/richMarkdown';
import { ContentCommentsShell } from '../../components/comments/ContentCommentsShell';
import { PanelToolbar } from '../../styles/design-system';
import { ArticleAttachmentsPanel, ArticleRelationshipsPanel, ArticleReviewPanel } from './ArticleDetail.modals';
import { useArticleDetail } from './useArticleDetail';
import '../../styles/document-detail.scss';
import './ArticleDetail.scss';

const MARKDOWN_SPLIT_GUTTER_PX = 6;

export function ArticleDetail() {
  const {
    id, article, attachments, error, backTo, channelLabel, infoVisible, setInfoVisible, editName,
    setEditName, editSourceRef, setEditSourceRef, editMarkdown, setEditMarkdown, titleEditMode,
    setTitleEditMode, sourceEditMode, setSourceEditMode, markdownEditMode, setMarkdownEditMode,
    markdownPreviewOpen, setMarkdownPreviewOpen, markdownSplitEditorFr, savingTitle, savingSource,
    savingMarkdown, deleting, relSectionOpen, setRelSectionOpen, lineageRels, lineageLoading,
    newRelTarget, setNewRelTarget, newRelType, setNewRelType, newRelNote, setNewRelNote, relSaving,
    attachmentsSectionOpen, setAttachmentsSectionOpen, reviewSectionOpen, setReviewSectionOpen,
    latestReview, reviewLoading, reviewRunning, channelReviewConfigured, uploadingMedia, dragActive,
    setDragActive, textareaRef, imageInputRef, attachmentInputRef, markdownSplitLayoutRef, markdownSectionRef,
    mdComponents, handleRunReview, handleSaveTitle, handleCancelTitleEdit, handleSaveSource,
    handleCancelSourceEdit, handleAddRelationship, handleDeleteRelationship, insertAttachmentRef,
    handleEditorPaste, handleEditorDrop, handleImagePick, handleAttachmentPick, handleDeleteAttachment,
    handleSaveMarkdown, handleCancelMarkdownEdit, handleMarkdownSplitPointerDown, handleDelete,
  } = useArticleDetail();

  return (
    <ContentCommentsShell resourceType="article" resourceId={id ?? ''} enabled={Boolean(id)}>
    <div className="document-detail article-detail-page">
      <Link to={backTo} className="document-detail-back">
        <ArrowLeft size={18} />
        <span>Back to Articles</span>
      </Link>
      {error ? (
        <div className="document-detail-error">{error}</div>
      ) : !article ? (
        <div className="document-detail-loading">Loading…</div>
      ) : (
        <>
          <section className={`document-detail-info document-detail-info-combined ${infoVisible ? '' : 'document-detail-info--collapsed'}`}>
            <h2
              className="document-detail-info-title document-detail-info-toggle"
              onClick={() => setInfoVisible((x) => !x)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setInfoVisible((x) => !x)}
              aria-expanded={infoVisible}
            >
              <Info size={20} />
              <span>Article information</span>
              <button
                type="button"
                className="document-detail-info-toggle-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setInfoVisible((x) => !x);
                }}
                aria-label={infoVisible ? 'Hide' : 'Show'}
              >
                {infoVisible ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            </h2>
            {infoVisible && (
              <div className="document-detail-info-body">
                <dl className="document-detail-info-list document-detail-info-list--name-row">
                  <div className="document-detail-info-item document-detail-info-item--name">
                    <dt>Title</dt>
                    <dd>
                      {titleEditMode ? (
                        <div className="article-detail-inline-edit">
                          <input
                            type="text"
                            className="document-detail-info-input article-detail-inline-edit-input"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            aria-label="Article title"
                            placeholder="Title"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && editName.trim()) void handleSaveTitle();
                              if (e.key === 'Escape') handleCancelTitleEdit();
                            }}
                          />
                          <div className="article-detail-inline-edit-actions">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => void handleSaveTitle()}
                              disabled={savingTitle || !editName.trim()}
                            >
                              {savingTitle ? <Loader2 size={12} className="doc-detail-spinner" /> : null}
                              <span>{savingTitle ? 'Saving…' : 'Save'}</span>
                            </button>
                            <button
                              type="button"
                              className="document-detail-info-cancel-btn"
                              onClick={handleCancelTitleEdit}
                              disabled={savingTitle}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="document-detail-info-value">
                          {editName}
                          <button
                            type="button"
                            className="document-detail-info-edit-btn"
                            onClick={() => setTitleEditMode(true)}
                            title="Edit title"
                            aria-label="Edit title"
                          >
                            <Edit3 size={12} />
                          </button>
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="document-detail-info-stats-grid">
                  <div className="document-detail-info-stats-col">
                    <dl className="document-detail-info-list document-detail-info-list--col">
                      <div className="document-detail-info-item document-detail-info-item--compact">
                        <dt>Channel</dt>
                        <dd>{channelLabel}</dd>
                      </div>
                      <div className="document-detail-info-item document-detail-info-item--compact">
                        <dt>Source</dt>
                        <dd className="article-detail-source-dd">
                          {sourceEditMode ? (
                            <div className="article-detail-inline-edit">
                              <input
                                type="text"
                                className="document-detail-info-input article-detail-inline-edit-input"
                                value={editSourceRef}
                                onChange={(e) => setEditSourceRef(e.target.value)}
                                aria-label="Source ID or URL"
                                placeholder="External ID or URL"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') void handleSaveSource();
                                  if (e.key === 'Escape') handleCancelSourceEdit();
                                }}
                              />
                              <div className="article-detail-inline-edit-actions">
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => void handleSaveSource()}
                                  disabled={savingSource}
                                >
                                  {savingSource ? <Loader2 size={12} className="doc-detail-spinner" /> : null}
                                  <span>{savingSource ? 'Saving…' : 'Save'}</span>
                                </button>
                                <button
                                  type="button"
                                  className="document-detail-info-cancel-btn"
                                  onClick={handleCancelSourceEdit}
                                  disabled={savingSource}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="document-detail-info-value">
                              {article.origin_article_id?.trim() ? (
                                /^https?:\/\//i.test(article.origin_article_id.trim()) ? (
                                  <a href={article.origin_article_id.trim()} target="_blank" rel="noopener noreferrer">
                                    {article.origin_article_id.trim()}
                                  </a>
                                ) : (
                                  <span title={article.origin_article_id}>{article.origin_article_id}</span>
                                )
                              ) : (
                                <span className="document-detail-muted">—</span>
                              )}
                              <button
                                type="button"
                                className="document-detail-info-edit-btn"
                                onClick={() => setSourceEditMode(true)}
                                title="Edit source"
                                aria-label="Edit source"
                              >
                                <Edit3 size={12} />
                              </button>
                            </span>
                          )}
                        </dd>
                      </div>
                      <div className="document-detail-info-item document-detail-info-item--compact">
                        <dt>Lifecycle</dt>
                        <dd>{article.lifecycle_status ?? '—'}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="document-detail-info-stats-col">
                    <dl className="document-detail-info-list document-detail-info-list--col">
                      <div className="document-detail-info-item document-detail-info-item--compact">
                        <dt>Applicable</dt>
                        <dd>{article.is_current_for_rag ? 'Yes' : 'No'}</dd>
                      </div>
                      <div className="document-detail-info-item document-detail-info-item--compact">
                        <dt>Updated</dt>
                        <dd>{new Date(article.updated_at).toLocaleString()}</dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <ArticleRelationshipsPanel
                  relSectionOpen={relSectionOpen}
                  onToggle={() => setRelSectionOpen((o) => !o)}
                  lineageLoading={lineageLoading}
                  lineageRels={lineageRels}
                  onDeleteRelationship={(relationshipId) => void handleDeleteRelationship(relationshipId)}
                  newRelTarget={newRelTarget}
                  onNewRelTargetChange={setNewRelTarget}
                  newRelType={newRelType}
                  onNewRelTypeChange={setNewRelType}
                  newRelNote={newRelNote}
                  onNewRelNoteChange={setNewRelNote}
                  relSaving={relSaving}
                  onAddRelationship={() => void handleAddRelationship()}
                />

                <ArticleReviewPanel
                  reviewSectionOpen={reviewSectionOpen}
                  onToggle={() => setReviewSectionOpen((o) => !o)}
                  latestReview={latestReview}
                  reviewLoading={reviewLoading}
                  reviewRunning={reviewRunning}
                  channelReviewConfigured={channelReviewConfigured}
                  channelId={article.channel_id}
                  onRunReview={() => void handleRunReview()}
                />

                <ArticleAttachmentsPanel
                  attachmentsSectionOpen={attachmentsSectionOpen}
                  onToggle={() => setAttachmentsSectionOpen((o) => !o)}
                  attachments={attachments}
                  articleId={article.id}
                  markdownEditMode={markdownEditMode}
                  onInsertAttachmentRef={insertAttachmentRef}
                  onDeleteAttachment={(att) => void handleDeleteAttachment(att)}
                />

                <div className="document-detail-metadata-actions article-detail-danger-zone">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm article-detail-delete-btn"
                    onClick={() => void handleDelete()}
                    disabled={deleting}
                  >
                    {deleting ? <Loader2 size={12} className="doc-detail-spinner" /> : <Trash2 size={14} />}
                    <span>{deleting ? 'Deleting…' : 'Delete article'}</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          <div className="document-detail-split article-detail-markdown-split">
            <section
              ref={markdownSectionRef}
              className={`document-detail-panel document-detail-markdown${markdownEditMode ? ' article-detail-markdown-panel--editing' : ''}`}
            >
              <PanelToolbar
                leading={
                  <>
                    <FileText size={16} />
                    <span>Markdown</span>
                  </>
                }
                actions={
                  markdownEditMode ? (
                    <>
                      <button
                        type="button"
                        className="document-detail-edit-toggle"
                        onClick={() => setMarkdownPreviewOpen((val) => !val)}
                        title={markdownPreviewOpen ? 'Hide preview' : 'Show preview on the right'}
                        aria-label={markdownPreviewOpen ? 'Hide preview' : 'Show preview on the right'}
                      >
                        {markdownPreviewOpen ? <EyeOff size={14} /> : <Eye size={14} />}
                        <span className="ds-compact-label">{markdownPreviewOpen ? 'Hide preview' : 'Preview'}</span>
                      </button>
                      <button
                        type="button"
                        className="document-detail-edit-toggle"
                        onClick={() => imageInputRef.current?.click()}
                        disabled={uploadingMedia}
                        title="Insert image"
                        aria-label="Insert image"
                      >
                        {uploadingMedia ? <Loader2 size={14} className="doc-detail-spinner" /> : <ImageIcon size={14} />}
                        <span className="ds-compact-label">Image</span>
                      </button>
                      <button
                        type="button"
                        className="document-detail-edit-toggle"
                        onClick={() => attachmentInputRef.current?.click()}
                        disabled={uploadingMedia}
                        title="Add attachment"
                        aria-label="Add attachment"
                      >
                        <Paperclip size={14} />
                        <span className="ds-compact-label">Attachment</span>
                      </button>
                      <button
                        type="button"
                        className="document-detail-edit-toggle document-detail-save-btn"
                        onClick={() => void handleSaveMarkdown()}
                        disabled={savingMarkdown}
                        title="Save content"
                        aria-label="Save content"
                      >
                        {savingMarkdown ? (
                          <Loader2 size={14} className="doc-detail-spinner" aria-hidden />
                        ) : (
                          <Save size={14} aria-hidden />
                        )}
                        <span className="ds-compact-label">{savingMarkdown ? 'Saving…' : 'Save'}</span>
                      </button>
                      <button
                        type="button"
                        className="document-detail-edit-toggle"
                        onClick={handleCancelMarkdownEdit}
                        disabled={savingMarkdown}
                        title="Discard changes"
                        aria-label="Discard changes"
                      >
                        <XIcon size={14} />
                        <span className="ds-compact-label">Cancel</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="document-detail-edit-toggle"
                        onClick={() => window.print()}
                        title="Print markdown"
                        aria-label="Print markdown"
                      >
                        <Printer size={14} />
                        <span className="ds-compact-label">Print</span>
                      </button>
                      <button
                        type="button"
                        className="document-detail-edit-toggle"
                        onClick={() => setMarkdownEditMode(true)}
                        title="Edit markdown"
                        aria-label="Edit markdown"
                        aria-pressed={false}
                      >
                        <Edit3 size={14} />
                        <span className="ds-compact-label">Edit</span>
                      </button>
                    </>
                  )
                }
              />
              <div
                className={`document-detail-markdown-body${markdownEditMode ? ' article-detail-markdown-body--edit' : ''}`}
              >
                {markdownEditMode ? (
                  <div
                    ref={markdownSplitLayoutRef}
                    className={`article-detail-markdown-edit-layout${markdownPreviewOpen && id ? ' article-detail-markdown-edit-layout--split' : ''}`}
                    style={
                      markdownPreviewOpen && id
                        ? {
                            gridTemplateColumns: `${markdownSplitEditorFr}fr ${MARKDOWN_SPLIT_GUTTER_PX}px ${100 - markdownSplitEditorFr}fr`,
                          }
                        : undefined
                    }
                  >
                    <div
                      className={`article-detail-editor-dropzone article-detail-markdown-edit-editor${dragActive ? ' article-detail-editor-dropzone--active' : ''}`}
                      onDragOver={(e) => {
                        if (e.dataTransfer?.types?.includes('Files')) {
                          e.preventDefault();
                          setDragActive(true);
                        }
                      }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        void handleEditorDrop(e as unknown as React.DragEvent<HTMLTextAreaElement>);
                      }}
                    >
                      <textarea
                        ref={textareaRef}
                        className="article-detail-markdown-textarea"
                        aria-label="Article body in Markdown"
                        placeholder="Write Markdown here. Paste or drop an image to upload, or use the toolbar."
                        value={editMarkdown}
                        onChange={(e) => setEditMarkdown(e.target.value)}
                        onPaste={(e) => void handleEditorPaste(e)}
                      />
                      {dragActive && (
                        <div className="article-detail-editor-dropzone-overlay" aria-hidden>
                          <Upload size={28} />
                          <span>Drop to upload — images embed inline, others become attachments</span>
                        </div>
                      )}
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="openkms-hidden"
                        onChange={(e) => void handleImagePick(e)}
                      />
                      <input
                        ref={attachmentInputRef}
                        type="file"
                        multiple
                        className="openkms-hidden"
                        onChange={(e) => void handleAttachmentPick(e)}
                      />
                    </div>
                    {markdownPreviewOpen && id ? (
                      <>
                        <div
                          className="article-detail-markdown-splitter"
                          role="separator"
                          aria-orientation="vertical"
                          aria-label="Resize editor and preview"
                          onPointerDown={handleMarkdownSplitPointerDown}
                        />
                        <aside className="article-detail-markdown-preview-pane" aria-label="Markdown preview">
                          <div className="article-detail-markdown-preview-scroll article-detail-markdown-read">
                            <RichMarkdown components={mdComponents}>
                              {editMarkdown.trim() ? editMarkdown : ' '}
                            </RichMarkdown>
                          </div>
                        </aside>
                      </>
                    ) : null}
                  </div>
                ) : editMarkdown.trim() ? (
                  <div className="article-detail-markdown-read">
                    <div className="document-detail-print-header" aria-hidden>
                      <h1 className="document-detail-print-title">{article.name}</h1>
                      {article.origin_article_id ? (
                        <p className="document-detail-print-subtitle">{article.origin_article_id}</p>
                      ) : null}
                    </div>
                    <RichMarkdown components={mdComponents}>
                      {editMarkdown}
                    </RichMarkdown>
                  </div>
                ) : (
                  <p className="document-detail-muted">No content yet. Choose Edit to add Markdown.</p>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
    </ContentCommentsShell>
  );
}
