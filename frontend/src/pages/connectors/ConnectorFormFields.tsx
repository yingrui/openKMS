import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ConnectorKindOut } from '../../data/connectorsApi';
import type { DatasetResponse } from '../../data/datasetsApi';
import { datasetOptionLabel, newKvRow, type KvRow } from './connectorFormUtils';

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
  kindLocked,
  isExisting,
  readOnly,
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
  kindLocked: boolean;
  isExisting: boolean;
  readOnly: boolean;
}) {
  const { t } = useTranslation('console');
  const selectedKindMeta = kinds.find((k) => k.kind === formKind);
  const hasInputFields = (selectedKindMeta?.input_fields?.length ?? 0) > 0;
  const hasOutputSlots = (selectedKindMeta?.output_slots?.length ?? 0) > 0;

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
              {k.label} ({k.kind})
            </option>
          ))}
        </select>
      </div>
      {selectedKindMeta ? <p className="console-modal-hint">{selectedKindMeta.description}</p> : null}

      {hasInputFields && selectedKindMeta ? (
        <div className="console-modal-section">
          <h3 className="console-modal-subheading">{t('connectors.sectionInputs')}</h3>
          <p className="console-modal-hint">{t('connectors.inputsHint')}</p>
          {selectedKindMeta.input_fields.map((f) => {
            const fieldId = `connector-input-${f.key}`;
            return (
              <div key={f.key} className="console-form-field">
                <label htmlFor={fieldId}>{f.label}</label>
                <input
                  id={fieldId}
                  type={f.field_type === 'url' ? 'url' : 'text'}
                  className="console-form-control"
                  value={inputValues[f.key] ?? ''}
                  placeholder={f.placeholder ?? undefined}
                  onChange={(e) => onInputValuesChange({ ...inputValues, [f.key]: e.target.value })}
                  autoComplete="off"
                  disabled={readOnly}
                />
              </div>
            );
          })}
        </div>
      ) : null}

      {hasOutputSlots && selectedKindMeta ? (
        <div className="console-modal-section">
          <h3 className="console-modal-subheading">{t('connectors.sectionOutputs')}</h3>
          <p className="console-modal-hint">{t('connectors.outputsHint')}</p>
          {selectedKindMeta.output_slots.map((o) => {
            const fieldId = `connector-output-${o.slot}`;
            return (
              <div key={o.slot} className="console-form-field">
                <label htmlFor={fieldId}>{o.label}</label>
                {o.description ? (
                  <p className="console-modal-hint console-modal-hint--block">{o.description}</p>
                ) : null}
                <select
                  id={fieldId}
                  className="console-form-control"
                  value={outputDatasetIds[o.slot] ?? ''}
                  onChange={(e) => onOutputDatasetIdsChange({ ...outputDatasetIds, [o.slot]: e.target.value })}
                  disabled={readOnly}
                >
                  <option value="">{t('connectors.outputDatasetPlaceholder')}</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {datasetOptionLabel(d)}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="console-modal-section">
        <h3 className="console-modal-subheading">{t('connectors.sectionExtraSettings')}</h3>
        <p className="console-modal-hint">{t('connectors.settingsKvHint')}</p>
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
