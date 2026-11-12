import { FileText, FolderInput, Loader2, Upload, X } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { RefObject } from 'react';
import { isAcceptedFile, type DocumentListItemResponse } from '../../data/documentsApi';
import { Dialog, FormField } from '../../styles/design-system';

interface ChannelOption {
  id: string;
  name: string;
  depth: number;
}

export interface DocumentChannelModalsProps {
  t: TFunction;

  showUploadModal: boolean;
  uploading: boolean;
  uploadError: string | null;
  selectedFiles: File[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  onCloseUploadModal: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
  onAddDroppedFiles: (files: File[]) => void;
  onUploadSubmit: () => void;

  moveModalDocIds: string[] | null;
  moveModalDocs: DocumentListItemResponse[];
  moveTargetChannelId: string;
  moveLoading: boolean;
  channelOptions: ChannelOption[];
  onCloseMoveModal: () => void;
  onMoveTargetChannelChange: (channelId: string) => void;
  onMoveConfirm: () => void;
}

export function DocumentChannelModals({
  t,
  showUploadModal,
  uploading,
  uploadError,
  selectedFiles,
  fileInputRef,
  onCloseUploadModal,
  onFileChange,
  onRemoveFile,
  onAddDroppedFiles,
  onUploadSubmit,
  moveModalDocIds,
  moveModalDocs,
  moveTargetChannelId,
  moveLoading,
  channelOptions,
  onCloseMoveModal,
  onMoveTargetChannelChange,
  onMoveConfirm,
}: DocumentChannelModalsProps) {
  return (
    <>
      <Dialog
        open={showUploadModal}
        onClose={onCloseUploadModal}
        closeDisabled={uploading}
        title={t('channel.uploadModalTitle')}
        closeAriaLabel={t('common.close')}
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={onCloseUploadModal} disabled={uploading}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onUploadSubmit}
              disabled={selectedFiles.length === 0 || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 size={18} className="channel-page-modal-spinner" />
                  <span>{t('common.uploading')}</span>
                </>
              ) : (
                <>
                  <Upload size={18} />
                  <span>{t('common.upload')}</span>
                </>
              )}
            </button>
          </>
        }
      >
        <p className="document-detail-muted">{t('channel.uploadModalHint')}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.pptx,.xlsx,.epub,.xmind,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/epub+zip,application/vnd.xmind.workbook"
          multiple
          className="documents-upload-input"
          onChange={onFileChange}
          aria-hidden
          tabIndex={-1}
        />
        <div
          className="documents-upload-dropzone"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.classList.add('documents-upload-dropzone-drag');
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('documents-upload-dropzone-drag');
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('documents-upload-dropzone-drag');
            const files = Array.from(e.dataTransfer.files).filter((f) => isAcceptedFile(f));
            onAddDroppedFiles(files);
          }}
        >
          <Upload size={32} />
          <span>{t('channel.dropzone')}</span>
        </div>
        {uploadError && <p className="documents-upload-error">{uploadError}</p>}
        {selectedFiles.length > 0 && (
          <div className="documents-upload-filelist">
            {selectedFiles.map((file, i) => (
              <div key={`${file.name}-${i}`} className="documents-upload-file">
                <FileText size={18} />
                <span>{file.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveFile(i)}
                  disabled={uploading}
                  aria-label={`${t('common.close')} ${file.name}`}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Dialog>

      <Dialog
        open={moveModalDocIds != null && moveModalDocIds.length > 0}
        onClose={onCloseMoveModal}
        closeDisabled={moveLoading}
        title={
          moveModalDocIds && moveModalDocIds.length > 1
            ? t('channel.moveModalTitleBulk')
            : t('channel.moveModalTitle')
        }
        closeAriaLabel={t('common.close')}
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={onCloseMoveModal} disabled={moveLoading}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onMoveConfirm}
              disabled={
                moveLoading ||
                !moveTargetChannelId ||
                moveModalDocs.every((d) => d.channel_id === moveTargetChannelId)
              }
            >
              {moveLoading ? (
                <>
                  <Loader2 size={18} className="channel-page-modal-spinner" />
                  <span>{t('common.moving')}</span>
                </>
              ) : (
                <>
                  <FolderInput size={18} />
                  <span>{t('common.move')}</span>
                </>
              )}
            </button>
          </>
        }
      >
        <p className="document-detail-muted">
          {moveModalDocIds && moveModalDocIds.length > 1
            ? t('channel.moveModalHintBulk', { count: moveModalDocIds.length })
            : t('channel.moveModalHint', { name: moveModalDocs[0]?.name ?? '' })}
        </p>
        <FormField label={t('common.targetChannel')}>
          <select value={moveTargetChannelId} onChange={(e) => onMoveTargetChannelChange(e.target.value)}>
            {channelOptions.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {'—'.repeat(ch.depth)} {ch.name}
              </option>
            ))}
          </select>
        </FormField>
      </Dialog>
    </>
  );
}
