import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  provisionConnectorDataset,
  type ConnectorKindOutputSlotOut,
} from '../../data/connectorsApi';
import type { DataSourceResponse } from '../../data/dataSourcesApi';
import type { DatasetResponse } from '../../data/datasetsApi';
import { datasetOptionLabel } from './connectorFormUtils';

export function ConnectorOutputSlotField({
  slot,
  kind,
  value,
  datasets,
  dataSources,
  readOnly,
  canProvision,
  onSelect,
  onProvisioned,
}: {
  slot: ConnectorKindOutputSlotOut;
  kind: string;
  value: string;
  datasets: DatasetResponse[];
  dataSources: DataSourceResponse[];
  readOnly: boolean;
  canProvision: boolean;
  onSelect: (datasetId: string) => void;
  onProvisioned: (dataset: DatasetResponse) => void;
}) {
  const { t } = useTranslation('console');
  const fieldId = `connector-output-${slot.slot}`;
  const [showProvision, setShowProvision] = useState(false);
  const [dataSourceId, setDataSourceId] = useState('');
  const [schemaName, setSchemaName] = useState(slot.default_pg_schema ?? 'tushare');
  const [tableName, setTableName] = useState(slot.default_table_name ?? slot.slot);
  const [displayName, setDisplayName] = useState(slot.label);
  const [provisioning, setProvisioning] = useState(false);

  const pgSources = dataSources.filter((ds) => ds.kind === 'postgresql');
  const hasSchema = (slot.dataset_schema?.length ?? 0) > 0;

  const handleProvision = async () => {
    if (!dataSourceId) {
      toast.error(t('connectors.provisionDataSourceRequired'));
      return;
    }
    setProvisioning(true);
    try {
      const created = await provisionConnectorDataset({
        kind,
        slot: slot.slot,
        data_source_id: dataSourceId,
        schema_name: schemaName.trim() || undefined,
        table_name: tableName.trim() || undefined,
        display_name: displayName.trim() || undefined,
      });
      const now = new Date().toISOString();
      const dataset: DatasetResponse = {
        ...created,
        created_at: now,
        updated_at: now,
      };
      onProvisioned(dataset);
      onSelect(created.id);
      setShowProvision(false);
      toast.success(t('connectors.provisionSuccess'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('connectors.provisionFailed'));
    } finally {
      setProvisioning(false);
    }
  };

  return (
    <div className="console-form-field connector-output-slot">
      <label htmlFor={fieldId}>{slot.label}</label>
      {slot.description ? (
        <p className="console-modal-hint console-modal-hint--block">{slot.description}</p>
      ) : null}
      {hasSchema ? (
        <details className="connector-output-schema-details">
          <summary>{t('connectors.outputSchemaPreview')}</summary>
          <pre className="connector-output-schema">{JSON.stringify(slot.dataset_schema, null, 2)}</pre>
        </details>
      ) : null}
      <select
        id={fieldId}
        className="console-form-control"
        value={value}
        onChange={(e) => onSelect(e.target.value)}
        disabled={readOnly}
      >
        <option value="">{t('connectors.outputDatasetPlaceholder')}</option>
        {datasets.map((d) => (
          <option key={d.id} value={d.id}>
            {datasetOptionLabel(d)}
          </option>
        ))}
      </select>
      {canProvision && hasSchema && !readOnly ? (
        <div className="connector-output-provision">
          {!showProvision ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowProvision(true)}>
              <Plus size={14} />
              <span>{t('connectors.provisionDataset')}</span>
            </button>
          ) : (
            <div className="connector-output-provision-form">
              <p className="console-modal-hint">{t('connectors.provisionHint')}</p>
              <label className="connector-output-provision-label">
                {t('connectors.provisionDataSource')}
                <select
                  className="console-form-control"
                  value={dataSourceId}
                  onChange={(e) => setDataSourceId(e.target.value)}
                >
                  <option value="">{t('connectors.provisionDataSourcePlaceholder')}</option>
                  {pgSources.map((ds) => (
                    <option key={ds.id} value={ds.id}>
                      {ds.name}
                    </option>
                  ))}
                </select>
              </label>
              {pgSources.length === 0 ? (
                <p className="console-modal-hint">{t('connectors.provisionNoDataSources')}</p>
              ) : null}
              <div className="connector-output-provision-row">
                <label className="connector-output-provision-label">
                  {t('connectors.provisionSchema')}
                  <input
                    type="text"
                    className="console-form-control"
                    value={schemaName}
                    onChange={(e) => setSchemaName(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <label className="connector-output-provision-label">
                  {t('connectors.provisionTable')}
                  <input
                    type="text"
                    className="console-form-control"
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    autoComplete="off"
                  />
                </label>
              </div>
              <label className="connector-output-provision-label">
                {t('connectors.provisionDisplayName')}
                <input
                  type="text"
                  className="console-form-control"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <div className="connector-output-provision-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={provisioning || !dataSourceId}
                  onClick={() => void handleProvision()}
                >
                  {provisioning ? (
                    <>
                      <Loader2 size={14} className="console-loading-spinner" />
                      <span>{t('connectors.provisioning')}</span>
                    </>
                  ) : (
                    t('connectors.provisionCreate')
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={provisioning}
                  onClick={() => setShowProvision(false)}
                >
                  {t('connectors.provisionCancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
