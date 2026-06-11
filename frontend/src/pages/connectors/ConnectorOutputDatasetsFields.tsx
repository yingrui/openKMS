import { useTranslation } from 'react-i18next';
import type { ConnectorKindOut } from '../../data/connectorsApi';
import type { DataSourceResponse } from '../../data/dataSourcesApi';
import type { DatasetResponse } from '../../data/datasetsApi';
import { ConnectorOutputSlotField } from './ConnectorOutputSlotField';

export function ConnectorOutputDatasetsFields({
  selectedKindMeta,
  formKind,
  outputDatasetIds,
  onOutputDatasetIdsChange,
  datasets,
  dataSources,
  canProvisionDatasets,
  onDatasetProvisioned,
  readOnly,
  scheduleEnabled = false,
}: {
  selectedKindMeta: ConnectorKindOut | undefined;
  formKind: string;
  outputDatasetIds: Record<string, string>;
  onOutputDatasetIdsChange: (v: Record<string, string>) => void;
  datasets: DatasetResponse[];
  dataSources: DataSourceResponse[];
  canProvisionDatasets: boolean;
  onDatasetProvisioned: (dataset: DatasetResponse) => void;
  readOnly: boolean;
  scheduleEnabled?: boolean;
}) {
  const { t } = useTranslation('console');
  const slots = selectedKindMeta?.output_slots ?? [];

  if (slots.length === 0) {
    return <p className="console-modal-hint">{t('connectors.outputsNotApplicable')}</p>;
  }

  return (
    <div className="connector-output-datasets-fields">
      <p className="console-modal-hint">{t('connectors.outputsOptionalHint')}</p>
      {scheduleEnabled ? (
        <p className="console-modal-hint">{t('connectors.outputsClearScheduleHint')}</p>
      ) : null}
      {slots.map((o) => (
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
  );
}
