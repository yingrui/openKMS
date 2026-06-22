import type { ReactNode } from 'react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  Download,
  Edit3,
  GitBranch,
  History,
  Info,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  X as XIcon,
} from 'lucide-react';
import {
  DOCUMENT_LIFECYCLE_STATUSES,
  DOCUMENT_RELATION_TYPES,
  type DocumentRelationshipsResponse,
  type DocumentResponse,
} from '../../data/documentsApi';
import type { ExtractionSchemaDisplayField, LabelConfigItem } from '../../data/channelUtils';
import type { ExampleDocumentConfig } from './DocumentDetail.types';

type LabelInstance = {
  id: string;
  data: Record<string, unknown>;
};

interface DocumentDetailInfoPanelProps {
  document: DocumentResponse;
  docConfig: ExampleDocumentConfig | null;
  infoVisible: boolean;
  showMetadataSection: boolean;
  infoEditMode: boolean;
  editName: string;
  savingInfo: boolean;
  fileHash: string;
  markdown: string | null;
  processing: boolean;
  processBlockedByMissingPipeline: boolean;
  forceFullReparse: boolean;
  resetting: boolean;
  exporting: boolean;
  importing: boolean;
  versionSnapshotLoading: boolean;
  latestVersionSnapshot: { created_at: string; version_number: number } | null;
  showSaveVersionButton: boolean;
  metaKeys: string[];
  extractionSchemaFields: ExtractionSchemaDisplayField[];
  labelConfig: LabelConfigItem[];
  metadataEditMode: boolean;
  editMeta: Record<string, unknown>;
  savingMetadata: boolean;
  extractWarnings: string[];
  extracting: boolean;
  hasExtractionModel: boolean;
  meta: Record<string, unknown>;
  labelKeysSet: Set<string>;
  labelInstances: Record<string, LabelInstance[]>;
  lineageSectionOpen: boolean;
  lineageLoading: boolean;
  lineageRels: DocumentRelationshipsResponse | null;
  lifecycleEdit: boolean;
  editSeriesId: string;
  editLifecycleStatus: string;
  editEffectiveFrom: string;
  editEffectiveTo: string;
  lifecycleSaving: boolean;
  newRelTarget: string;
  newRelType: string;
  newRelNote: string;
  relSaving: boolean;
  onToggleInfo: () => void;
  onEditNameChange: (value: string) => void;
  onSaveInfo: () => void;
  onCancelInfoEdit: () => void;
  onEnterInfoEdit: () => void;
  onProcess: () => void;
  onForceFullReparseChange: (checked: boolean) => void;
  onReset: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onOpenVersionsModal: () => void;
  onOpenSaveVersion: () => void;
  onEnterMetadataEdit: () => void;
  onSetEditMetaField: (key: string, value: unknown) => void;
  onSaveMetadata: () => void;
  onCancelMetadataEdit: () => void;
  onExtract: () => void;
  getInstanceDisplay: (otid: string, instance: LabelInstance) => string;
  onToggleLineageSection: () => void;
  onSetLifecycleEdit: (value: boolean) => void;
  onSaveLifecycle: () => void | Promise<void>;
  onSetEditLifecycleStatus: (value: string) => void;
  onSetEditSeriesId: (value: string) => void;
  onSetEditEffectiveFrom: (value: string) => void;
  onSetEditEffectiveTo: (value: string) => void;
  onSetNewRelType: (value: string) => void;
  onSetNewRelTarget: (value: string) => void;
  onSetNewRelNote: (value: string) => void;
  onAddRelationship: () => void;
  onDeleteRelationship: (relationshipId: string) => void;
}

function renderMetadataValue(value: unknown, renderArray: (items: unknown[]) => ReactNode): ReactNode {
  if (value == null) return '—';
  if (Array.isArray(value)) return renderArray(value);
  return String(value);
}

export function DocumentDetailInfoPanel({
  document,
  docConfig,
  infoVisible,
  showMetadataSection,
  infoEditMode,
  editName,
  savingInfo,
  fileHash,
  markdown,
  processing,
  processBlockedByMissingPipeline,
  forceFullReparse,
  resetting,
  exporting,
  importing,
  versionSnapshotLoading,
  latestVersionSnapshot,
  showSaveVersionButton,
  metaKeys,
  extractionSchemaFields,
  labelConfig,
  metadataEditMode,
  editMeta,
  savingMetadata,
  extractWarnings,
  extracting,
  hasExtractionModel,
  meta,
  labelKeysSet,
  labelInstances,
  lineageSectionOpen,
  lineageLoading,
  lineageRels,
  lifecycleEdit,
  editSeriesId,
  editLifecycleStatus,
  editEffectiveFrom,
  editEffectiveTo,
  lifecycleSaving,
  newRelTarget,
  newRelType,
  newRelNote,
  relSaving,
  onToggleInfo,
  onEditNameChange,
  onSaveInfo,
  onCancelInfoEdit,
  onEnterInfoEdit,
  onProcess,
  onForceFullReparseChange,
  onReset,
  onExport,
  onImport,
  onOpenVersionsModal,
  onOpenSaveVersion,
  onEnterMetadataEdit,
  onSetEditMetaField,
  onSaveMetadata,
  onCancelMetadataEdit,
  onExtract,
  getInstanceDisplay,
  onToggleLineageSection,
  onSetLifecycleEdit,
  onSaveLifecycle,
  onSetEditLifecycleStatus,
  onSetEditSeriesId,
  onSetEditEffectiveFrom,
  onSetEditEffectiveTo,
  onSetNewRelType,
  onSetNewRelTarget,
  onSetNewRelNote,
  onAddRelationship,
  onDeleteRelationship,
}: DocumentDetailInfoPanelProps) {
  const { t } = useTranslation('documents');
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <section className={`document-detail-info document-detail-info-combined ${infoVisible ? '' : 'document-detail-info--collapsed'}`}>
      <h2
        className="document-detail-info-title document-detail-info-toggle"
        onClick={onToggleInfo}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onToggleInfo()}
        aria-expanded={infoVisible}
      >
        <Info size={20} />
        <span>{showMetadataSection ? t('detail.infoTitleMetadata') : t('detail.infoTitle')}</span>
        <button
          type="button"
          className="document-detail-info-toggle-btn"
          onClick={(e) => {
            e.stopPropagation();
            onToggleInfo();
          }}
          aria-label={infoVisible ? t('common.hide') : t('common.show')}
        >
          {infoVisible ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </h2>
      {infoVisible && (
        <div className="document-detail-info-body">
          <dl className="document-detail-info-list document-detail-info-list--name-row">
            <div className="document-detail-info-item document-detail-info-item--name">
              <dt>{t('detail.fieldName')}</dt>
              <dd>
                {infoEditMode && !docConfig ? (
                  <div className="document-detail-info-edit-row">
                    <input
                      type="text"
                      className="document-detail-info-input"
                      value={editName}
                      onChange={(e) => onEditNameChange(e.target.value)}
                      aria-label={t('detail.ariaDocumentName')}
                    />
                    <div className="document-detail-info-edit-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={onSaveInfo}
                        disabled={savingInfo || !editName.trim()}
                      >
                        {savingInfo ? <Loader2 size={12} className="doc-detail-spinner" /> : null}
                        <span>{savingInfo ? t('detail.savingInfo') : t('detail.saveInfo')}</span>
                      </button>
                      <button
                        type="button"
                        className="document-detail-info-cancel-btn"
                        onClick={onCancelInfoEdit}
                        disabled={savingInfo}
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <span className="document-detail-info-value">
                    {document.name}
                    {!docConfig && (
                      <button
                        type="button"
                        className="document-detail-info-edit-btn"
                        onClick={onEnterInfoEdit}
                        title={t('detail.editDocInfoTitle')}
                        aria-label={t('detail.ariaEdit')}
                      >
                        <Edit3 size={12} />
                      </button>
                    )}
                  </span>
                )}
              </dd>
              {!docConfig && !infoEditMode && (
                <div className="document-detail-info-name-row-actions">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        onImport(file);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="document-detail-info-name-row-btn"
                    onClick={onExport}
                    disabled={exporting || !fileHash}
                    title={t('detail.exportParsingTitle')}
                  >
                    {exporting ? <Loader2 size={14} className="doc-detail-spinner" /> : <Download size={14} />}
                  </button>
                  <button
                    type="button"
                    className="document-detail-info-name-row-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing || !fileHash}
                    title={t('detail.importParsingTitle')}
                  >
                    {importing ? <Loader2 size={14} className="doc-detail-spinner" /> : <Upload size={14} />}
                  </button>
                </div>
              )}
            </div>
          </dl>
          <div className="document-detail-info-stats-grid">
            <div className="document-detail-info-stats-col">
              <dl className="document-detail-info-list document-detail-info-list--col">
                <div className="document-detail-info-item document-detail-info-item--compact">
                  <dt>{t('detail.fieldType')}</dt>
                  <dd>{document.file_type}</dd>
                </div>
                <div className="document-detail-info-item document-detail-info-item--compact">
                  <dt>{t('detail.fieldSize')}</dt>
                  <dd>{document.size_bytes ? `${(document.size_bytes / 1024).toFixed(1)} KB` : '—'}</dd>
                </div>
                <div className="document-detail-info-item document-detail-info-item--compact">
                  <dt>{t('detail.fieldUploaded')}</dt>
                  <dd>{document.created_at ? new Date(document.created_at).toLocaleString() : '—'}</dd>
                </div>
              </dl>
            </div>
            <div className="document-detail-info-stats-col">
              <dl className="document-detail-info-list document-detail-info-list--col">
                <div className="document-detail-info-item document-detail-info-item--compact">
                  <dt>{t('detail.fieldStatus')}</dt>
                  <dd>
                    <span className={`doc-status doc-status-${document.status || 'completed'}`}>
                      {document.status || 'completed'}
                    </span>
                    {(document.status === 'uploaded' || document.status === 'failed') &&
                      (processBlockedByMissingPipeline ? (
                        <span className="document-detail-process-wrap" title={t('detail.processNoPipeline')}>
                          <button
                            type="button"
                            className="document-detail-process-btn"
                            disabled
                            aria-label={t('detail.processNoPipeline')}
                          >
                            <Play size={14} />
                            <span>{t('detail.process')}</span>
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="document-detail-process-btn"
                          onClick={onProcess}
                          disabled={processing}
                          title={t('detail.titleProcessDoc')}
                        >
                          {processing ? <Loader2 size={14} className="doc-detail-spinner" /> : <Play size={14} />}
                          <span>{processing ? t('detail.processing') : t('detail.process')}</span>
                        </button>
                      ))}
                    {(document.status === 'uploaded' || document.status === 'failed') &&
                      !['XLSX', 'XMIND'].includes(document.file_type.toUpperCase()) && (
                        <label className="document-detail-force-reparse">
                          <input
                            type="checkbox"
                            checked={forceFullReparse}
                            onChange={(e) => onForceFullReparseChange(e.target.checked)}
                            disabled={processing}
                          />
                          <span title={t('detail.forceFullReparseTitle')}>{t('detail.forceFullReparse')}</span>
                        </label>
                      )}
                    {(document.status === 'pending' ||
                      document.status === 'failed' ||
                      document.status === 'completed' ||
                      document.status === 'running') && (
                      <button
                        type="button"
                        className="document-detail-reset-btn"
                        onClick={onReset}
                        disabled={resetting}
                        title={t('detail.titleResetStatus')}
                      >
                        {resetting ? <Loader2 size={14} className="doc-detail-spinner" /> : <RotateCcw size={14} />}
                        <span>{resetting ? t('detail.resetting') : t('detail.reset')}</span>
                      </button>
                    )}
                  </dd>
                </div>
                <div className="document-detail-info-item document-detail-info-item--compact">
                  <dt>{t('detail.fieldMarkdown')}</dt>
                  <dd>{markdown ? t('detail.markdownYes') : t('detail.markdownNo')}</dd>
                </div>
                {fileHash ? (
                  <div className="document-detail-info-item document-detail-info-item--compact">
                    <dt>{t('detail.fieldFileHash')}</dt>
                    <dd className="document-detail-info-hash" title={fileHash}>
                      {fileHash.length > 12 ? `${fileHash.slice(0, 10)}...` : fileHash}
                    </dd>
                  </div>
                ) : (
                  <div className="document-detail-info-item document-detail-info-item--compact">
                    <dt>{t('detail.fieldFileHash')}</dt>
                    <dd>—</dd>
                  </div>
                )}
              </dl>
            </div>
            <div className="document-detail-info-stats-col document-detail-info-stats-col--version">
              <div className="document-detail-version-panel">
                <div className="document-detail-version-panel-label">{t('detail.fieldVersion')}</div>
                <div className="document-detail-version-panel-body">
                  <div className="document-detail-version-panel-status">
                    {docConfig ? (
                      '—'
                    ) : versionSnapshotLoading ? (
                      <span className="document-detail-muted">{t('common.loading')}</span>
                    ) : latestVersionSnapshot ? (
                      <span className="document-detail-info-version-text">
                        v{latestVersionSnapshot.version_number}
                        <span className="document-detail-info-version-sep"> · </span>
                        {new Date(latestVersionSnapshot.created_at).toLocaleString()}
                      </span>
                    ) : (
                      <span className="document-detail-muted" title={t('detail.noVersionYetTitle')}>
                        {t('detail.noVersionYet')}
                      </span>
                    )}
                  </div>
                  {!docConfig && (
                    <div className="document-detail-version-panel-actions">
                      <button
                        type="button"
                        className="document-detail-version-panel-btn document-detail-version-panel-btn--ghost"
                        onClick={onOpenVersionsModal}
                        title={t('detail.versionsBtnTitle')}
                      >
                        <History size={14} />
                        <span>{t('detail.versionsBtn')}</span>
                      </button>
                      {showSaveVersionButton && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm document-detail-version-panel-btn--primary"
                          onClick={onOpenSaveVersion}
                          title={t('detail.saveVersionBtnTitle')}
                        >
                          <Bookmark size={14} />
                          <span>{t('detail.saveVersionBtn')}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          {showMetadataSection && (
            <>
              <hr className="document-detail-info-divider" />
              <div className="document-detail-metadata-body">
                <h3 className="document-detail-metadata-subtitle">
                  <Sparkles size={16} />
                  {t('detail.metadataHeading')}
                  {(metaKeys.length > 0 || extractionSchemaFields.length > 0 || labelConfig.length > 0) && !metadataEditMode ? (
                    <button
                      type="button"
                      className="document-detail-metadata-edit-btn"
                      onClick={onEnterMetadataEdit}
                      title={t('detail.editMetadataTitle')}
                      aria-label={t('detail.ariaEditMetadata')}
                    >
                      <Edit3 size={12} />
                      <span>{t('common.edit')}</span>
                    </button>
                  ) : null}
                </h3>
                {metaKeys.length === 0 && !metadataEditMode ? (
                  <p className="document-detail-metadata-empty">
                    {t('detail.noMetadata')}
                    {!hasExtractionModel && t('detail.noMetadataExtractionHint')}
                  </p>
                ) : metadataEditMode ? (
                  <div className="document-detail-metadata-edit">
                    <dl className="document-detail-info-list document-detail-metadata-list">
                      {metaKeys.map((key) => {
                        const field = extractionSchemaFields.find((f) => f.key === key);
                        const lc = labelConfig.find((l) => l.key === key);
                        const label = field?.label ?? lc?.display_label ?? lc?.key ?? key;
                        const fieldType = field?.type ?? (lc ? (lc.type === 'list[object_type]' ? 'list[object_type]' : 'object_type') : 'string');
                        const val = editMeta[key];
                        const strVal = val == null ? '' : Array.isArray(val) ? (val as unknown[]).join(', ') : String(val);
                        return (
                          <div key={key} className="document-detail-info-item document-detail-info-item--edit">
                            <dt>{label}</dt>
                            <dd>
                              {fieldType === 'date' ? (
                                <input
                                  type="date"
                                  className="document-detail-metadata-input"
                                  value={typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val) ? (val as string).slice(0, 10) : ''}
                                  onChange={(e) => onSetEditMetaField(key, e.target.value || null)}
                                  aria-label={label}
                                />
                              ) : fieldType === 'array' ? (
                                <input
                                  type="text"
                                  className="document-detail-metadata-input"
                                  value={Array.isArray(val) ? (val as unknown[]).join(', ') : (val ? String(val) : '')}
                                  onChange={(e) => {
                                    const s = e.target.value.trim();
                                    onSetEditMetaField(key, s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);
                                  }}
                                  placeholder={t('detail.placeholderCommaList')}
                                  aria-label={label}
                                />
                              ) : fieldType === 'enum' && field?.enum && field.enum.length > 0 ? (
                                <select
                                  className="document-detail-metadata-input"
                                  value={val != null ? String(val) : ''}
                                  onChange={(e) => onSetEditMetaField(key, e.target.value || null)}
                                  aria-label={label}
                                >
                                  <option value="">—</option>
                                  {field.enum.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                              ) : fieldType === 'integer' ? (
                                <input
                                  type="number"
                                  step={1}
                                  className="document-detail-metadata-input"
                                  value={val == null || val === '' ? '' : (typeof val === 'number' ? val : parseInt(String(val), 10) || '')}
                                  onChange={(e) => {
                                    const s = e.target.value;
                                    const n = parseInt(s, 10);
                                    onSetEditMetaField(key, s === '' || Number.isNaN(n) ? null : n);
                                  }}
                                  placeholder={t('detail.placeholderInteger')}
                                  aria-label={label}
                                />
                              ) : fieldType === 'number' ? (
                                <input
                                  type="number"
                                  step="any"
                                  className="document-detail-metadata-input"
                                  value={val == null || val === '' ? '' : (typeof val === 'number' ? val : parseFloat(String(val)) ?? '')}
                                  onChange={(e) => {
                                    const s = e.target.value;
                                    const n = parseFloat(s);
                                    onSetEditMetaField(key, s === '' || Number.isNaN(n) ? null : n);
                                  }}
                                  placeholder={t('detail.placeholderNumber')}
                                  aria-label={label}
                                />
                              ) : fieldType === 'boolean' ? (
                                <select
                                  className="document-detail-metadata-input"
                                  value={val === true ? 'true' : val === false ? 'false' : ''}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    onSetEditMetaField(key, v === '' ? null : v === 'true');
                                  }}
                                  aria-label={label}
                                >
                                  <option value="">—</option>
                                  <option value="true">true</option>
                                  <option value="false">false</option>
                                </select>
                              ) : fieldType === 'object_type' || fieldType === 'list[object_type]' ? (
                                (() => {
                                  const otid = field?.object_type_id ?? lc?.object_type_id ?? '';
                                  const instances = labelInstances[otid] ?? [];
                                  const currentVal = val;
                                  const isMulti = fieldType === 'list[object_type]';
                                  return isMulti ? (
                                    <div className="document-detail-labels-multi">
                                      <select
                                        className="document-detail-metadata-input"
                                        value=""
                                        onChange={(e) => {
                                          const pk = e.target.value;
                                          if (!pk) return;
                                          const arr = Array.isArray(currentVal) ? [...currentVal] : currentVal ? [currentVal] : [];
                                          if (!arr.includes(pk)) {
                                            onSetEditMetaField(key, [...arr, pk]);
                                          }
                                          e.target.value = '';
                                        }}
                                        aria-label={t('detail.metaAddAria', { label })}
                                      >
                                        <option value="">{t('detail.metaAddOption')}</option>
                                        {instances.map((inst) => (
                                          <option key={inst.id} value={inst.id}>
                                            {getInstanceDisplay(otid, inst)}
                                          </option>
                                        ))}
                                      </select>
                                      <div className="document-detail-labels-pills">
                                        {(Array.isArray(currentVal) ? currentVal : currentVal ? [currentVal] : []).map((pk: string) => {
                                          const inst = instances.find((i) => i.id === pk);
                                          const display = inst ? getInstanceDisplay(otid, inst) : pk;
                                          return (
                                            <span key={pk} className="document-detail-metadata-pill document-detail-labels-pill">
                                              {display}
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const arr = Array.isArray(currentVal) ? currentVal.filter((x: string) => x !== pk) : [];
                                                  onSetEditMetaField(key, arr);
                                                }}
                                                aria-label={t('detail.metaRemoveAria', { label: display })}
                                              >
                                                <XIcon size={12} />
                                              </button>
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : (
                                    <select
                                      className="document-detail-metadata-input"
                                      value={typeof currentVal === 'string' ? currentVal : Array.isArray(currentVal) ? currentVal[0] ?? '' : ''}
                                      onChange={(e) => onSetEditMetaField(key, e.target.value || null)}
                                      aria-label={label}
                                    >
                                      <option value="">—</option>
                                      {instances.map((inst) => (
                                        <option key={inst.id} value={inst.id}>
                                          {getInstanceDisplay(otid, inst)}
                                        </option>
                                      ))}
                                    </select>
                                  );
                                })()
                              ) : (
                                <input
                                  type="text"
                                  className="document-detail-metadata-input"
                                  value={strVal}
                                  onChange={(e) => onSetEditMetaField(key, e.target.value || null)}
                                  aria-label={label}
                                />
                              )}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                    <div className="document-detail-metadata-edit-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={onSaveMetadata}
                        disabled={savingMetadata}
                      >
                        {savingMetadata ? <Loader2 size={12} className="doc-detail-spinner" /> : null}
                        <span>{savingMetadata ? t('detail.savingInfo') : t('detail.saveInfo')}</span>
                      </button>
                      <button
                        type="button"
                        className="document-detail-metadata-cancel-btn"
                        onClick={onCancelMetadataEdit}
                        disabled={savingMetadata}
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <dl className="document-detail-info-list document-detail-metadata-list">
                    {metaKeys.map((key) => {
                      const field = extractionSchemaFields.find((f) => f.key === key);
                      const lc = labelConfig.find((l) => l.key === key);
                      const label = field?.label ?? lc?.display_label ?? lc?.key ?? key;
                      const val = meta[key];
                      const isLabelKey = labelKeysSet.has(key);
                      const otid = field?.object_type_id ?? lc?.object_type_id ?? '';
                      const instances = labelInstances[otid] ?? [];
                      const formatVal = (v: unknown) => {
                        if (isLabelKey && typeof v === 'string') {
                          const inst = instances.find((i) => i.id === v);
                          return inst ? getInstanceDisplay(otid, inst) : v;
                        }
                        return String(v);
                      };
                      return (
                        <div key={key} className="document-detail-info-item">
                          <dt>{label}</dt>
                          <dd>
                            {renderMetadataValue(val, (items) => (
                              <span className="document-detail-metadata-pills">
                                {items.map((v, i) => (
                                  <span key={i} className="document-detail-metadata-pill">
                                    {formatVal(v)}
                                  </span>
                                ))}
                              </span>
                            ))}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                )}
                {extractWarnings.length > 0 && (
                  <div className="document-detail-extract-warnings">
                    {extractWarnings.map((w, i) => (
                      <p key={i} className="document-detail-warning">
                        {w}
                      </p>
                    ))}
                  </div>
                )}
                <div className="document-detail-metadata-actions">
                  {!metadataEditMode && (
                    <button
                      type="button"
                      className="btn btn-primary document-detail-extract-btn"
                      onClick={onExtract}
                      disabled={
                        extracting ||
                        !markdown ||
                        document.status !== 'completed' ||
                        !hasExtractionModel
                      }
                      title={
                        !hasExtractionModel
                          ? t('detail.hintExtractionModel')
                          : !markdown
                            ? t('detail.hintNoMarkdown')
                            : document.status !== 'completed'
                              ? t('detail.hintMustParse')
                              : t('detail.hintExtract')
                      }
                    >
                      {extracting ? (
                        <Loader2 size={14} className="doc-detail-spinner" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      <span>{extracting ? t('detail.extracting') : t('detail.extract')}</span>
                    </button>
                  )}
                </div>

                <hr className="document-detail-info-divider document-detail-metadata-lineage-divider" />
                <div className="document-detail-lineage document-detail-lineage--in-metadata">
                  <button
                    type="button"
                    className="document-detail-lineage-header"
                    onClick={onToggleLineageSection}
                    aria-expanded={lineageSectionOpen}
                    aria-controls="document-lineage-panel"
                    id="document-lineage-heading"
                  >
                    <GitBranch size={16} aria-hidden />
                    <span>{t('detail.lineageTitle')}</span>
                    {lineageSectionOpen ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
                  </button>
                  {!lineageSectionOpen && (
                    <p className="document-detail-lineage-hint document-detail-muted">
                      {t('detail.lineageCollapsedHint')}
                    </p>
                  )}
                  {lineageSectionOpen && (
                    <div
                      id="document-lineage-panel"
                      className="document-detail-lineage-panel"
                      role="region"
                      aria-labelledby="document-lineage-heading"
                    >
                      <p className="document-detail-lineage-intro document-detail-muted">
                        {t('detail.lineageIntro')}
                      </p>

                      <div className="document-detail-lineage-lifecycle-card">
                        <div className="document-detail-lineage-lifecycle-toolbar">
                          <span className="document-detail-lineage-lifecycle-toolbar-label">{t('detail.lifecycleToolbar')}</span>
                          <div className="document-detail-lineage-lifecycle-toolbar-actions">
                            {lifecycleEdit ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => void onSaveLifecycle()}
                                  disabled={lifecycleSaving}
                                >
                                  {lifecycleSaving ? <Loader2 size={12} className="doc-detail-spinner" /> : null}
                                  {lifecycleSaving ? t('detail.savingInfo') : t('detail.saveInfo')}
                                </button>
                                <button
                                  type="button"
                                  className="document-detail-metadata-cancel-btn"
                                  onClick={() => onSetLifecycleEdit(false)}
                                  disabled={lifecycleSaving}
                                >
                                  {t('common.cancel')}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="document-detail-metadata-edit-btn"
                                onClick={() => onSetLifecycleEdit(true)}
                              >
                                <Edit3 size={12} />
                                {t('common.edit')}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="document-detail-lineage-field-grid">
                          <div className="document-detail-lineage-field">
                            <span className="document-detail-lineage-field-label">{t('detail.fieldApplicable')}</span>
                            <div>
                              {document.is_current_for_rag === false ? (
                                <span className="document-detail-lineage-pill document-detail-lineage-pill--off">
                                  {t('detail.notApplicable')}
                                </span>
                              ) : (
                                <span className="document-detail-lineage-pill document-detail-lineage-pill--on">
                                  {t('detail.applicableYes')}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="document-detail-lineage-field">
                            <span className="document-detail-lineage-field-label">{t('detail.lifecycleStatusLabel')}</span>
                            <div className="document-detail-lineage-field-value">
                              {lifecycleEdit ? (
                                <select
                                  className="document-detail-info-input document-detail-lineage-input"
                                  value={editLifecycleStatus}
                                  onChange={(e) => onSetEditLifecycleStatus(e.target.value)}
                                  aria-label={t('detail.lifecycleStatusLabel')}
                                >
                                  <option value="">{t('detail.lifecycleUnset')}</option>
                                  {DOCUMENT_LIFECYCLE_STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span>{document.lifecycle_status ?? '—'}</span>
                              )}
                            </div>
                          </div>
                          <div className="document-detail-lineage-field document-detail-lineage-field--full">
                            <span className="document-detail-lineage-field-label">{t('detail.seriesIdLabel')}</span>
                            <div className="document-detail-lineage-field-value">
                              {lifecycleEdit ? (
                                <input
                                  type="text"
                                  className="document-detail-info-input document-detail-lineage-input"
                                  value={editSeriesId}
                                  onChange={(e) => onSetEditSeriesId(e.target.value)}
                                  aria-label={t('detail.seriesIdLabel')}
                                />
                              ) : (
                                <code className="document-detail-lineage-series-id" title={document.series_id ?? document.id}>
                                  {document.series_id ?? document.id}
                                </code>
                              )}
                            </div>
                          </div>
                          <div className="document-detail-lineage-field">
                            <span className="document-detail-lineage-field-label">{t('detail.effectiveFromLabel')}</span>
                            <div className="document-detail-lineage-field-value">
                              {lifecycleEdit ? (
                                <input
                                  type="datetime-local"
                                  className="document-detail-info-input document-detail-lineage-input"
                                  value={editEffectiveFrom}
                                  onChange={(e) => onSetEditEffectiveFrom(e.target.value)}
                                  aria-label={t('detail.effectiveFromLabel')}
                                />
                              ) : (
                                <span>{(document.effective_from && new Date(document.effective_from).toLocaleString()) || '—'}</span>
                              )}
                            </div>
                          </div>
                          <div className="document-detail-lineage-field">
                            <span className="document-detail-lineage-field-label">{t('detail.effectiveToLabel')}</span>
                            <div className="document-detail-lineage-field-value">
                              {lifecycleEdit ? (
                                <input
                                  type="datetime-local"
                                  className="document-detail-info-input document-detail-lineage-input"
                                  value={editEffectiveTo}
                                  onChange={(e) => onSetEditEffectiveTo(e.target.value)}
                                  aria-label={t('detail.effectiveToLabel')}
                                />
                              ) : (
                                <span>{(document.effective_to && new Date(document.effective_to).toLocaleString()) || '—'}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="document-detail-lineage-rel-block">
                        <h4 className="document-detail-lineage-section-title">{t('detail.relationshipsHeading')}</h4>
                        {lineageLoading ? (
                          <p className="document-detail-muted">{t('common.loading')}</p>
                        ) : (
                          <>
                            <div className="document-detail-lineage-tables">
                              <div>
                                <div className="document-detail-lineage-dir">{t('detail.relOutgoing')}</div>
                                {lineageRels && lineageRels.outgoing.length > 0 ? (
                                  <table className="document-detail-lineage-table">
                                    <thead>
                                      <tr>
                                        <th>{t('detail.relColType')}</th>
                                        <th>{t('detail.relColOther')}</th>
                                        <th />
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {lineageRels.outgoing.map((r) => (
                                        <tr key={r.id}>
                                          <td>{r.relation_type}</td>
                                          <td>
                                            <Link to={`/documents/view/${r.peer_document_id}`}>{r.peer_document_name || r.peer_document_id}</Link>
                                          </td>
                                          <td>
                                            <button
                                              type="button"
                                              className="document-detail-lineage-rm"
                                              title={t('detail.removeRelTitle')}
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
                                  <p className="document-detail-muted document-detail-lineage-empty">{t('detail.noOutgoing')}</p>
                                )}
                              </div>
                              <div>
                                <div className="document-detail-lineage-dir">{t('detail.relIncoming')}</div>
                                {lineageRels && lineageRels.incoming.length > 0 ? (
                                  <table className="document-detail-lineage-table">
                                    <thead>
                                      <tr>
                                        <th>{t('detail.relColType')}</th>
                                        <th>{t('detail.relColOther')}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {lineageRels.incoming.map((r) => (
                                        <tr key={r.id}>
                                          <td>{r.relation_type}</td>
                                          <td>
                                            <Link to={`/documents/view/${r.peer_document_id}`}>{r.peer_document_name || r.peer_document_id}</Link>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  <p className="document-detail-muted document-detail-lineage-empty">{t('detail.noIncoming')}</p>
                                )}
                              </div>
                            </div>
                            <div className="document-detail-lineage-add">
                              <span className="document-detail-lineage-dir">{t('detail.addOutgoingEdge')}</span>
                              <div className="document-detail-lineage-add-row">
                                <select
                                  value={newRelType}
                                  onChange={(e) => onSetNewRelType(e.target.value)}
                                  className="document-detail-info-input"
                                  aria-label={t('detail.relTypeAria')}
                                >
                                  {DOCUMENT_RELATION_TYPES.map((relType) => (
                                    <option key={relType} value={relType}>
                                      {relType}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  className="document-detail-info-input"
                                  placeholder={t('detail.placeholderTargetDocId')}
                                  value={newRelTarget}
                                  onChange={(e) => onSetNewRelTarget(e.target.value)}
                                  aria-label={t('detail.placeholderTargetDocId')}
                                />
                                <input
                                  type="text"
                                  className="document-detail-info-input"
                                  placeholder={t('detail.placeholderRelNote')}
                                  value={newRelNote}
                                  onChange={(e) => onSetNewRelNote(e.target.value)}
                                  aria-label={t('detail.noteAria')}
                                />
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={onAddRelationship}
                                  disabled={relSaving}
                                >
                                  {relSaving ? <Loader2 size={12} className="doc-detail-spinner" /> : null}
                                  {t('detail.addRelationship')}
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
