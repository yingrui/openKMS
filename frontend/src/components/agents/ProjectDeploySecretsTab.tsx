import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createProjectDeploySecret,
  deleteProjectDeploySecret,
  listProjectDeploySecrets,
  syncProjectDeploySecret,
  updateProjectDeploySecret,
  type ProjectDeploySecretResponse,
} from '../../data/projectDeploySecretsApi';
import {
  fetchKubernetesClusters,
  type KubernetesClusterResponse,
} from '../../data/kubernetesClustersApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
  Dialog,
  FormField,
  TableRowActionButton,
  TableRowActionCell,
  TableRowActions,
} from '../../styles/design-system';

type KvRow = { key: string; value: string };

export function ProjectDeploySecretsTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation('agents');
  const confirm = useConfirm();
  const [items, setItems] = useState<ProjectDeploySecretResponse[]>([]);
  const [clusters, setClusters] = useState<KubernetesClusterResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState<ProjectDeploySecretResponse | null>(null);
  const [formName, setFormName] = useState('');
  const [formClusterId, setFormClusterId] = useState('');
  const [formNamespace, setFormNamespace] = useState('default');
  const [kvRows, setKvRows] = useState<KvRow[]>([{ key: '', value: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [secrets, clustersRes] = await Promise.all([
        listProjectDeploySecrets(projectId),
        fetchKubernetesClusters({ limit: 200 }).catch(() => ({ items: [] as KubernetesClusterResponse[] })),
      ]);
      setItems(secrets);
      setClusters(clustersRes.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settings.deployLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditRow(null);
    setFormName('');
    setFormClusterId(clusters[0]?.id ?? '');
    setFormNamespace(clusters[0]?.default_namespace || 'default');
    setKvRows([{ key: '', value: '' }]);
    setDialogOpen(true);
  };

  const openEdit = (row: ProjectDeploySecretResponse) => {
    setEditRow(row);
    setFormName(row.name);
    setFormClusterId(row.cluster_id || '');
    setFormNamespace(row.namespace || 'default');
    setKvRows(
      row.key_names.length
        ? row.key_names.map((k) => ({ key: k, value: '' }))
        : [{ key: '', value: '' }]
    );
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formClusterId) {
      toast.error(t('settings.deployClusterRequired'));
      return;
    }
    const values: Record<string, string> = {};
    for (const r of kvRows) {
      const k = r.key.trim();
      if (!k) continue;
      values[k] = r.value;
    }
    setSubmitting(true);
    try {
      if (editRow) {
        const remove_keys = editRow.key_names.filter((k) => !(k in values));
        const set_values: Record<string, string> = {};
        for (const [k, v] of Object.entries(values)) {
          if (v !== '' || !editRow.key_names.includes(k)) set_values[k] = v;
        }
        // Keep existing keys that user left blank
        for (const k of editRow.key_names) {
          if (k in values && values[k] === '') {
            // omit from set_values → backend keeps
          } else if (k in values) {
            set_values[k] = values[k];
          }
        }
        await updateProjectDeploySecret(projectId, editRow.id, {
          cluster_id: formClusterId,
          namespace: formNamespace,
          set_values,
          remove_keys,
        });
        toast.success(t('settings.deployUpdated'));
      } else {
        if (!formName.trim() || Object.keys(values).length === 0) {
          toast.error(t('settings.deployFieldsRequired'));
          setSubmitting(false);
          return;
        }
        if (Object.values(values).every((v) => !v)) {
          toast.error(t('settings.deployValuesRequired'));
          setSubmitting(false);
          return;
        }
        await createProjectDeploySecret(projectId, {
          name: formName.trim(),
          cluster_id: formClusterId,
          namespace: formNamespace,
          values,
        });
        toast.success(t('settings.deployCreated'));
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settings.deploySaveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSync = async (row: ProjectDeploySecretResponse) => {
    setSyncingId(row.id);
    try {
      await syncProjectDeploySecret(projectId, row.id);
      toast.success(t('settings.deploySynced'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settings.deploySyncFailed'));
      await load();
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (row: ProjectDeploySecretResponse) => {
    const ok = await confirm({
      title: t('settings.deployDeleteTitle'),
      message: t('settings.deployDeleteProjectOnly', { name: row.name }),
      confirmLabel: t('settings.deployDeleteSubmit'),
      danger: true,
    });
    if (!ok) return;
    const deleteInCluster = await confirm({
      title: t('settings.deployDeleteClusterTitle'),
      message: t('settings.deployDeleteClusterConfirm', { name: row.name }),
      confirmLabel: t('settings.deployDeleteAndCluster'),
      danger: true,
    });
    try {
      await deleteProjectDeploySecret(projectId, row.id, Boolean(deleteInCluster));
      toast.success(t('settings.deployDeleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settings.deployDeleteFailed'));
    }
  };

  const clusterName = (id: string | null) =>
    clusters.find((c) => c.id === id)?.name ?? id ?? '—';

  return (
    <section className="project-settings-section">
      <div className="project-settings-section-head">
        <div>
          <h2>{t('settings.deployHeading')}</h2>
          <p className="page-subtitle">{t('settings.deployHint')}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} aria-hidden />
          <span>{t('settings.deployNew')}</span>
        </button>
      </div>

      {loading ? (
        <div className="console-loading">
          <Loader2 size={24} className="console-loading-spinner" aria-hidden />
        </div>
      ) : (
        <div className="ds-table-wrap">
          <table className="project-settings-skills-table">
            <thead>
              <tr>
                <th>{t('settings.deployColName')}</th>
                <th>{t('settings.deployColCluster')}</th>
                <th>{t('settings.deployColNamespace')}</th>
                <th>{t('settings.deployColKeys')}</th>
                <th>{t('settings.deployColSync')}</th>
                <th>{t('settings.deployColActions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="console-table-empty">
                    {t('settings.deployEmpty')}
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                    </td>
                    <td>{clusterName(row.cluster_id)}</td>
                    <td>{row.namespace}</td>
                    <td>{row.key_names.join(', ') || '—'}</td>
                    <td>
                      {row.last_sync_error ? (
                        <span title={row.last_sync_error}>{t('settings.deploySyncError')}</span>
                      ) : row.last_synced_at ? (
                        new Date(row.last_synced_at).toLocaleString()
                      ) : (
                        t('settings.deployNeverSynced')
                      )}
                    </td>
                    <TableRowActionCell>
                      <TableRowActions>
                        <TableRowActionButton
                          title={t('settings.deploySync')}
                          aria-label={t('settings.deploySync')}
                          icon={
                            syncingId === row.id ? (
                              <Loader2 size={16} className="console-loading-spinner" aria-hidden />
                            ) : (
                              <RefreshCw size={16} aria-hidden />
                            )
                          }
                          onClick={() => void handleSync(row)}
                          disabled={syncingId === row.id}
                        />
                        <TableRowActionButton
                          title={t('settings.deployEdit')}
                          aria-label={t('settings.deployEdit')}
                          icon={<Pencil size={16} aria-hidden />}
                          onClick={() => openEdit(row)}
                        />
                        <TableRowActionButton
                          title={t('settings.deployDeleteTitle')}
                          aria-label={t('settings.deployDeleteTitle')}
                          icon={<Trash2 size={16} aria-hidden />}
                          onClick={() => void handleDelete(row)}
                          variant="danger"
                        />
                      </TableRowActions>
                    </TableRowActionCell>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onClose={() => !submitting && setDialogOpen(false)}
        closeDisabled={submitting}
        title={editRow ? t('settings.deployEditTitle') : t('settings.deployNewTitle')}
        size="md"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              {t('settings.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSave()}
              disabled={submitting}
            >
              {submitting ? t('settings.saving') : t('settings.save')}
            </button>
          </>
        }
      >
        <p className="page-subtitle">{t('settings.deployFormHint')}</p>
        <FormField label={t('settings.deployColName')} htmlFor="deploy-secret-name">
          <input
            id="deploy-secret-name"
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            disabled={!!editRow || submitting}
            spellCheck={false}
          />
        </FormField>
        <FormField label={t('settings.deployColCluster')} htmlFor="deploy-secret-cluster">
          <select
            id="deploy-secret-cluster"
            value={formClusterId}
            onChange={(e) => {
              setFormClusterId(e.target.value);
              const c = clusters.find((x) => x.id === e.target.value);
              if (c && !editRow) setFormNamespace(c.default_namespace || 'default');
            }}
            disabled={submitting || clusters.length === 0}
          >
            {clusters.length === 0 ? (
              <option value="">{t('settings.deployNoClusters')}</option>
            ) : (
              clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
        </FormField>
        <FormField label={t('settings.deployColNamespace')} htmlFor="deploy-secret-ns">
          <input
            id="deploy-secret-ns"
            type="text"
            value={formNamespace}
            onChange={(e) => setFormNamespace(e.target.value)}
            disabled={submitting}
            spellCheck={false}
          />
        </FormField>
        <div className="project-deploy-kv">
          <div className="project-deploy-kv__head">
            <span>{t('settings.deployKeysHeading')}</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setKvRows((rows) => [...rows, { key: '', value: '' }])}
              disabled={submitting}
            >
              {t('settings.deployAddKey')}
            </button>
          </div>
          {kvRows.map((row, idx) => (
            <div key={idx} className="project-deploy-kv__row">
              <input
                type="text"
                placeholder={t('settings.deployKeyPlaceholder')}
                value={row.key}
                onChange={(e) =>
                  setKvRows((rows) =>
                    rows.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r))
                  )
                }
                disabled={submitting}
                spellCheck={false}
              />
              <input
                type="password"
                placeholder={
                  editRow ? t('settings.deployValueKeepPlaceholder') : t('settings.deployValuePlaceholder')
                }
                value={row.value}
                onChange={(e) =>
                  setKvRows((rows) =>
                    rows.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r))
                  )
                }
                disabled={submitting}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setKvRows((rows) => rows.filter((_, i) => i !== idx))}
                disabled={submitting || kvRows.length <= 1}
              >
                {t('settings.deployRemoveKey')}
              </button>
            </div>
          ))}
        </div>
      </Dialog>
    </section>
  );
}
