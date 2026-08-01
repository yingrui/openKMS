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
import ReactMarkdown from 'react-markdown';
import {
  richMarkdownRehypePlugins,
  richMarkdownRemarkPlugins,
} from '../../components/markdown/richMarkdown';
import { ContentCommentsShell } from '../../components/comments/ContentCommentsShell';
import { PanelToolbar } from '../../styles/design-system';
import { ArticleAttachmentsPanel, ArticleRelationshipsPanel, ArticleReviewPanel } from './ArticleDetail.modals';
import { useArticleDetail } from './useArticleDetail';
import '../../styles/document-detail.scss';
import './ArticleDetail.scss';

const MARKDOWN_SPLIT_GUTTER_PX = 6;

export function ArticleDetail() {
  const v = useArticleDetail();

  return (
    <ContentCommentsShell resourceType="article" resourceId={v.id ?? ''} enabled={Boolean(v.id)}>
    <div className="document-detail article-detail-page">
      <Link to={v.backTo} className="document-detail-back">
        <ArrowLeft size={18} />
        <span>Back to Articles</span>
      </Link>
      {v.error ? (
        <div className="document-detail-error">{v.error}</div>
      ) : !v.article ? (
        <div className="document-detail-loading">Loading…</div>
      ) : (
        <>
          <section className={`document-detail-info document-detail-info-combined ${v.infoVisible ? '' : 'document-detail-info--collapsed'}`}>
            <h2
              className="document-detail-info-title document-detail-info-toggle"
              onClick={() => v.setInfoVisible((x) => !x)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && v.setInfoVisible((x) => !x)}
              aria-expanded={v.infoVisible}
            >
              <Info size={20} />
              <span>Article information</span>
              <button
                type="button"
                className="document-detail-info-toggle-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  v.setInfoVisible((x) => !x);
                }}
                aria-label={v.infoVisible ? 'Hide' : 'Show'}
              >
                {v.infoVisible ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            </h2>
            {v.infoVisible && (
              <div className="document-detail-info-body">
                <dl className="document-detail-info-list document-detail-info-list--name-row">
                  <div className="document-detail-info-item document-detail-info-item--name">
                    <dt>Title</dt>
                    <dd>
                      {v.titleEditMode ? (
                        <div className="article-detail-inline-edit">
                          <input
                            type="text"
                            className="document-detail-info-input article-detail-inline-edit-input"
                            value={v.editName}
                            onChange={(e) => v.setEditName(e.target.value)}
                            aria-label="Article title"
                            placeholder="Title"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && v.editName.trim()) void v.handleSaveTitle();
                              if (e.key === 'Escape') v.handleCancelTitleEdit();
                            }}
                          />
                          <div className="article-detail-inline-edit-actions">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => void v.handleSaveTitle()}
                              disabled={v.savingTitle || !v.editName.trim()}
                            >
                              {v.savingTitle ? <Loader2 size={12} className="doc-detail-spinner" /> : null}
                              <span>{v.savingTitle ? 'Saving…' : 'Save'}</span>
                            </button>
                            <button
                              type="button"
                              className="document-detail-info-cancel-btn"
                              onClick={v.handleCancelTitleEdit}
                              disabled={v.savingTitle}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="document-detail-info-value">
                          {v.editName}
                          <button
                            type="button"
                            className="document-detail-info-edit-btn"
                            onClick={() => v.setTitleEditMode(true)}
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
                        <dd>{v.channelLabel}</dd>
                      </div>
                      <div className="document-detail-info-item document-detail-info-item--compact">
                        <dt>Source</dt>
                        <dd className="article-detail-source-dd">
                          {v.sourceEditMode ? (
                            <div className="article-detail-inline-edit">
                              <input
                                type="text"
                                className="document-detail-info-input article-detail-inline-edit-input"
                                value={v.editSourceRef}
                                onChange={(e) => v.setEditSourceRef(e.target.value)}
                                aria-label="Source ID or URL"
                                placeholder="External ID or URL"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') void v.handleSaveSource();
                                  if (e.key === 'Escape') v.handleCancelSourceEdit();
                                }}
                              />
                              <div className="article-detail-inline-edit-actions">
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => void v.handleSaveSource()}
                                  disabled={v.savingSource}
                                >
                                  {v.savingSource ? <Loader2 size={12} className="doc-detail-spinner" /> : null}
                                  <span>{v.savingSource ? 'Saving…' : 'Save'}</span>
                                </button>
                                <button
                                  type="button"
                                  className="document-detail-info-cancel-btn"
                                  onClick={v.handleCancelSourceEdit}
                                  disabled={v.savingSource}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="document-detail-info-value">
                              {v.article.origin_article_id?.trim() ? (
                                /^https?:\/\//i.test(v.article.origin_article_id.trim()) ? (
                                  <a href={v.article.origin_article_id.trim()} target="_blank" rel="noopener noreferrer">
                                    {v.article.origin_article_id.trim()}
                                  </a>
                                ) : (
                                  <span title={v.article.origin_article_id}>{v.article.origin_article_id}</span>
                                )
                              ) : (
                                <span className="document-detail-muted">—</span>
                              )}
                              <button
                                type="button"
                                className="document-detail-info-edit-btn"
                                onClick={() => v.setSourceEditMode(true)}
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
                        <dd>{v.article.lifecycle_status ?? '—'}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="document-detail-info-stats-col">
                    <dl className="document-detail-info-list document-detail-info-list--col">
                      <div className="document-detail-info-item document-detail-info-item--compact">
                        <dt>Applicable</dt>
                        <dd>{v.article.is_current_for_rag ? 'Yes' : 'No'}</dd>
                      </div>
                      <div className="document-detail-info-item document-detail-info-item--compact">
                        <dt>Updated</dt>
                        <dd>{new Date(v.article.updated_at).toLocaleString()}</dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <ArticleRelationshipsPanel
                  relSectionOpen={v.relSectionOpen}
                  onToggle={() => v.setRelSectionOpen((o) => !o)}
                  lineageLoading={v.lineageLoading}
                  lineageRels={v.lineageRels}
                  onDeleteRelationship={(relationshipId) => void v.handleDeleteRelationship(relationshipId)}
                  newRelTarget={v.newRelTarget}
                  onNewRelTargetChange={v.setNewRelTarget}
                  newRelType={v.newRelType}
                  onNewRelTypeChange={v.setNewRelType}
                  newRelNote={v.newRelNote}
                  onNewRelNoteChange={v.setNewRelNote}
                  relSaving={v.relSaving}
                  onAddRelationship={() => void v.handleAddRelationship()}
                />

                <ArticleReviewPanel
                  reviewSectionOpen={v.reviewSectionOpen}
                  onToggle={() => v.setReviewSectionOpen((o) => !o)}
                  latestReview={v.latestReview}
                  reviewLoading={v.reviewLoading}
                  reviewRunning={v.reviewRunning}
                  channelReviewConfigured={v.channelReviewConfigured}
                  channelId={v.article.channel_id}
                  onRunReview={() => void v.handleRunReview()}
                />

                <ArticleAttachmentsPanel
                  attachmentsSectionOpen={v.attachmentsSectionOpen}
                  onToggle={() => v.setAttachmentsSectionOpen((o) => !o)}
                  attachments={v.attachments}
                  articleId={v.article.id}
                  markdownEditMode={v.markdownEditMode}
                  onInsertAttachmentRef={v.insertAttachmentRef}
                  onDeleteAttachment={(att) => void v.handleDeleteAttachment(att)}
                />

                <div className="document-detail-metadata-actions article-detail-danger-zone">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm article-detail-delete-btn"
                    onClick={() => void v.handleDelete()}
                    disabled={v.deleting}
                  >
                    {v.deleting ? <Loader2 size={12} className="doc-detail-spinner" /> : <Trash2 size={14} />}
                    <span>{v.deleting ? 'Deleting…' : 'Delete article'}</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          <div className="document-detail-split article-detail-markdown-split">
            <section
              ref={v.markdownSectionRef}
              className={`document-detail-panel document-detail-markdown${v.markdownEditMode ? ' article-detail-markdown-panel--editing' : ''}`}
            >
              <PanelToolbar
                leading={
                  <>
                    <FileText size={16} />
                    <span>Markdown</span>
                  </>
                }
                actions={
                  v.markdownEditMode ? (
                    <>
                      <button
                        type="button"
                        className="document-detail-edit-toggle"
                        onClick={() => v.setMarkdownPreviewOpen((val) => !val)}
                        title={v.markdownPreviewOpen ? 'Hide preview' : 'Show preview on the right'}
                        aria-label={v.markdownPreviewOpen ? 'Hide preview' : 'Show preview on the right'}
                      >
                        {v.markdownPreviewOpen ? <EyeOff size={14} /> : <Eye size={14} />}
                        <span className="ds-compact-label">{v.markdownPreviewOpen ? 'Hide preview' : 'Preview'}</span>
                      </button>
                      <button
                        type="button"
                        className="document-detail-edit-toggle"
                        onClick={() => v.imageInputRef.current?.click()}
                        disabled={v.uploadingMedia}
                        title="Insert image"
                        aria-label="Insert image"
                      >
                        {v.uploadingMedia ? <Loader2 size={14} className="doc-detail-spinner" /> : <ImageIcon size={14} />}
                        <span className="ds-compact-label">Image</span>
                      </button>
                      <button
                        type="button"
                        className="document-detail-edit-toggle"
                        onClick={() => v.attachmentInputRef.current?.click()}
                        disabled={v.uploadingMedia}
                        title="Add attachment"
                        aria-label="Add attachment"
                      >
                        <Paperclip size={14} />
                        <span className="ds-compact-label">Attachment</span>
                      </button>
                      <button
                        type="button"
                        className="document-detail-edit-toggle document-detail-save-btn"
                        onClick={() => void v.handleSaveMarkdown()}
                        disabled={v.savingMarkdown}
                        title="Save content"
                        aria-label="Save content"
                      >
                        {v.savingMarkdown ? (
                          <Loader2 size={14} className="doc-detail-spinner" aria-hidden />
                        ) : (
                          <Save size={14} aria-hidden />
                        )}
                        <span className="ds-compact-label">{v.savingMarkdown ? 'Saving…' : 'Save'}</span>
                      </button>
                      <button
                        type="button"
                        className="document-detail-edit-toggle"
                        onClick={v.handleCancelMarkdownEdit}
                        disabled={v.savingMarkdown}
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
                        onClick={() => v.setMarkdownEditMode(true)}
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
                className={`document-detail-markdown-body${v.markdownEditMode ? ' article-detail-markdown-body--edit' : ''}`}
              >
                {v.markdownEditMode ? (
                  <div
                    ref={v.markdownSplitLayoutRef}
                    className={`article-detail-markdown-edit-layout${v.markdownPreviewOpen && v.id ? ' article-detail-markdown-edit-layout--split' : ''}`}
                    style={
                      v.markdownPreviewOpen && v.id
                        ? {
                            gridTemplateColumns: `${v.markdownSplitEditorFr}fr ${MARKDOWN_SPLIT_GUTTER_PX}px ${100 - v.markdownSplitEditorFr}fr`,
                          }
                        : undefined
                    }
                  >
                    <div
                      className={`article-detail-editor-dropzone article-detail-markdown-edit-editor${v.dragActive ? ' article-detail-editor-dropzone--active' : ''}`}
                      onDragOver={(e) => {
                        if (e.dataTransfer?.types?.includes('Files')) {
                          e.preventDefault();
                          v.setDragActive(true);
                        }
                      }}
                      onDragLeave={() => v.setDragActive(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        void v.handleEditorDrop(e as unknown as React.DragEvent<HTMLTextAreaElement>);
                      }}
                    >
                      <textarea
                        ref={v.textareaRef}
                        className="article-detail-markdown-textarea"
                        aria-label="Article body in Markdown"
                        placeholder="Write Markdown here. Paste or drop an image to upload, or use the toolbar."
                        value={v.editMarkdown}
                        onChange={(e) => v.setEditMarkdown(e.target.value)}
                        onPaste={(e) => void v.handleEditorPaste(e)}
                      />
                      {v.dragActive && (
                        <div className="article-detail-editor-dropzone-overlay" aria-hidden>
                          <Upload size={28} />
                          <span>Drop to upload — images embed inline, others become attachments</span>
                        </div>
                      )}
                      <input
                        ref={v.imageInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="openkms-hidden"
                        onChange={(e) => void v.handleImagePick(e)}
                      />
                      <input
                        ref={v.attachmentInputRef}
                        type="file"
                        multiple
                        className="openkms-hidden"
                        onChange={(e) => void v.handleAttachmentPick(e)}
                      />
                    </div>
                    {v.markdownPreviewOpen && v.id ? (
                      <>
                        <div
                          className="article-detail-markdown-splitter"
                          role="separator"
                          aria-orientation="vertical"
                          aria-label="Resize editor and preview"
                          onPointerDown={v.handleMarkdownSplitPointerDown}
                        />
                        <aside className="article-detail-markdown-preview-pane" aria-label="Markdown preview">
                          <div className="article-detail-markdown-preview-scroll article-detail-markdown-read">
                            <ReactMarkdown
                              remarkPlugins={richMarkdownRemarkPlugins}
                              rehypePlugins={richMarkdownRehypePlugins}
                              components={v.mdComponents}
                            >
                              {v.editMarkdown.trim() ? v.editMarkdown : ' '}
                            </ReactMarkdown>
                          </div>
                        </aside>
                      </>
                    ) : null}
                  </div>
                ) : v.editMarkdown.trim() ? (
                  <div className="article-detail-markdown-read">
                    <div className="document-detail-print-header" aria-hidden>
                      <h1 className="document-detail-print-title">{v.article.name}</h1>
                      {v.article.origin_article_id ? (
                        <p className="document-detail-print-subtitle">{v.article.origin_article_id}</p>
                      ) : null}
                    </div>
                    <ReactMarkdown
                      remarkPlugins={richMarkdownRemarkPlugins}
                      rehypePlugins={richMarkdownRehypePlugins}
                      components={v.mdComponents}
                    >
                      {v.editMarkdown}
                    </ReactMarkdown>
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
