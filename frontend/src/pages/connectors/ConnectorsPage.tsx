import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchConnectorKinds,
  fetchConnectors,
  createConnector,
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
  newKvRow,
  secretRowsForKind,
  type KvRow,
} from './connectorFormUtils';
import '../ontology/ontology-admin.scss';

export function ConnectorsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('console');
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(PERM_CONNECTORS_WRITE);
  const [kinds, setKinds] = useState<ConnectorKindOut[]>([]);
  const [items, setItems] = useState<ConnectorResponse[]>([]);
  const [datasets, setDatasets] = useState<Awaited<ReturnType<typeof fetchDatasets>>['items']>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState('');
  const [formKind, setFormKind] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [outputDatasetIds, setOutputDatasetIds] = useState<Record<string, string>>({});
  const [settingsRows, setSettingsRows] = useState<KvRow[]>([newKvRow()]);
  const [secretRows, setSecretRows] = useState<KvRow[]>([newKvRow()]);
  const [submitting, setSubmitting] = useState(false);

  const selectedKindMeta = useMemo(() => kinds.find((k) => k.kind === formKind), [kinds, formKind]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [kRes, cRes] = await Promise.all([fetchConnectorKinds(), fetchConnectors()]);
      setKinds(kRes);
      setItems(cRes.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('connectors.toastLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    const k0 = kinds[0]?.kind ?? '';
    setFormName('');
    setFormKind(k0);
    setFormEnabled(true);
    const meta = kinds.find((k) => k.kind === k0);
    const { inputValues: iv, outputDatasetIds: od } = applyKindToInputsOutputs(meta, null, null);
    setInputValues(iv);
    setOutputDatasetIds(od);
    setSettingsRows([newKvRow()]);
    setSecretRows(secretRowsForKind(kinds, k0));
    setShowCreate(true);
    void fetchDatasets()
      .then((r) => setDatasets(r.items))
      .catch(() => {
        setDatasets([]);
        toast.error(t('connectors.toastDatasetsLoadFailed'));
      });
  };

  const handleCreate = async () => {
    if (!canWrite) return;
    const built = buildConnectorPayload(
      selectedKindMeta,
      formName,
      formEnabled,
      inputValues,
      outputDatasetIds,
      settingsRows,
      secretRows,
      { isCreate: true }
    );
    if (!built.ok) {
      switch (built.error) {
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
      return;
    }
    setSubmitting(true);
    try {
      const created = await createConnector({
        name: built.body.name,
        kind: built.body.kind!,
        enabled: built.body.enabled,
        inputs: built.body.inputs,
        outputs: built.body.outputs,
        settings: Object.keys(built.body.settings).length > 0 ? built.body.settings : undefined,
        secrets: built.body.secrets,
      });
      toast.success(t('connectors.toastCreated'));
      setShowCreate(false);
      navigate(`/connectors/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('connectors.toastOperationFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ontology-admin">
      <div className="page-header">
        <div>
          <h1>{t('connectors.pageTitle')}</h1>
          <p className="page-subtitle">{t('connectors.subtitle')}</p>
        </div>
        {canWrite ? (
          <button type="button" className="btn btn-primary" onClick={openCreate} disabled={kinds.length === 0}>
            <Plus size={18} />
            <span>{t('connectors.newConnector')}</span>
          </button>
        ) : null}
      </div>

      <div className="ontology-admin-content">
        <div className="ontology-admin-table-wrap">
          {loading ? (
            <div className="console-loading">
              <Loader2 size={32} className="console-loading-spinner" />
              <p>{t('connectors.loading')}</p>
            </div>
          ) : (
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('connectors.colName')}</th>
                  <th>{t('connectors.colKind')}</th>
                  <th>{t('connectors.colSecrets')}</th>
                  <th>{t('connectors.colEnabled')}</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="console-table-empty">
                      {t('connectors.empty')}
                    </td>
                  </tr>
                ) : (
                  items.map((row) => {
                    const configured = row.secrets_configured ?? {};
                    const keys = Object.keys(configured);
                    const summary =
                      keys.length === 0
                        ? t('connectors.secretsNone')
                        : keys
                            .map((k) => `${k}: ${configured[k] ? t('connectors.secretSet') : t('connectors.secretUnset')}`)
                            .join(' · ');
                    return (
                      <tr key={row.id} className="console-table-row-link">
                        <td>
                          <Link to={`/connectors/${row.id}`} className="connector-list-name-link">
                            {row.name}
                          </Link>
                        </td>
                        <td>{row.kind}</td>
                        <td className="console-table-muted">{summary}</td>
                        <td>{row.enabled ? t('connectors.yes') : t('connectors.no')}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showCreate && (
        <div
          className="console-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && !submitting && setShowCreate(false)}
        >
          <div className="console-modal console-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="console-modal-header">
              <h2>{t('connectors.modalNewTitle')}</h2>
              <button
                type="button"
                onClick={() => !submitting && setShowCreate(false)}
                disabled={submitting}
                aria-label={t('connectors.closeAria')}
              >
                <X size={20} />
              </button>
            </div>
            <div className="console-modal-body">
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
                  setSecretRows(secretRowsForKind(kinds, next));
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
                kindLocked={false}
                isExisting={false}
                readOnly={false}
              />
            </div>
            <div className="console-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => !submitting && setShowCreate(false)}
                disabled={submitting}
              >
                {t('connectors.cancel')}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void handleCreate()} disabled={submitting}>
                {submitting ? t('connectors.saving') : t('connectors.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
