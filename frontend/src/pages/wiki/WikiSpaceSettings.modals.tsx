import type { ChangeEvent, InputHTMLAttributes } from 'react';
import type { TFunction } from 'i18next';
import type { VaultImportProgress, VaultImportSkipOptions } from '../../data/wikiSpacesApi';

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
      {docPickerOpen && spaceId && (
        <div
          className="wiki-space-settings-modal-overlay"
          role="presentation"
          onClick={onCloseDocPicker}
        >
          <div
            className="wiki-space-settings-modal wiki-space-settings-doc-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wiki-doc-picker-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h3 id="wiki-doc-picker-title">{t('docPickerTitle')}</h3>
            <p className="wiki-space-settings-muted wiki-space-settings-doc-picker-hint">{t('docPickerHint')}</p>
            <div className="wiki-space-settings-doc-picker-filters">
              <label className="wiki-space-settings-doc-picker-label">
                {t('channel')}
                <select
                  className="wiki-space-settings-doc-picker-select"
                  value={docChannelFilter}
                  onChange={(e) => onDocChannelFilterChange(e.target.value)}
                >
                  <option value="">{t('channelFilterAll')}</option>
                  {channelOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wiki-space-settings-doc-picker-label wiki-space-settings-doc-picker-label--grow">
                {t('searchByName')}
                <input
                  type="search"
                  className="wiki-space-settings-doc-picker-input"
                  value={docSearch}
                  onChange={(e) => onDocSearchChange(e.target.value)}
                  placeholder={t('filterPlaceholder')}
                />
              </label>
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
            <div className="wiki-space-settings-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onCloseDocPicker}>
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {vaultFolderModalOpen && (
        <div
          className="wiki-space-settings-modal-overlay wiki-space-settings-vault-options-overlay"
          role="presentation"
          onClick={onCancelVaultFolderModal}
        >
          <div
            className="wiki-space-settings-modal wiki-space-settings-vault-options"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vault-import-options-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h3 id="vault-import-options-title">{t('vaultModalTitle')}</h3>
            <p className="wiki-space-settings-vault-options-hint">{t('vaultModalHint')}</p>
            <ul className="wiki-space-settings-vault-options-list">
              <li>
                <label className="wiki-space-settings-vault-options-row">
                  <input
                    type="checkbox"
                    checked={vaultSkipOpts.skipPdf}
                    onChange={(ev) => onVaultSkipOptsChange({ ...vaultSkipOpts, skipPdf: ev.target.checked })}
                  />
                  <span>{t('skipPdf')}</span>
                </label>
              </li>
              <li>
                <label className="wiki-space-settings-vault-options-row">
                  <input
                    type="checkbox"
                    checked={vaultSkipOpts.skipDocx}
                    onChange={(ev) => onVaultSkipOptsChange({ ...vaultSkipOpts, skipDocx: ev.target.checked })}
                  />
                  <span>{t('skipDocx')}</span>
                </label>
              </li>
              <li>
                <label className="wiki-space-settings-vault-options-row">
                  <input
                    type="checkbox"
                    checked={vaultSkipOpts.skipDoc}
                    onChange={(ev) => onVaultSkipOptsChange({ ...vaultSkipOpts, skipDoc: ev.target.checked })}
                  />
                  <span>{t('skipDoc')}</span>
                </label>
              </li>
              <li>
                <label className="wiki-space-settings-vault-options-row">
                  <input
                    type="checkbox"
                    checked={vaultSkipOpts.skipPptx}
                    onChange={(ev) => onVaultSkipOptsChange({ ...vaultSkipOpts, skipPptx: ev.target.checked })}
                  />
                  <span>{t('skipPptx')}</span>
                </label>
              </li>
              <li>
                <label className="wiki-space-settings-vault-options-row">
                  <input
                    type="checkbox"
                    checked={vaultSkipOpts.skipPpt}
                    onChange={(ev) => onVaultSkipOptsChange({ ...vaultSkipOpts, skipPpt: ev.target.checked })}
                  />
                  <span>{t('skipPpt')}</span>
                </label>
              </li>
            </ul>
            <div className="wiki-space-settings-modal-actions wiki-space-settings-vault-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onCancelVaultFolderModal}>
                {t('cancel')}
              </button>
              <label className="btn btn-primary wiki-space-settings-import-label wiki-space-settings-modal-folder-label">
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
            </div>
          </div>
        </div>
      )}

      {vaultImporting && (
        <div className="wiki-space-settings-import-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="wiki-space-settings-import-dialog">
            <h3 className="wiki-space-settings-import-title">{t('importingTitle')}</h3>
            <p className="wiki-space-settings-import-phase">
              {progressDisplay.phase === 'binary' ? t('phaseUploadBinary') : t('phaseImportMd')}
            </p>
            <p className="wiki-space-settings-import-path" title={progressDisplay.path}>
              {progressDisplay.path}
            </p>
            <div className="wiki-space-settings-import-bar wiki-space-settings-import-bar--overall">
              <div
                className="wiki-space-settings-import-bar-fill"
                style={{ width: `${importOverallPercent}%` }}
              />
            </div>
            <p className="wiki-space-settings-import-count">
              {progressDisplay.currentIndex > 0
                ? t('fileProgress', {
                    current: progressDisplay.currentIndex,
                    total: progressDisplay.total,
                  })
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
                        width: `${Math.min(100, Math.round(((progressDisplay.fileLoaded ?? 0) / progressDisplay.fileTotal) * 100))}%`,
                      }}
                    />
                  </div>
                </>
              )}
          </div>
        </div>
      )}

      {showNewPage && (
        <div className="wiki-space-settings-modal-overlay" role="presentation" onClick={onCloseNewPage}>
          <div
            className="wiki-space-settings-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{t('newPageModalTitle')}</h3>
            <label>
              {t('pathRequired')} <span className="wiki-space-settings-req">*</span>
              <input
                type="text"
                value={newPath}
                onChange={(e) => onNewPathChange(e.target.value)}
                placeholder={t('pathPlaceholder')}
              />
            </label>
            <div className="wiki-space-settings-modal-actions">
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}
