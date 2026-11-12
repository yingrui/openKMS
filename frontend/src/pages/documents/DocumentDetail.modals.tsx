import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { Components } from 'react-markdown';
import {
  RichMarkdown,
} from '../../components/markdown/richMarkdown';
import type { DocumentVersionDetail, DocumentVersionListItem } from '../../data/documentsApi';
import { Dialog, FormField } from '../../styles/design-system';

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
      <Dialog
        open={saveVersionModalOpen}
        onClose={onCloseSaveVersion}
        closeDisabled={saveVersionSubmitting}
        title={t('detail.saveVersionModalTitle')}
        closeAriaLabel={t('common.close')}
        size="md"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCloseSaveVersion}
              disabled={saveVersionSubmitting}
            >
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn-primary" onClick={onCreateVersion} disabled={saveVersionSubmitting}>
              {saveVersionSubmitting ? <Loader2 size={14} className="doc-detail-spinner" /> : null}
              <span>{saveVersionSubmitting ? t('detail.savingInfo') : t('detail.createVersionSubmit')}</span>
            </button>
          </>
        }
      >
        <p className="document-detail-muted">{t('detail.saveVersionHint')}</p>
        <FormField label={`${t('detail.saveVersionTagLabel')} ${t('detail.optionalParen')}`}>
          <input
            type="text"
            value={saveVersionTag}
            onChange={(e) => onSaveVersionTagChange(e.target.value)}
            placeholder={t('detail.placeholderVersionTag')}
            autoComplete="off"
            disabled={saveVersionSubmitting}
          />
        </FormField>
      </Dialog>

      <Dialog
        open={versionsModalOpen}
        onClose={onCloseVersions}
        closeDisabled={restoreSubmitting}
        title={t('detail.versionsModalTitle')}
        closeAriaLabel={t('common.close')}
        size="lg"
      >
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
                    <time className="document-detail-versions-date" dateTime={v.created_at}>
                      {new Date(v.created_at).toLocaleString()}
                    </time>
                  </td>
                  <td className="document-detail-versions-td-actions">
                    <div className="document-detail-versions-actions">
                      <button type="button" className="btn btn-sm" onClick={() => onPreviewVersion(v.id)}>
                        {t('detail.previewVersion')}
                      </button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpenRestore(v)}>
                        {t('detail.restoreVersionBtn')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Dialog>

      <Dialog
        open={versionPreview != null}
        onClose={onCloseVersionPreview}
        title={
          versionPreview
            ? `v${versionPreview.version_number}${versionPreview.tag ? ` — ${versionPreview.tag}` : ''}`
            : ''
        }
        closeAriaLabel={t('common.close')}
        size="lg"
        bodyClassName="document-detail-version-preview-body"
      >
        {versionPreviewLoading ? (
          <Loader2 className="doc-detail-spinner" />
        ) : versionPreview ? (
          <>
            <h3 className="document-detail-version-preview-sub">{t('detail.previewMarkdownSub')}</h3>
            <div className="document-detail-version-preview-md">
              <RichMarkdown components={markdownComponents}>{versionPreview.markdown || ''}</RichMarkdown>
            </div>
            <h3 className="document-detail-version-preview-sub">{t('detail.previewMetadataSub')}</h3>
            <pre className="document-detail-version-preview-json">
              {JSON.stringify(versionPreview.metadata ?? {}, null, 2)}
            </pre>
          </>
        ) : null}
      </Dialog>

      <Dialog
        open={restoreModalVersion != null}
        onClose={onCloseRestore}
        closeDisabled={restoreSubmitting}
        title={
          restoreModalVersion
            ? t('detail.restoreConfirmTitle', { n: restoreModalVersion.version_number })
            : ''
        }
        closeAriaLabel={t('common.close')}
        size="md"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCloseRestore}
              disabled={restoreSubmitting}
            >
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn-primary" onClick={onConfirmRestore} disabled={restoreSubmitting}>
              {restoreSubmitting ? <Loader2 size={12} className="doc-detail-spinner" /> : null}
              <span>{restoreSubmitting ? t('common.restoring') : t('detail.restoreVersionBtn')}</span>
            </button>
          </>
        }
      >
        <p className="document-detail-muted">{t('detail.restoreReplacesHint')}</p>
        <label className="document-detail-versions-check">
          <input
            type="checkbox"
            checked={restoreSaveCurrent}
            onChange={(e) => onRestoreSaveCurrentChange(e.target.checked)}
          />
          {t('detail.restoreSaveCurrentFirst')}
        </label>
        {restoreSaveCurrent ? (
          <>
            <FormField label={t('detail.restoreLabelOptional')}>
              <input
                type="text"
                value={restoreLabel}
                onChange={(e) => onRestoreLabelChange(e.target.value)}
                placeholder={t('detail.placeholderCheckpoint')}
              />
            </FormField>
            <FormField label={t('detail.restoreNoteOptional')}>
              <textarea
                className="openkms-min-h-14"
                rows={2}
                value={restoreNote}
                onChange={(e) => onRestoreNoteChange(e.target.value)}
              />
            </FormField>
          </>
        ) : null}
      </Dialog>
    </>
  );
}
