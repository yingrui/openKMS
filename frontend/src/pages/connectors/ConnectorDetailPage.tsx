import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, Settings, Trash2, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchConnector,
  fetchConnectorKinds,
  updateConnector,
  deleteConnector,
  type ConnectorKindOut,
  type ConnectorResponse,
} from '../../data/connectorsApi';
import { fetchDatasets } from '../../data/datasetsApi';
import { useAuth } from '../../contexts/AuthContext';
import { PERM_CONNECTORS_WRITE } from '../../config/permissions';
import { ConnectorFormFields } from './ConnectorFormFields';
import { ConnectorSearchPlayground } from './ConnectorSearchPlayground';
import {
  applyKindToInputsOutputs,
  buildConnectorPayload,
  initFormFromConnector,
  newKvRow,
  type KvRow,
} from './connectorFormUtils';
import '../ontology/ontology-admin.scss';

type SearchToolTabId = 'settings' | 'playground';

function toastForPayloadError(
  t: (key: string) => string,
  error: 'required' | 'duplicate' | 'outputs' | 'secrets'
) {
  switch (error) {
    case 'required':
      toast.error(t('connectors.toastRequiredFields'));
      break;
    case 'duplicate':
      toast.error(t('connectors.toastDuplicateKey'));
      break;
    case 'outputs':
      toast.error(t('connectors.toastOutputsRequired'));
      break;
    case 'secrets':
      toast.error(t('connectors.toastSecretsRequired'));
      break;
  }
}

export function ConnectorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('console');
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(PERM_CONNECTORS_WRITE);

  const [kinds, setKinds] = useState<ConnectorKindOut[]>([]);
  const [connector, setConnector] = useState<ConnectorResponse | null>(null);
  const [datasets, setDatasets] = useState<Awaited<ReturnType<typeof fetchDatasets>>['items']>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState('');
  const [formKind, setFormKind] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [outputDatasetIds, setOutputDatasetIds] = useState<Record<string, string>>({});
  const [settingsRows, setSettingsRows] = useState<KvRow[]>([newKvRow()]);
  const [secretRows, setSecretRows] = useState<KvRow[]>([newKvRow()]);
  const [playgroundBaseline, setPlaygroundBaseline] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<SearchToolTabId>('settings');

  const selectedKindMeta = useMemo(() => kinds.find((k) => k.kind === formKind), [kinds, formKind]);
  const isSearchTool = selectedKindMeta?.category === 'search_tool';

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [kRes, cRes, dRes] = await Promise.all([
        fetchConnectorKinds(),
        fetchConnector(id),
        fetchDatasets().catch(() => ({ items: [], total: 0 })),
      ]);
      setKinds(kRes);
      setConnector(cRes);
      setDatasets(dRes.items);
      const init = initFormFromConnector(kRes, cRes);
      setFormName(init.formName);
      setFormKind(init.formKind);
      setFormEnabled(init.formEnabled);
      setInputValues(init.inputValues);
      setOutputDatasetIds(init.outputDatasetIds);
      setSettingsRows(init.settingsRows);
      setSecretRows(init.secretRows);
      setPlaygroundBaseline(init.inputValues);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('connectors.toastLoadFailed'));
      setConnector(null);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setActiveTab('settings');
  }, [id]);

  const handleSave = async () => {
    if (!canWrite || !id) return;
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
      return;
    }
    const patch = {
      name: built.body.name,
      enabled: built.body.enabled,
      settings: built.body.settings,
      inputs: built.body.inputs,
      outputs: built.body.outputs,
      secrets: built.body.secrets,
    };
    setSaving(true);
    try {
      const updated = await updateConnector(id, patch);
      setConnector(updated);
      const init = initFormFromConnector(kinds, updated);
      setPlaygroundBaseline(init.inputValues);
      toast.success(t('connectors.toastUpdated'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('connectors.toastOperationFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!canWrite || !id) return;
    if (!window.confirm(t('connectors.deleteConfirm'))) return;
    try {
      await deleteConnector(id);
      toast.success(t('connectors.toastDeleted'));
      navigate('/connectors');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('connectors.toastDeleteFailed'));
    }
  };

  if (loading) {
    return (
      <div className="ontology-admin">
        <div className="console-loading">
          <Loader2 size={32} className="console-loading-spinner" />
          <p>{t('connectors.loading')}</p>
        </div>
      </div>
    );
  }

  if (!connector) {
    return (
      <div className="ontology-admin">
        <p>{t('connectors.detailNotFound')}</p>
        <Link to="/connectors" className="btn btn-secondary">
          {t('connectors.backToList')}
        </Link>
      </div>
    );
  }

  return (
    <div className="ontology-admin">
      <div className="page-header">
        <div>
          <Link to="/connectors" className="connector-detail-back">
            <ArrowLeft size={18} />
            <span>{t('connectors.backToList')}</span>
          </Link>
          <h1>{formName || connector.name}</h1>
          <p className="page-subtitle">{selectedKindMeta?.label ?? connector.kind}</p>
        </div>
        {canWrite ? (
          <div className="connector-detail-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void handleDelete()}>
              <Trash2 size={18} />
              <span>{t('connectors.deleteTitle')}</span>
            </button>
            {(!isSearchTool || activeTab === 'settings') ? (
              <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? t('connectors.saving') : t('connectors.save')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        className={`ontology-admin-content connector-detail-panel${isSearchTool ? ' connector-detail-panel--tabbed' : ''}`}
      >
        {isSearchTool ? (
          <div className="connector-detail-tabs" role="tablist" aria-label={t('connectors.detailTabsAria')}>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'settings'}
              className={`connector-detail-tab${activeTab === 'settings' ? ' active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <Settings size={18} />
              <span>{t('connectors.tabSettings')}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'playground'}
              className={`connector-detail-tab${activeTab === 'playground' ? ' active' : ''}`}
              onClick={() => setActiveTab('playground')}
            >
              <FlaskConical size={18} />
              <span>{t('connectors.tabPlayground')}</span>
            </button>
          </div>
        ) : null}

        {isSearchTool ? (
          <div
            className={`connector-detail-tab-panel${activeTab === 'playground' ? ' connector-detail-tab-panel--playground' : ''}`}
            role="tabpanel"
          >
            {activeTab === 'settings' ? (
              <ConnectorFormFields
                kinds={kinds}
                formName={formName}
                onFormNameChange={setFormName}
                formKind={formKind}
                onFormKindChange={(next) => {
                  setFormKind(next);
                  const meta = kinds.find((k) => k.kind === next);
                  const { inputValues: iv, outputDatasetIds: od } = applyKindToInputsOutputs(meta, null, null);
                  setInputValues(iv);
                  setOutputDatasetIds(od);
                }}
                formEnabled={formEnabled}
                onFormEnabledChange={setFormEnabled}
                inputValues={inputValues}
                onInputValuesChange={setInputValues}
                outputDatasetIds={outputDatasetIds}
                onOutputDatasetIdsChange={setOutputDatasetIds}
                settingsRows={settingsRows}
                onSettingsRowsChange={setSettingsRows}
                secretRows={secretRows}
                onSecretRowsChange={setSecretRows}
                datasets={datasets}
                kindLocked
                isExisting
                readOnly={!canWrite}
              />
            ) : null}
            {activeTab === 'playground' && selectedKindMeta && id ? (
              <ConnectorSearchPlayground
                connectorId={id}
                kindMeta={selectedKindMeta}
                baselineInputs={playgroundBaseline}
                inputValues={inputValues}
                settingsRows={settingsRows}
                embedded
              />
            ) : null}
          </div>
        ) : (
          <div className="connector-detail-card">
            <ConnectorFormFields
              kinds={kinds}
              formName={formName}
              onFormNameChange={setFormName}
              formKind={formKind}
              onFormKindChange={(next) => {
                setFormKind(next);
                const meta = kinds.find((k) => k.kind === next);
                const { inputValues: iv, outputDatasetIds: od } = applyKindToInputsOutputs(meta, null, null);
                setInputValues(iv);
                setOutputDatasetIds(od);
              }}
              formEnabled={formEnabled}
              onFormEnabledChange={setFormEnabled}
              inputValues={inputValues}
              onInputValuesChange={setInputValues}
              outputDatasetIds={outputDatasetIds}
              onOutputDatasetIdsChange={setOutputDatasetIds}
              settingsRows={settingsRows}
              onSettingsRowsChange={setSettingsRows}
              secretRows={secretRows}
              onSecretRowsChange={setSecretRows}
              datasets={datasets}
              kindLocked
              isExisting
              readOnly={!canWrite}
            />
          </div>
        )}
      </div>
    </div>
  );
}
