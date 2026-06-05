import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
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
import {
  applyKindToInputsOutputs,
  buildConnectorPayload,
  initFormFromConnector,
  newKvRow,
  type KvRow,
} from './connectorFormUtils';
import '../ontology/ontology-admin.scss';

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

  const selectedKindMeta = useMemo(() => kinds.find((k) => k.kind === formKind), [kinds, formKind]);

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
            <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
              {saving ? t('connectors.saving') : t('connectors.save')}
            </button>
          </div>
        ) : null}
      </div>

      <div className="ontology-admin-content connector-detail-panel">
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
      </div>
    </div>
  );
}
