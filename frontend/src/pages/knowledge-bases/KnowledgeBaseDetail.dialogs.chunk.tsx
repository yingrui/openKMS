import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChunkResponse } from '../../data/knowledgeBasesApi';

export interface KbChunkDialogProps {
  show: boolean;
  editChunk: ChunkResponse | null;
  onClose: () => void;
  chunkSaving: boolean;
  chunkContent: string;
  onChunkContentChange: (value: string) => void;
  chunkDialogReadOnly: boolean;
  metadataKeys: string[] | null | undefined;
  chunkMetadataIsArray: Record<string, boolean>;
  chunkDocMetadataValues: Record<string, string>;
  onChunkDocMetadataValuesChange: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  onSaveChunk: () => void;
}

export function KbChunkDialog({
  show,
  editChunk,
  onClose,
  chunkSaving,
  chunkContent,
  onChunkContentChange,
  chunkDialogReadOnly,
  metadataKeys,
  chunkMetadataIsArray,
  chunkDocMetadataValues,
  onChunkDocMetadataValuesChange,
  onSaveChunk,
}: KbChunkDialogProps) {
  const { t } = useTranslation('knowledgeBase');
  if (!show || !editChunk) return null;

  return (
    <div
      className="kb-doc-picker-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="chunk-dialog-title"
    >
      <div className="kb-doc-picker kb-faq-dialog kb-chunk-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="kb-doc-picker-header">
          <h2 id="chunk-dialog-title">{t('detail.chunkDialogTitle')}</h2>
          <button
            type="button"
            className="kb-doc-picker-close"
            onClick={onClose}
            disabled={chunkSaving}
            aria-label={t('detail.closeAria')}
          >
            <X size={20} />
          </button>
        </div>
        <div className="kb-faq-dialog-form">
          <label>
            <span>{t('detail.chunkSource')}</span>
            <input
              type="text"
              value={editChunk.document_name || editChunk.document_id || editChunk.wiki_page_id || ''}
              readOnly
              disabled
              className="kb-chunk-dialog-readonly"
            />
          </label>
          <label>
            <span>{t('detail.chunkContent')}</span>
            <textarea
              value={chunkContent}
              onChange={(e) => onChunkContentChange(e.target.value)}
              rows={8}
              readOnly={chunkDialogReadOnly}
            />
          </label>

          {metadataKeys && metadataKeys.length > 0 && (
            <div className="kb-kv-editor">
              <span className="kb-kv-editor-label">{t('detail.metadata')}</span>
              <small className="kb-kv-editor-hint">
                {Object.values(chunkMetadataIsArray).some(Boolean) ? t('detail.kvHintArray') : t('detail.kvHintSingle')}
              </small>
              {metadataKeys.map((key) => (
                <div key={key} className="kb-kv-row kb-kv-row-config">
                  <span className="kb-kv-key-label">{key}{chunkMetadataIsArray[key] ? t('detail.arraySuffix') : ''}</span>
                  <input
                    type="text"
                    placeholder={chunkMetadataIsArray[key] ? t('detail.placeholderValueArray', { key }) : t('detail.placeholderValueSingle', { key })}
                    value={chunkDocMetadataValues[key] ?? ''}
                    onChange={(e) => onChunkDocMetadataValuesChange((prev) => ({ ...prev, [key]: e.target.value }))}
                    disabled={chunkDialogReadOnly}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="kb-doc-picker-footer">
            <div />
            <div className="kb-doc-picker-actions">
              {chunkDialogReadOnly ? (
                <button type="button" className="btn btn-primary" onClick={onClose}>
                  {t('detail.chunkDialogClose')}
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-secondary" onClick={onClose} disabled={chunkSaving}>
                    {t('detail.cancel')}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={onSaveChunk} disabled={chunkSaving || !chunkContent.trim()}>
                    {chunkSaving ? t('detail.saving') : t('detail.update')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
