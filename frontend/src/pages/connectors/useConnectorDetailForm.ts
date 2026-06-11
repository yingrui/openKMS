import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  fetchConnector,
  fetchConnectorKinds,
  triggerConnectorSync,
  updateConnector,
  type ConnectorKindOut,
  type ConnectorResponse,
} from '../../data/connectorsApi';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import { fetchDataSources, type DataSourceResponse } from '../../data/dataSourcesApi';
import { fetchSystemSettings } from '../../data/systemApi';
import {
  applyKindToInputsOutputs,
  buildConnectorPayload,
  initFormFromConnector,
  newKvRow,
  type KvRow,
} from './connectorFormUtils';
import { defaultSyncScheduleForm, parseSyncScheduleForm, type SyncScheduleFormState } from './connectorScheduleUtils';
import type { ConnectorSyncDateRange } from './connectorSyncUtils';

export type ConnectorDetailTabId = 'general' | 'cron' | 'playground' | 'probe';

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
  const [syncing, setSyncing] = useState(false);
  const [lastSyncJobId, setLastSyncJobId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ConnectorDetailTabId>('general');
  const [defaultTimezone, setDefaultTimezone] = useState('UTC');
  const [syncSchedule, setSyncSchedule] = useState<SyncScheduleFormState>(() => defaultSyncScheduleForm('UTC'));

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
  const isSyncConnector = selectedKindMeta?.category === 'sync';
  const isTushareConnector = formKind === 'tushare';
  const isTabbedDetail = isSearchTool || isSyncConnector;

  const applyInit = useCallback((kindList: ConnectorKindOut[], row: ConnectorResponse, tz: string) => {
    const init = initFormFromConnector(kindList, row);
    setFormName(init.formName);
    setFormKind(init.formKind);
    setFormEnabled(init.formEnabled);
    setInputValues(init.inputValues);
    setOutputDatasetIds(init.outputDatasetIds);
    setSettingsRows(init.settingsRows);
    setSecretRows(init.secretRows);
    setPlaygroundBaseline(init.inputValues);
    setSyncSchedule(parseSyncScheduleForm(row.sync_schedule, tz));
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [kRes, cRes, dRes, dsRes, sysRes] = await Promise.all([
        fetchConnectorKinds(),
        fetchConnector(id),
        fetchDatasets().catch(() => ({ items: [], total: 0 })),
        fetchDataSources().catch(() => ({ items: [], total: 0 })),
        fetchSystemSettings().catch(() => ({
          default_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          system_name: '',
          api_base_url_note: null,
        })),
      ]);
      const tz = sysRes.default_timezone?.trim() || 'UTC';
      setDefaultTimezone(tz);
      setKinds(kRes);
      setConnector(cRes);
      setDatasets(dRes.items);
      setDataSources(dsRes.items);
      applyInit(kRes, cRes, tz);
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
    setActiveTab('general');
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
      { isCreate: false, syncSchedule: isSyncConnector ? syncSchedule : null }
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
      applyInit(kinds, updated, defaultTimezone);
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
    defaultTimezone,
    isSyncConnector,
    syncSchedule,
    t,
  ]);

  const handleDatasetProvisioned = useCallback((dataset: DatasetResponse) => {
    setDatasets((prev) => (prev.some((d) => d.id === dataset.id) ? prev : [...prev, dataset]));
  }, []);

  const handleRunSync = useCallback(
    async (range: ConnectorSyncDateRange): Promise<number | null> => {
      if (!canWrite || !id || !isSyncConnector) return null;
      setSyncing(true);
      try {
        const { job_id: jobId } = await triggerConnectorSync(id, {
          start_date: range.startDate,
          end_date: range.endDate,
        });
        setLastSyncJobId(jobId);
        toast.success(t('connectors.syncStarted', { jobId }));
        const refreshed = await fetchConnector(id);
        setConnector(refreshed);
        applyInit(kinds, refreshed, defaultTimezone);
        return jobId;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('connectors.syncFailed'));
        return null;
      } finally {
        setSyncing(false);
      }
    },
    [canWrite, id, isSyncConnector, kinds, applyInit, defaultTimezone, t]
  );

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
    syncing,
    lastSyncJobId,
    connector,
    selectedKindMeta,
    isSearchTool,
    isSyncConnector,
    isTushareConnector,
    isTabbedDetail,
    activeTab,
    setActiveTab,
    formName,
    formFieldsProps,
    playgroundBaseline,
    inputValues,
    settingsRows,
    syncSchedule,
    setSyncSchedule,
    handleSave,
    handleRunSync,
    reload: load,
  };
}
