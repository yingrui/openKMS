import type { ChangeEvent, InputHTMLAttributes } from 'react';
import type { TFunction } from 'i18next';
import type { VaultImportProgress, VaultImportSkipOptions } from '../../data/wikiSpacesApi';
import { Dialog, FormField } from '../../styles/design-system';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export interface WikiSpaceSettingsModalsProps {
  t: TFunction;
  spaceId: string | undefined;

  docPickerOpen: boolean;
  docSearch: string;
  onDocSearchChange: (value: string) => void;
  docChannelFilter: string;
  onDocChannelFilterChange: (value: string) => void;
  channelOptions: { id: string; label: string }[];
  docPickerLoading: boolean;
  docPickerItems: Array<{ id: string; name: string; channel_id: string }>;
  linkedDocIds: Set<string>;
  onCloseDocPicker: () => void;
  onLinkDoc: (docId: string) => void;

  vaultFolderModalOpen: boolean;
  vaultSkipOpts: VaultImportSkipOptions;
  onVaultSkipOptsChange: (opts: VaultImportSkipOptions) => void;
  vaultImporting: boolean;
  onCancelVaultFolderModal: () => void;
  onVaultFolderChange: (e: ChangeEvent<HTMLInputElement>) => void;

  progressDisplay: VaultImportProgress;
  importOverallPercent: number;

  showNewPage: boolean;
  newPath: string;
  onNewPathChange: (value: string) => void;
  saving: boolean;
  onCloseNewPage: () => void;
  onCreatePage: () => void;
}

export function WikiSpaceSettingsModals({
  t,
  docPickerOpen,
  spaceId,
  docSearch,
  onDocSearchChange,
  docChannelFilter,
  onDocChannelFilterChange,
  channelOptions,
  docPickerLoading,
  docPickerItems,
  linkedDocIds,
  onCloseDocPicker,
  onLinkDoc,
  vaultFolderModalOpen,
  vaultSkipOpts,
  onVaultSkipOptsChange,
  vaultImporting,
  onCancelVaultFolderModal,
  onVaultFolderChange,
  progressDisplay,
  importOverallPercent,
  showNewPage,
  newPath,
  onNewPathChange,
  saving,
  onCloseNewPage,
  onCreatePage,
}: WikiSpaceSettingsModalsProps) {
  return (
    <>
      <Dialog
        open={docPickerOpen && Boolean(spaceId)}
        onClose={onCloseDocPicker}
        title={t('docPickerTitle')}
        closeAriaLabel={t('common.close')}
        size="lg"
        footer={
          <button type="button" className="btn btn-secondary" onClick={onCloseDocPicker}>
            {t('close')}
          </button>
        }
      >
        <p className="wiki-space-settings-muted">{t('docPickerHint')}</p>
        <div className="wiki-space-settings-doc-picker-filters">
          <FormField label={t('channel')} className="wiki-space-settings-doc-picker-label">
            <select value={docChannelFilter} onChange={(e) => onDocChannelFilterChange(e.target.value)}>
              <option value="">{t('channelFilterAll')}</option>
              {channelOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label={t('searchByName')}
            className="wiki-space-settings-doc-picker-label wiki-space-settings-doc-picker-label--grow"
          >
            <input
              type="search"
              value={docSearch}
              onChange={(e) => onDocSearchChange(e.target.value)}
              placeholder={t('filterPlaceholder')}
            />
          </FormField>
        </div>
        <div className="wiki-space-settings-doc-picker-list" role="listbox" aria-label={t('docResultsAria')}>
          {docPickerLoading ? (
            <p className="wiki-space-settings-muted">{t('docPickerLoading')}</p>
          ) : docPickerItems.length === 0 ? (
            <p className="wiki-space-settings-muted">{t('noDocumentsMatch')}</p>
          ) : (
            <ul className="wiki-space-settings-doc-picker-ul">
              {docPickerItems.map((d) => {
                const already = linkedDocIds.has(d.id);
                return (
                  <li key={d.id} className="wiki-space-settings-doc-picker-row">
                    <span className="wiki-space-settings-doc-picker-name" title={d.name}>
                      {d.name}
                    </span>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={already}
                      onClick={() => onLinkDoc(d.id)}
                    >
                      {already ? t('alreadyLinked') : t('linkAction')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Dialog>

      <Dialog
        open={vaultFolderModalOpen}
        onClose={onCancelVaultFolderModal}
        title={t('vaultModalTitle')}
        closeAriaLabel={t('common.close')}
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={onCancelVaultFolderModal}>
              {t('cancel')}
            </button>
            <label className="btn btn-primary wiki-space-settings-import-label">
              <input
                type="file"
                className="wiki-space-settings-file-input-overlay"
                {...({ webkitdirectory: '', directory: '' } as InputHTMLAttributes<HTMLInputElement>)}
                multiple
                disabled={vaultImporting}
                onChange={onVaultFolderChange}
              />
              {t('chooseVaultFolder')}
            </label>
          </>
        }
      >
        <p className="wiki-space-settings-muted">{t('vaultModalHint')}</p>
        <ul className="wiki-space-settings-vault-options-list">
          {([
            ['skipPdf', vaultSkipOpts.skipPdf],
            ['skipDocx', vaultSkipOpts.skipDocx],
            ['skipDoc', vaultSkipOpts.skipDoc],
            ['skipPptx', vaultSkipOpts.skipPptx],
            ['skipPpt', vaultSkipOpts.skipPpt],
          ] as const).map(([key, checked]) => (
            <li key={key}>
              <label className="wiki-space-settings-vault-options-row">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(ev) => onVaultSkipOptsChange({ ...vaultSkipOpts, [key]: ev.target.checked })}
                />
                <span>{t(key)}</span>
              </label>
            </li>
          ))}
        </ul>
      </Dialog>

      <Dialog
        open={vaultImporting}
        onClose={() => undefined}
        closeDisabled
        hideCloseButton
        title={t('importingTitle')}
        size="md"
      >
        <p className="wiki-space-settings-import-phase" aria-live="polite" aria-busy>
          {progressDisplay.phase === 'binary' ? t('phaseUploadBinary') : t('phaseImportMd')}
        </p>
        <p className="wiki-space-settings-import-path" title={progressDisplay.path}>
          {progressDisplay.path}
        </p>
        <div className="wiki-space-settings-import-bar wiki-space-settings-import-bar--overall">
          <div className="wiki-space-settings-import-bar-fill" style={{ width: `${importOverallPercent}%` }} />
        </div>
        <p className="wiki-space-settings-import-count">
          {progressDisplay.currentIndex > 0
            ? t('fileProgress', { current: progressDisplay.currentIndex, total: progressDisplay.total })
            : t('starting')}
        </p>
        {progressDisplay.phase === 'binary' &&
          progressDisplay.fileTotal != null &&
          progressDisplay.fileTotal > 0 && (
            <>
              <p className="wiki-space-settings-import-bytes">
                {formatBytes(progressDisplay.fileLoaded ?? 0)} / {formatBytes(progressDisplay.fileTotal)}
              </p>
              <div className="wiki-space-settings-import-bar">
                <div
                  className="wiki-space-settings-import-bar-fill"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(((progressDisplay.fileLoaded ?? 0) / progressDisplay.fileTotal) * 100),
                    )}%`,
                  }}
                />
              </div>
            </>
          )}
      </Dialog>

      <Dialog
        open={showNewPage}
        onClose={onCloseNewPage}
        title={t('newPageModalTitle')}
        closeAriaLabel={t('common.close')}
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={onCloseNewPage}>
              {t('cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || !newPath.trim()}
              onClick={onCreatePage}
            >
              {t('create')}
            </button>
          </>
        }
      >
        <FormField label={`${t('pathRequired')} *`}>
          <input
            type="text"
            value={newPath}
            onChange={(e) => onNewPathChange(e.target.value)}
            placeholder={t('pathPlaceholder')}
          />
        </FormField>
      </Dialog>
    </>
  );
}
