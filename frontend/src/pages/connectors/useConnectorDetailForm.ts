import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  fetchConnector,
  fetchConnectorKinds,
  updateConnector,
  type ConnectorKindOut,
  type ConnectorResponse,
} from '../../data/connectorsApi';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import { fetchDataSources, type DataSourceResponse } from '../../data/dataSourcesApi';
import {
  applyKindToInputsOutputs,
  buildConnectorPayload,
  initFormFromConnector,
  newKvRow,
  type KvRow,
} from './connectorFormUtils';

export type ConnectorDetailTabId = 'settings' | 'playground';

type PayloadError = 'required' | 'duplicate' | 'outputs' | 'secrets';

function toastForPayloadError(t: (key: string) => string, error: PayloadError) {
  const keyByError: Record<PayloadError, string> = {
    required: 'connectors.toastRequiredFields',
    duplicate: 'connectors.toastDuplicateKey',
    outputs: 'connectors.toastOutputsRequired',
    secrets: 'connectors.toastSecretsRequired',
  };
  toast.error(t(keyByError[error]));
}

export function useConnectorDetailForm(
  id: string | undefined,
  canWrite: boolean,
  canProvisionDatasets: boolean
) {
  const { t } = useTranslation('console');

  const [kinds, setKinds] = useState<ConnectorKindOut[]>([]);
  const [connector, setConnector] = useState<ConnectorResponse | null>(null);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [dataSources, setDataSources] = useState<DataSourceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<ConnectorDetailTabId>('settings');

  const [formName, setFormName] = useState('');
  const [formKind, setFormKind] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [outputDatasetIds, setOutputDatasetIds] = useState<Record<string, string>>({});
  const [settingsRows, setSettingsRows] = useState<KvRow[]>([newKvRow()]);
  const [secretRows, setSecretRows] = useState<KvRow[]>([newKvRow()]);
  const [playgroundBaseline, setPlaygroundBaseline] = useState<Record<string, string>>({});

  const selectedKindMeta = useMemo(() => kinds.find((k) => k.kind === formKind), [kinds, formKind]);
  const isSearchTool = selectedKindMeta?.category === 'search_tool';

  const applyInit = useCallback((kindList: ConnectorKindOut[], row: ConnectorResponse) => {
    const init = initFormFromConnector(kindList, row);
    setFormName(init.formName);
    setFormKind(init.formKind);
    setFormEnabled(init.formEnabled);
    setInputValues(init.inputValues);
    setOutputDatasetIds(init.outputDatasetIds);
    setSettingsRows(init.settingsRows);
    setSecretRows(init.secretRows);
    setPlaygroundBaseline(init.inputValues);
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [kRes, cRes, dRes, dsRes] = await Promise.all([
        fetchConnectorKinds(),
        fetchConnector(id),
        fetchDatasets().catch(() => ({ items: [], total: 0 })),
        fetchDataSources().catch(() => ({ items: [], total: 0 })),
      ]);
      setKinds(kRes);
      setConnector(cRes);
      setDatasets(dRes.items);
      setDataSources(dsRes.items);
      applyInit(kRes, cRes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('connectors.toastLoadFailed'));
      setConnector(null);
    } finally {
      setLoading(false);
    }
  }, [id, t, applyInit]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setActiveTab('settings');
  }, [id]);

  const handleKindChange = useCallback(
    (next: string) => {
      setFormKind(next);
      const meta = kinds.find((k) => k.kind === next);
      const { inputValues: iv, outputDatasetIds: od } = applyKindToInputsOutputs(meta, null, null);
      setInputValues(iv);
      setOutputDatasetIds(od);
    },
    [kinds]
  );

  const handleSave = useCallback(async () => {
    if (!canWrite || !id) return false;
    const built = buildConnectorPayload(
      selectedKindMeta,
      formName,
      formEnabled,
      inputValues,
      outputDatasetIds,
      settingsRows,
      secretRows,
      { isCreate: false }
    );
    if (!built.ok) {
      toastForPayloadError(t, built.error);
      return false;
    }
    setSaving(true);
    try {
      const updated = await updateConnector(id, {
        name: built.body.name,
        enabled: built.body.enabled,
        settings: built.body.settings,
        inputs: built.body.inputs,
        outputs: built.body.outputs,
        secrets: built.body.secrets,
      });
      setConnector(updated);
      applyInit(kinds, updated);
      toast.success(t('connectors.toastUpdated'));
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('connectors.toastOperationFailed'));
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    canWrite,
    id,
    selectedKindMeta,
    formName,
    formEnabled,
    inputValues,
    outputDatasetIds,
    settingsRows,
    secretRows,
    kinds,
    applyInit,
    t,
  ]);

  const handleDatasetProvisioned = useCallback((dataset: DatasetResponse) => {
    setDatasets((prev) => (prev.some((d) => d.id === dataset.id) ? prev : [...prev, dataset]));
  }, []);

  const formFieldsProps = useMemo(
    () => ({
      kinds,
      formName,
      onFormNameChange: setFormName,
      formKind,
      onFormKindChange: handleKindChange,
      formEnabled,
      onFormEnabledChange: setFormEnabled,
      inputValues,
      onInputValuesChange: setInputValues,
      outputDatasetIds,
      onOutputDatasetIdsChange: setOutputDatasetIds,
      settingsRows,
      onSettingsRowsChange: setSettingsRows,
      secretRows,
      onSecretRowsChange: setSecretRows,
      datasets,
      dataSources,
      canProvisionDatasets,
      onDatasetProvisioned: handleDatasetProvisioned,
      kindLocked: true as const,
      isExisting: true as const,
      readOnly: !canWrite,
    }),
    [
      kinds,
      formName,
      handleKindChange,
      formKind,
      formEnabled,
      inputValues,
      outputDatasetIds,
      settingsRows,
      secretRows,
      datasets,
      dataSources,
      canWrite,
      canProvisionDatasets,
      handleDatasetProvisioned,
    ]
  );

  return {
    loading,
    saving,
    connector,
    selectedKindMeta,
    isSearchTool,
    activeTab,
    setActiveTab,
    formName,
    formFieldsProps,
    playgroundBaseline,
    inputValues,
    settingsRows,
    handleSave,
    reload: load,
  };
}
