import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ConnectorKindOut } from '../../data/connectorsApi';
import type { DataSourceResponse } from '../../data/dataSourcesApi';
import type { DatasetResponse } from '../../data/datasetsApi';
import { newKvRow, type KvRow } from './connectorFormUtils';
import { ConnectorOutputSlotField } from './ConnectorOutputSlotField';

const nameFieldId = 'connector-field-name';
const kindFieldId = 'connector-field-kind';

export function ConnectorFormFields({
  kinds,
  formName,
  onFormNameChange,
  formKind,
  onFormKindChange,
  formEnabled,
  onFormEnabledChange,
  inputValues,
  onInputValuesChange,
  outputDatasetIds,
  onOutputDatasetIdsChange,
  settingsRows,
  onSettingsRowsChange,
  secretRows,
  onSecretRowsChange,
  datasets,
  dataSources,
  canProvisionDatasets,
  onDatasetProvisioned,
  kindLocked,
  isExisting,
  readOnly,
  includeOutputs = true,
}: {
  kinds: ConnectorKindOut[];
  formName: string;
  onFormNameChange: (v: string) => void;
  formKind: string;
  onFormKindChange: (kind: string) => void;
  formEnabled: boolean;
  onFormEnabledChange: (v: boolean) => void;
  inputValues: Record<string, string>;
  onInputValuesChange: (v: Record<string, string>) => void;
  outputDatasetIds: Record<string, string>;
  onOutputDatasetIdsChange: (v: Record<string, string>) => void;
  settingsRows: KvRow[];
  onSettingsRowsChange: (rows: KvRow[]) => void;
  secretRows: KvRow[];
  onSecretRowsChange: (rows: KvRow[]) => void;
  datasets: DatasetResponse[];
  dataSources: DataSourceResponse[];
  canProvisionDatasets: boolean;
  onDatasetProvisioned: (dataset: DatasetResponse) => void;
  kindLocked: boolean;
  isExisting: boolean;
  readOnly: boolean;
  /** When false, output dataset slots are omitted (use ConnectorOutputDatasetsFields on a separate tab). */
  includeOutputs?: boolean;
}) {
  const { t } = useTranslation('console');
  const selectedKindMeta = kinds.find((k) => k.kind === formKind);
  const isSearchTool = selectedKindMeta?.category === 'search_tool';
  const hasInputFields = (selectedKindMeta?.input_fields?.length ?? 0) > 0;
  const hasOutputSlots = !isSearchTool && (selectedKindMeta?.output_slots?.length ?? 0) > 0;

  const renderInputControl = (f: ConnectorKindOut['input_fields'][0]) => {
    const fieldId = `connector-input-${f.key}`;
    const value = inputValues[f.key] ?? '';
    const onChange = (next: string) => onInputValuesChange({ ...inputValues, [f.key]: next });

    if (f.field_type === 'boolean') {
      return (
        <label className="console-modal-checkbox-row connector-input-boolean">
          <input
            id={fieldId}
            type="checkbox"
            checked={value === 'true' || value === '1'}
            onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
            disabled={readOnly}
          />
          <span>{f.label}</span>
        </label>
      );
    }
    if (f.field_type === 'select' && (f.options?.length ?? 0) > 0) {
      return (
        <>
          <label htmlFor={fieldId}>{f.label}</label>
          <select
            id={fieldId}
            className="console-form-control"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={readOnly}
          >
            {f.options!.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </>
      );
    }
    return (
      <>
        <label htmlFor={fieldId}>{f.label}</label>
        <input
          id={fieldId}
          type={f.field_type === 'url' ? 'url' : f.field_type === 'integer' ? 'number' : 'text'}
          className="console-form-control"
          value={value}
          placeholder={f.placeholder ?? undefined}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          disabled={readOnly}
        />
      </>
    );
  };

  const updateSettingsRow = (id: string, field: 'key' | 'value', value: string) => {
    onSettingsRowsChange(settingsRows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const updateSecretRow = (id: string, field: 'key' | 'value', value: string) => {
    onSecretRowsChange(secretRows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  return (
    <div className="connector-form-fields">
      <div className="console-form-field">
        <label htmlFor={nameFieldId}>{t('connectors.fieldName')}</label>
        <input
          id={nameFieldId}
          type="text"
          className="console-form-control"
          value={formName}
          onChange={(e) => onFormNameChange(e.target.value)}
          autoComplete="off"
          disabled={readOnly}
        />
      </div>
      <div className="console-form-field">
        <label htmlFor={kindFieldId}>{t('connectors.fieldKind')}</label>
        <select
          id={kindFieldId}
          className="console-form-control"
          value={formKind}
          onChange={(e) => onFormKindChange(e.target.value)}
          disabled={readOnly || kindLocked}
        >
          {kinds.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label} ({k.category})
            </option>
          ))}
        </select>
      </div>
      {selectedKindMeta ? <p className="console-modal-hint">{selectedKindMeta.description}</p> : null}

      {hasInputFields && selectedKindMeta ? (
        <div className="console-modal-section">
          <h3 className="console-modal-subheading">{t('connectors.sectionInputs')}</h3>
          <p className="console-modal-hint">{t('connectors.inputsHint')}</p>
          {selectedKindMeta.input_fields.map((f) => (
            <div key={f.key} className="console-form-field">
              {renderInputControl(f)}
            </div>
          ))}
        </div>
      ) : null}

      {isSearchTool && selectedKindMeta?.output_schema ? (
        <div className="console-modal-section">
          <h3 className="console-modal-subheading">{t('connectors.sectionOutputSchema')}</h3>
          <p className="console-modal-hint">{t('connectors.outputSchemaHint')}</p>
          <pre className="connector-output-schema">{JSON.stringify(selectedKindMeta.output_schema, null, 2)}</pre>
        </div>
      ) : null}

      {includeOutputs && hasOutputSlots && selectedKindMeta ? (
        <div className="console-modal-section">
          <h3 className="console-modal-subheading">{t('connectors.sectionOutputs')}</h3>
          <p className="console-modal-hint">{t('connectors.outputsHint')}</p>
          {selectedKindMeta.output_slots.map((o) => (
            <ConnectorOutputSlotField
              key={o.slot}
              slot={o}
              kind={formKind}
              value={outputDatasetIds[o.slot] ?? ''}
              datasets={datasets}
              dataSources={dataSources}
              readOnly={readOnly}
              canProvision={canProvisionDatasets}
              onSelect={(datasetId) =>
                onOutputDatasetIdsChange({ ...outputDatasetIds, [o.slot]: datasetId })
              }
              onProvisioned={onDatasetProvisioned}
            />
          ))}
        </div>
      ) : null}

      <div className="console-modal-section">
        <h3 className="console-modal-subheading">{t('connectors.sectionExtraSettings')}</h3>
        <p className="console-modal-hint">
          {isSearchTool ? t('connectors.searchToolSettingsHint') : t('connectors.settingsKvHint')}
        </p>
        <div className="console-kv-editor" role="group" aria-label={t('connectors.sectionExtraSettings')}>
          {settingsRows.map((r) => (
            <div key={r.id} className="console-kv-row">
              <input
                type="text"
                className="console-kv-key"
                placeholder={t('connectors.kvKeyPlaceholder')}
                value={r.key}
                onChange={(e) => updateSettingsRow(r.id, 'key', e.target.value)}
                autoComplete="off"
                disabled={readOnly}
              />
              <input
                type="text"
                className="console-kv-value"
                placeholder={t('connectors.kvValuePlaceholder')}
                value={r.value}
                onChange={(e) => updateSettingsRow(r.id, 'value', e.target.value)}
                autoComplete="off"
                disabled={readOnly}
              />
              {!readOnly ? (
                <button
                  type="button"
                  className="btn btn-secondary console-kv-remove"
                  onClick={() =>
                    onSettingsRowsChange(
                      settingsRows.length <= 1 ? [newKvRow()] : settingsRows.filter((x) => x.id !== r.id)
                    )
                  }
                  aria-label={t('connectors.removeRow')}
                >
                  <Trash2 size={16} />
                </button>
              ) : null}
            </div>
          ))}
          {!readOnly ? (
            <button
              type="button"
              className="btn btn-secondary console-kv-add"
              onClick={() => onSettingsRowsChange([...settingsRows, newKvRow()])}
            >
              <Plus size={16} />
              <span>{t('connectors.addSettingRow')}</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="console-modal-section">
        <h3 className="console-modal-subheading">{t('connectors.sectionSecrets')}</h3>
        <p className="console-modal-hint">
          {isExisting ? t('connectors.secretsKvHintEdit') : t('connectors.secretsKvHintCreate')}
          {selectedKindMeta && selectedKindMeta.secret_keys.length > 0 ? (
            <span> {t('connectors.secretsExpectedKeys', { keys: selectedKindMeta.secret_keys.join(', ') })}</span>
          ) : null}
        </p>
        <div className="console-kv-editor" role="group" aria-label={t('connectors.sectionSecrets')}>
          {secretRows.map((r) => (
            <div key={r.id} className="console-kv-row">
              <input
                type="text"
                className="console-kv-key"
                placeholder={t('connectors.kvSecretKeyPlaceholder')}
                value={r.key}
                onChange={(e) => updateSecretRow(r.id, 'key', e.target.value)}
                autoComplete="off"
                disabled={readOnly}
              />
              <input
                type="password"
                className="console-kv-value"
                placeholder={isExisting ? t('connectors.secretLeaveBlank') : t('connectors.kvSecretValuePlaceholder')}
                value={r.value}
                onChange={(e) => updateSecretRow(r.id, 'value', e.target.value)}
                autoComplete="new-password"
                disabled={readOnly}
              />
              {!readOnly ? (
                <button
                  type="button"
                  className="btn btn-secondary console-kv-remove"
                  onClick={() =>
                    onSecretRowsChange(
                      secretRows.length <= 1 ? [newKvRow()] : secretRows.filter((x) => x.id !== r.id)
                    )
                  }
                  aria-label={t('connectors.removeRow')}
                >
                  <Trash2 size={16} />
                </button>
              ) : null}
            </div>
          ))}
          {!readOnly ? (
            <button type="button" className="btn btn-secondary console-kv-add" onClick={() => onSecretRowsChange([...secretRows, newKvRow()])}>
              <Plus size={16} />
              <span>{t('connectors.addSecretRow')}</span>
            </button>
          ) : null}
        </div>
      </div>

      <label className="console-modal-checkbox-row">
        <input
          type="checkbox"
          checked={formEnabled}
          onChange={(e) => onFormEnabledChange(e.target.checked)}
          disabled={readOnly}
        />
        <span>{t('connectors.fieldEnabled')}</span>
      </label>
    </div>
  );
}
