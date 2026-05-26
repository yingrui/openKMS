import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchConnectorKinds,
  fetchConnectors,
  createConnector,
  updateConnector,
  deleteConnector,
  type ConnectorKindOut,
  type ConnectorResponse,
} from '../../data/connectorsApi';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import { useAuth } from '../../contexts/AuthContext';
import { PERM_CONNECTORS_WRITE } from '../../config/permissions';
import '../ontology/ontology-admin.scss';

type KvRow = { id: string; key: string; value: string };

function newKvRow(): KvRow {
  return { id: crypto.randomUUID(), key: '', value: '' };
}

function settingsToRows(settings: Record<string, unknown> | null | undefined): KvRow[] {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return [newKvRow()];
  }
  const keys = Object.keys(settings);
  if (keys.length === 0) return [newKvRow()];
  return keys.map((key) => {
    const v = settings[key];
    const value =
      v === null || v === undefined
        ? ''
        : typeof v === 'string'
          ? v
          : JSON.stringify(v);
    return { id: crypto.randomUUID(), key, value };
  });
}

function parseSettingValue(raw: string): unknown {
  const t = raw.trim();
  if (t === '') return '';
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(t) && !Number.isNaN(Number(t))) return Number(t);
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

function rowsToSettingsObject(rows: KvRow[]): { ok: true; value: Record<string, unknown> } | { ok: false } {
  const out: Record<string, unknown> = {};
  const seen = new Set<string>();
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    if (seen.has(k)) {
      return { ok: false };
    }
    seen.add(k);
    const v = r.value.trim();
    if (v === '') continue;
    out[k] = parseSettingValue(r.value);
  }
  return { ok: true, value: out };
}

function rowsToSecretsMap(rows: KvRow[]): { ok: true; value: Record<string, string> } | { ok: false } {
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    if (!r.value.trim()) continue;
    if (seen.has(k)) {
      return { ok: false };
    }
    seen.add(k);
    out[k] = r.value;
  }
  return { ok: true, value: out };
}

function applyKindToInputsOutputs(
  meta: ConnectorKindOut | undefined,
  existingInputs: Record<string, unknown> | null | undefined,
  existingOutputs: Record<string, unknown> | null | undefined
): { inputValues: Record<string, string>; outputDatasetIds: Record<string, string> } {
  const inputValues: Record<string, string> = {};
  if (meta?.input_fields?.length) {
    for (const f of meta.input_fields) {
      const v = existingInputs?.[f.key];
      const s =
        typeof v === 'string'
          ? v
          : v !== undefined && v !== null
            ? String(v)
            : '';
      inputValues[f.key] = s.trim() ? s : f.default ?? '';
    }
  }
  const outputDatasetIds: Record<string, string> = {};
  if (meta?.output_slots?.length) {
    for (const o of meta.output_slots) {
      const v = existingOutputs?.[o.slot];
      outputDatasetIds[o.slot] = typeof v === 'string' ? v : '';
    }
  }
  return { inputValues, outputDatasetIds };
}

function datasetOptionLabel(d: DatasetResponse): string {
  const base = (d.display_name && d.display_name.trim()) || `${d.schema_name}.${d.table_name}`;
  return d.data_source_name ? `${base} · ${d.data_source_name}` : base;
}

export function ConnectorsPage() {
  const { t } = useTranslation('console');
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(PERM_CONNECTORS_WRITE);
  const [kinds, setKinds] = useState<ConnectorKindOut[]>([]);
  const [items, setItems] = useState<ConnectorResponse[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<ConnectorResponse | null>(null);
  const [formName, setFormName] = useState('');
  const [formKind, setFormKind] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [outputDatasetIds, setOutputDatasetIds] = useState<Record<string, string>>({});
  const [settingsRows, setSettingsRows] = useState<KvRow[]>([newKvRow()]);
  const [secretRows, setSecretRows] = useState<KvRow[]>([newKvRow()]);
  const [submitting, setSubmitting] = useState(false);

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

  useEffect(() => {
    if (kinds.length > 0 && !formKind) {
      setFormKind(kinds[0].kind);
    }
  }, [kinds, formKind]);

  useEffect(() => {
    if (!showForm) return;
    void (async () => {
      try {
        const r = await fetchDatasets();
        setDatasets(r.items);
      } catch {
        setDatasets([]);
        toast.error(t('connectors.toastDatasetsLoadFailed'));
      }
    })();
  }, [showForm, t]);

  const selectedKindMeta = useMemo(() => kinds.find((k) => k.kind === formKind), [kinds, formKind]);
  const hasInputFields = (selectedKindMeta?.input_fields?.length ?? 0) > 0;
  const hasOutputSlots = (selectedKindMeta?.output_slots?.length ?? 0) > 0;

  const resetSecretRowsForKind = useCallback(
    (kind: string) => {
      const meta = kinds.find((k) => k.kind === kind);
      if (meta && meta.secret_keys.length > 0) {
        setSecretRows(meta.secret_keys.map((sk) => ({ id: crypto.randomUUID(), key: sk, value: '' })));
      } else {
        setSecretRows([newKvRow()]);
      }
    },
    [kinds]
  );

  const applyKindState = useCallback(
    (kindKey: string, row: ConnectorResponse | null) => {
      const meta = kinds.find((k) => k.kind === kindKey);
      const { inputValues: iv, outputDatasetIds: od } = applyKindToInputsOutputs(
        meta,
        row?.inputs ?? undefined,
        row?.outputs ?? undefined
      );
      setInputValues(iv);
      setOutputDatasetIds(od);
    },
    [kinds]
  );

  const openCreate = () => {
    setEditItem(null);
    setFormName('');
    const k0 = kinds[0]?.kind ?? '';
    setFormKind(k0);
    setFormEnabled(true);
    applyKindState(k0, null);
    setSettingsRows([newKvRow()]);
    resetSecretRowsForKind(k0);
    setShowForm(true);
  };

  const openEdit = (row: ConnectorResponse) => {
    setEditItem(row);
    setFormName(row.name);
    setFormKind(row.kind);
    setFormEnabled(row.enabled);
    applyKindState(row.kind, row);
    setSettingsRows(settingsToRows(row.settings));
    const meta = kinds.find((k) => k.kind === row.kind);
    if (meta?.secret_keys.length) {
      setSecretRows(meta.secret_keys.map((sk) => ({ id: crypto.randomUUID(), key: sk, value: '' })));
    } else {
      setSecretRows([newKvRow()]);
    }
    setShowForm(true);
  };

  const updateSettingsRow = (id: string, field: 'key' | 'value', value: string) => {
    setSettingsRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const updateSecretRow = (id: string, field: 'key' | 'value', value: string) => {
    setSecretRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const handleSubmit = async () => {
    if (!canWrite) return;
    if (!formName.trim() || !formKind.trim()) {
      toast.error(t('connectors.toastRequiredFields'));
      return;
    }

    const settingsResult = rowsToSettingsObject(settingsRows);
    if (!settingsResult.ok) {
      toast.error(t('connectors.toastDuplicateKey'));
      return;
    }

    const secretsResult = rowsToSecretsMap(secretRows);
    if (!secretsResult.ok) {
      toast.error(t('connectors.toastDuplicateKey'));
      return;
    }
    const secrets = secretsResult.value;
    const required = selectedKindMeta?.secret_keys ?? [];

    const inputsObj: Record<string, string> = {};
    if (hasInputFields && selectedKindMeta) {
      for (const f of selectedKindMeta.input_fields) {
        inputsObj[f.key] = (inputValues[f.key] ?? '').trim() || (f.default ?? '');
      }
    }

    const outputsObj: Record<string, string> = {};
    if (hasOutputSlots && selectedKindMeta) {
      for (const o of selectedKindMeta.output_slots) {
        const id = (outputDatasetIds[o.slot] ?? '').trim();
        if (!id) {
          toast.error(t('connectors.toastOutputsRequired'));
          return;
        }
        outputsObj[o.slot] = id;
      }
    }

    setSubmitting(true);
    try {
      if (editItem) {
        const patch: {
          name: string;
          enabled: boolean;
          settings: Record<string, unknown>;
          inputs?: Record<string, string>;
          outputs?: Record<string, string>;
          secrets?: Record<string, string>;
        } = {
          name: formName.trim(),
          enabled: formEnabled,
          settings: settingsResult.value,
        };
        if (hasInputFields) patch.inputs = inputsObj;
        if (hasOutputSlots) patch.outputs = outputsObj;
        if (Object.keys(secrets).length > 0) {
          patch.secrets = secrets;
        }
        await updateConnector(editItem.id, patch);
        toast.success(t('connectors.toastUpdated'));
      } else {
        for (const req of required) {
          if (!secrets[req]?.trim()) {
            toast.error(t('connectors.toastSecretsRequired'));
            setSubmitting(false);
            return;
          }
        }
        await createConnector({
          name: formName.trim(),
          kind: formKind.trim(),
          enabled: formEnabled,
          inputs: hasInputFields ? inputsObj : undefined,
          outputs: hasOutputSlots ? outputsObj : undefined,
          settings: Object.keys(settingsResult.value).length > 0 ? settingsResult.value : undefined,
          secrets: Object.keys(secrets).length > 0 ? secrets : undefined,
        });
        toast.success(t('connectors.toastCreated'));
      }
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('connectors.toastOperationFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canWrite) return;
    if (!window.confirm(t('connectors.deleteConfirm'))) return;
    try {
      await deleteConnector(id);
      toast.success(t('connectors.toastDeleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('connectors.toastDeleteFailed'));
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
                  {canWrite ? <th className="console-table-actions">{t('connectors.colActions')}</th> : null}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={canWrite ? 5 : 4} className="console-table-empty">
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
                        : keys.map((k) => `${k}: ${configured[k] ? t('connectors.secretSet') : t('connectors.secretUnset')}`).join(' · ');
                    return (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{row.kind}</td>
                        <td className="console-table-muted">{summary}</td>
                        <td>{row.enabled ? t('connectors.yes') : t('connectors.no')}</td>
                        {canWrite ? (
                          <td className="console-table-actions">
                            <div className="console-table-btns">
                              <button type="button" title={t('connectors.editTitle')} onClick={() => openEdit(row)}>
                                <Pencil size={16} />
                              </button>
                              <button type="button" title={t('connectors.deleteTitle')} onClick={() => handleDelete(row.id)}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showForm && (
        <div className="console-modal-overlay" onClick={(e) => e.target === e.currentTarget && !submitting && setShowForm(false)}>
          <div className="console-modal console-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="console-modal-header">
              <h2>{editItem ? t('connectors.modalEditTitle') : t('connectors.modalNewTitle')}</h2>
              <button type="button" onClick={() => !submitting && setShowForm(false)} disabled={submitting} aria-label={t('connectors.closeAria')}>
                <X size={20} />
              </button>
            </div>
            <div className="console-modal-body">
              <label>
                <span>{t('connectors.fieldName')}</span>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} autoComplete="off" />
              </label>
              <label>
                <span>{t('connectors.fieldKind')}</span>
                <select
                  value={formKind}
                  onChange={(e) => {
                    const next = e.target.value;
                    setFormKind(next);
                    if (!editItem) {
                      applyKindState(next, null);
                      resetSecretRowsForKind(next);
                    }
                  }}
                  disabled={!!editItem}
                >
                  {kinds.map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {k.label} ({k.kind})
                    </option>
                  ))}
                </select>
              </label>
              {selectedKindMeta && <p className="console-modal-hint">{selectedKindMeta.description}</p>}

              {hasInputFields && selectedKindMeta && (
                <div className="console-modal-section">
                  <h3 className="console-modal-subheading">{t('connectors.sectionInputs')}</h3>
                  <p className="console-modal-hint">{t('connectors.inputsHint')}</p>
                  {selectedKindMeta.input_fields.map((f) => (
                    <label key={f.key}>
                      <span>{f.label}</span>
                      <input
                        type={f.field_type === 'url' ? 'url' : 'text'}
                        value={inputValues[f.key] ?? ''}
                        placeholder={f.placeholder ?? undefined}
                        onChange={(e) => setInputValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        autoComplete="off"
                      />
                    </label>
                  ))}
                </div>
              )}

              {hasOutputSlots && selectedKindMeta && (
                <div className="console-modal-section">
                  <h3 className="console-modal-subheading">{t('connectors.sectionOutputs')}</h3>
                  <p className="console-modal-hint">{t('connectors.outputsHint')}</p>
                  {selectedKindMeta.output_slots.map((o) => (
                    <label key={o.slot}>
                      <span>{o.label}</span>
                      <span className="console-modal-hint console-modal-hint--block">{o.description}</span>
                      <select
                        value={outputDatasetIds[o.slot] ?? ''}
                        onChange={(e) => setOutputDatasetIds((prev) => ({ ...prev, [o.slot]: e.target.value }))}
                      >
                        <option value="">{t('connectors.outputDatasetPlaceholder')}</option>
                        {datasets.map((d) => (
                          <option key={d.id} value={d.id}>
                            {datasetOptionLabel(d)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}

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
                      />
                      <input
                        type="text"
                        className="console-kv-value"
                        placeholder={t('connectors.kvValuePlaceholder')}
                        value={r.value}
                        onChange={(e) => updateSettingsRow(r.id, 'value', e.target.value)}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="btn btn-secondary console-kv-remove"
                        onClick={() =>
                          setSettingsRows((prev) => (prev.length <= 1 ? [newKvRow()] : prev.filter((x) => x.id !== r.id)))
                        }
                        aria-label={t('connectors.removeRow')}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-secondary console-kv-add" onClick={() => setSettingsRows((prev) => [...prev, newKvRow()])}>
                    <Plus size={16} />
                    <span>{t('connectors.addSettingRow')}</span>
                  </button>
                </div>
              </div>

              <div className="console-modal-section">
                <h3 className="console-modal-subheading">{t('connectors.sectionSecrets')}</h3>
                <p className="console-modal-hint">
                  {editItem ? t('connectors.secretsKvHintEdit') : t('connectors.secretsKvHintCreate')}
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
                      />
                      <input
                        type="password"
                        className="console-kv-value"
                        placeholder={editItem ? t('connectors.secretLeaveBlank') : t('connectors.kvSecretValuePlaceholder')}
                        value={r.value}
                        onChange={(e) => updateSecretRow(r.id, 'value', e.target.value)}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="btn btn-secondary console-kv-remove"
                        onClick={() =>
                          setSecretRows((prev) => (prev.length <= 1 ? [newKvRow()] : prev.filter((x) => x.id !== r.id)))
                        }
                        aria-label={t('connectors.removeRow')}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-secondary console-kv-add" onClick={() => setSecretRows((prev) => [...prev, newKvRow()])}>
                    <Plus size={16} />
                    <span>{t('connectors.addSecretRow')}</span>
                  </button>
                </div>
              </div>

              <label className="console-modal-checkbox-row">
                <input type="checkbox" checked={formEnabled} onChange={(e) => setFormEnabled(e.target.checked)} />
                <span>{t('connectors.fieldEnabled')}</span>
              </label>
            </div>
            <div className="console-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => !submitting && setShowForm(false)} disabled={submitting}>
                {t('connectors.cancel')}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void handleSubmit()} disabled={submitting}>
                {submitting ? t('connectors.saving') : editItem ? t('connectors.update') : t('connectors.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
