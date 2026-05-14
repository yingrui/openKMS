import { useTranslation } from 'react-i18next';
import { Loader2, X as XIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import {
  richMarkdownRemarkPlugins,
  richMarkdownRehypePlugins,
} from '../components/markdown/richMarkdown';
import type { DocumentVersionDetail, DocumentVersionListItem } from '../data/documentsApi';

export interface DocumentDetailVersionModalsProps {
  saveVersionModalOpen: boolean;
  saveVersionTag: string;
  saveVersionSubmitting: boolean;
  onSaveVersionTagChange: (value: string) => void;
  onCloseSaveVersion: () => void;
  onCreateVersion: () => void;

  versionsModalOpen: boolean;
  versionsLoading: boolean;
  versionsItems: DocumentVersionListItem[];
  restoreSubmitting: boolean;
  onCloseVersions: () => void;
  onPreviewVersion: (versionId: string) => void;
  onOpenRestore: (version: DocumentVersionListItem) => void;

  versionPreview: DocumentVersionDetail | null;
  versionPreviewLoading: boolean;
  onCloseVersionPreview: () => void;
  markdownComponents: Components;

  restoreModalVersion: DocumentVersionListItem | null;
  restoreSaveCurrent: boolean;
  restoreLabel: string;
  restoreNote: string;
  onCloseRestore: () => void;
  onRestoreSaveCurrentChange: (checked: boolean) => void;
  onRestoreLabelChange: (value: string) => void;
  onRestoreNoteChange: (value: string) => void;
  onConfirmRestore: () => void;
}

export function DocumentDetailVersionModals({
  saveVersionModalOpen,
  saveVersionTag,
  saveVersionSubmitting,
  onSaveVersionTagChange,
  onCloseSaveVersion,
  onCreateVersion,
  versionsModalOpen,
  versionsLoading,
  versionsItems,
  restoreSubmitting,
  onCloseVersions,
  onPreviewVersion,
  onOpenRestore,
  versionPreview,
  versionPreviewLoading,
  onCloseVersionPreview,
  markdownComponents,
  restoreModalVersion,
  restoreSaveCurrent,
  restoreLabel,
  restoreNote,
  onCloseRestore,
  onRestoreSaveCurrentChange,
  onRestoreLabelChange,
  onRestoreNoteChange,
  onConfirmRestore,
}: DocumentDetailVersionModalsProps) {
  const { t } = useTranslation('documents');

  return (
    <>
      {saveVersionModalOpen && (
        <div
          className="document-detail-pageindex-dialog-overlay"
          onClick={() => !saveVersionSubmitting && onCloseSaveVersion()}
        >
          <div
            className="document-detail-pageindex-dialog document-detail-save-version-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="save-version-title"
          >
            <div className="document-detail-pageindex-dialog-header">
              <h2 id="save-version-title">{t('detail.saveVersionModalTitle')}</h2>
              <button
                type="button"
                className="document-detail-pageindex-dialog-close"
                onClick={() => !saveVersionSubmitting && onCloseSaveVersion()}
                aria-label={t('common.close')}
              >
                <XIcon size={18} />
              </button>
            </div>
            <div className="document-detail-save-version-body">
              <p className="document-detail-save-version-hint">
                {t('detail.saveVersionHint')}
              </p>
              <div className="document-detail-save-version-field">
                <label htmlFor="save-version-tag" className="document-detail-save-version-label">
                  {t('detail.saveVersionTagLabel')} <span className="document-detail-save-version-optional">{t('detail.optionalParen')}</span>
                </label>
                <input
                  id="save-version-tag"
                  type="text"
                  className="document-detail-save-version-input"
                  value={saveVersionTag}
                  onChange={(e) => onSaveVersionTagChange(e.target.value)}
                  placeholder={t('detail.placeholderVersionTag')}
                  autoComplete="off"
                  disabled={saveVersionSubmitting}
                />
              </div>
              <div className="document-detail-save-version-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onCreateVersion}
                  disabled={saveVersionSubmitting}
                >
                  {saveVersionSubmitting ? <Loader2 size={14} className="doc-detail-spinner" /> : null}
                  <span>{saveVersionSubmitting ? t('detail.savingInfo') : t('detail.createVersionSubmit')}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary document-detail-save-version-cancel"
                  onClick={() => !saveVersionSubmitting && onCloseSaveVersion()}
                  disabled={saveVersionSubmitting}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {versionsModalOpen && (
        <div
          className="document-detail-pageindex-dialog-overlay"
          onClick={() => !restoreSubmitting && onCloseVersions()}
        >
          <div
            className="document-detail-pageindex-dialog document-detail-versions-dialog document-detail-versions-dialog--wide"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="versions-list-title"
          >
            <div className="document-detail-pageindex-dialog-header">
              <h2 id="versions-list-title">{t('detail.versionsModalTitle')}</h2>
              <button
                type="button"
                className="document-detail-pageindex-dialog-close"
                onClick={() => !restoreSubmitting && onCloseVersions()}
                aria-label={t('common.close')}
              >
                <XIcon size={18} />
              </button>
            </div>
            <div className="document-detail-pageindex-dialog-body">
              {versionsLoading ? (
                <div className="document-detail-pageindex-loading">
                  <Loader2 size={20} className="doc-detail-spinner" />
                  <span>{t('common.loading')}</span>
                </div>
              ) : versionsItems.length === 0 ? (
                <p className="document-detail-muted">{t('detail.noVersionsYet')}</p>
              ) : (
                <table className="document-detail-versions-table">
                  <thead>
                    <tr>
                      <th scope="col">{t('detail.colVersion')}</th>
                      <th scope="col">{t('detail.colTag')}</th>
                      <th scope="col">{t('detail.colSaved')}</th>
                      <th scope="col" className="document-detail-versions-th-actions">
                        {t('detail.colActions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {versionsItems.map((v) => (
                      <tr key={v.id}>
                        <td>
                          <span className="document-detail-versions-vno">v{v.version_number}</span>
                        </td>
                        <td>
                          {v.tag ? (
                            <span className="document-detail-versions-tag">{v.tag}</span>
                          ) : (
                            <span className="document-detail-versions-empty">—</span>
                          )}
                        </td>
                        <td>
                          <time
                            className="document-detail-versions-date"
                            dateTime={v.created_at}
                          >
                            {new Date(v.created_at).toLocaleString()}
                          </time>
                        </td>
                        <td className="document-detail-versions-td-actions">
                          <div className="document-detail-versions-actions">
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => onPreviewVersion(v.id)}
                            >
                              {t('detail.previewVersion')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => onOpenRestore(v)}
                            >
                              {t('detail.restoreVersionBtn')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
      {versionPreview && (
        <div
          className="document-detail-pageindex-dialog-overlay"
          onClick={() => onCloseVersionPreview()}
        >
          <div
            className="document-detail-pageindex-dialog document-detail-versions-dialog document-detail-versions-dialog--wide"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div className="document-detail-pageindex-dialog-header">
              <h2 id="version-preview-title">
                v{versionPreview.version_number}
                {versionPreview.tag ? ` — ${versionPreview.tag}` : ''}
              </h2>
              <button
                type="button"
                className="document-detail-pageindex-dialog-close"
                onClick={() => onCloseVersionPreview()}
                aria-label={t('common.close')}
              >
                <XIcon size={18} />
              </button>
            </div>
            <div className="document-detail-pageindex-dialog-body document-detail-version-preview-body">
              {versionPreviewLoading ? (
                <Loader2 className="doc-detail-spinner" />
              ) : (
                <>
                  <h3 className="document-detail-version-preview-sub">{t('detail.previewMarkdownSub')}</h3>
                  <div className="document-detail-version-preview-md">
                    <ReactMarkdown
                      remarkPlugins={richMarkdownRemarkPlugins}
                      rehypePlugins={richMarkdownRehypePlugins}
                      components={markdownComponents}
                    >
                      {versionPreview.markdown || ''}
                    </ReactMarkdown>
                  </div>
                  <h3 className="document-detail-version-preview-sub">{t('detail.previewMetadataSub')}</h3>
                  <pre className="document-detail-version-preview-json">
                    {JSON.stringify(versionPreview.metadata ?? {}, null, 2)}
                  </pre>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {restoreModalVersion && (
        <div
          className="document-detail-pageindex-dialog-overlay"
          onClick={() => !restoreSubmitting && onCloseRestore()}
        >
          <div
            className="document-detail-pageindex-dialog document-detail-versions-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="restore-version-title"
          >
            <div className="document-detail-pageindex-dialog-header">
              <h2 id="restore-version-title">{t('detail.restoreConfirmTitle', { n: restoreModalVersion.version_number })}</h2>
              <button
                type="button"
                className="document-detail-pageindex-dialog-close"
                onClick={() => !restoreSubmitting && onCloseRestore()}
                aria-label={t('common.close')}
              >
                <XIcon size={18} />
              </button>
            </div>
            <div className="document-detail-pageindex-dialog-body document-detail-versions-form">
              <p className="document-detail-muted" style={{ marginTop: 0 }}>
                {t('detail.restoreReplacesHint')}
              </p>
              <label className="document-detail-versions-check">
                <input
                  type="checkbox"
                  checked={restoreSaveCurrent}
                  onChange={(e) => onRestoreSaveCurrentChange(e.target.checked)}
                />
                {t('detail.restoreSaveCurrentFirst')}
              </label>
              {restoreSaveCurrent && (
                <>
                  <label className="document-detail-versions-label">
                    {t('detail.restoreLabelOptional')}
                    <input
                      type="text"
                      className="document-detail-info-input"
                      value={restoreLabel}
                      onChange={(e) => onRestoreLabelChange(e.target.value)}
                      placeholder={t('detail.placeholderCheckpoint')}
                    />
                  </label>
                  <label className="document-detail-versions-label">
                    {t('detail.restoreNoteOptional')}
                    <textarea
                      className="document-detail-markdown-textarea"
                      rows={2}
                      value={restoreNote}
                      onChange={(e) => onRestoreNoteChange(e.target.value)}
                      style={{ minHeight: 56 }}
                    />
                  </label>
                </>
              )}
              <div className="document-detail-metadata-edit-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={onConfirmRestore}
                  disabled={restoreSubmitting}
                >
                  {restoreSubmitting ? <Loader2 size={12} className="doc-detail-spinner" /> : null}
                  <span>{restoreSubmitting ? t('common.restoring') : t('detail.restoreVersionBtn')}</span>
                </button>
                <button
                  type="button"
                  className="document-detail-metadata-cancel-btn"
                  onClick={() => !restoreSubmitting && onCloseRestore()}
                  disabled={restoreSubmitting}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
