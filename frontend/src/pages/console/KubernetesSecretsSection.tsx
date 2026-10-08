import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteClusterConfigMap,
  deleteClusterSecret,
  fetchClusterConfigMaps,
  fetchClusterSecrets,
  upsertClusterConfigMap,
  upsertClusterSecret,
  type KubernetesConfigMapItem,
  type KubernetesSecretItem,
} from '../../data/kubernetesClustersApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
  Dialog,
  FormField,
  TableRowActionButton,
  TableRowActionCell,
  TableRowActions,
} from '../../styles/design-system';
import {
  KubernetesDetailTabs,
  KubernetesResourceYamlPanel,
  type KubernetesDetailTab,
} from './KubernetesResourceYamlPanel';

type KvRow = { key: string; value: string };

type Props = {
  clusterId: string;
  namespace: string;
  loadingResources: boolean;
};

export function KubernetesSecretsSection({ clusterId, namespace, loadingResources }: Props) {
  const { t } = useTranslation('console');
  const confirm = useConfirm();
  const [secrets, setSecrets] = useState<KubernetesSecretItem[]>([]);
  const [configmaps, setConfigmaps] = useState<KubernetesConfigMapItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [secretOpen, setSecretOpen] = useState(false);
  const [editSecret, setEditSecret] = useState<KubernetesSecretItem | null>(null);
  const [secretName, setSecretName] = useState('');
  const [secretRows, setSecretRows] = useState<KvRow[]>([{ key: '', value: '' }]);
  const [secretSubmitting, setSecretSubmitting] = useState(false);
  const [viewSecret, setViewSecret] = useState<KubernetesSecretItem | null>(null);
  const [secretTab, setSecretTab] = useState<KubernetesDetailTab>('overview');

  const [cmOpen, setCmOpen] = useState(false);
  const [editCm, setEditCm] = useState<KubernetesConfigMapItem | null>(null);
  const [cmName, setCmName] = useState('');
  const [cmRows, setCmRows] = useState<KvRow[]>([{ key: '', value: '' }]);
  const [cmSubmitting, setCmSubmitting] = useState(false);
  const [viewCm, setViewCm] = useState<KubernetesConfigMapItem | null>(null);
  const [cmTab, setCmTab] = useState<KubernetesDetailTab>('overview');

  const load = useCallback(async () => {
    if (!clusterId || !namespace) return;
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        fetchClusterSecrets(clusterId, namespace),
        fetchClusterConfigMaps(clusterId, namespace),
      ]);
      setSecrets(s.items);
      setConfigmaps(c.items);
    } catch (e) {
      setSecrets([]);
      setConfigmaps([]);
      toast.error(e instanceof Error ? e.message : t('kubernetes.browseLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, t]);

  useEffect(() => {
    if (!loadingResources) void load();
  }, [loadingResources, load]);

  const openNewSecret = () => {
    setEditSecret(null);
    setSecretName('');
    setSecretRows([{ key: '', value: '' }]);
    setSecretOpen(true);
  };

  const openEditSecret = (row: KubernetesSecretItem) => {
    if (row.managed_by_project_id) {
      toast.error(t('kubernetes.secretProjectManaged', { project: row.managed_by_project_id }));
      return;
    }
    setEditSecret(row);
    setSecretName(row.name);
    setSecretRows(row.keys.map((k) => ({ key: k, value: '' })));
    setSecretOpen(true);
  };

  const saveSecret = async () => {
    const name = (editSecret?.name || secretName).trim();
    if (!name) {
      toast.error(t('kubernetes.secretNameRequired'));
      return;
    }
    const set_values: Record<string, string> = {};
    for (const r of secretRows) {
      if (!r.key.trim()) continue;
      set_values[r.key.trim()] = r.value;
    }
    const remove_keys = editSecret
      ? editSecret.keys.filter((k) => !(k in set_values))
      : [];
    // Keep blanks as keep-existing for edit
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(set_values)) {
      if (!editSecret || v !== '' || !editSecret.keys.includes(k)) payload[k] = v;
      else if (v !== '') payload[k] = v;
    }
    setSecretSubmitting(true);
    try {
      await upsertClusterSecret(
        clusterId,
        name,
        { set_values: payload, remove_keys },
        namespace
      );
      toast.success(t('kubernetes.secretSaved'));
      setSecretOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('kubernetes.toastOperationFailed'));
    } finally {
      setSecretSubmitting(false);
    }
  };

  const removeSecret = async (row: KubernetesSecretItem) => {
    if (row.managed_by_project_id) {
      toast.error(t('kubernetes.secretProjectManaged', { project: row.managed_by_project_id }));
      return;
    }
    const ok = await confirm({
      title: t('kubernetes.secretDeleteTitle'),
      message: t('kubernetes.secretDeleteConfirm', { name: row.name }),
      confirmLabel: t('kubernetes.deleteTitle'),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteClusterSecret(clusterId, row.name, namespace);
      toast.success(t('kubernetes.toastResourceDeleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('kubernetes.toastOperationFailed'));
    }
  };

  const openNewCm = () => {
    setEditCm(null);
    setCmName('');
    setCmRows([{ key: '', value: '' }]);
    setCmOpen(true);
  };

  const openEditCm = (row: KubernetesConfigMapItem) => {
    setEditCm(row);
    setCmName(row.name);
    setCmRows(
      Object.keys(row.data).length
        ? Object.entries(row.data).map(([key, value]) => ({ key, value }))
        : [{ key: '', value: '' }]
    );
    setCmOpen(true);
  };

  const saveCm = async () => {
    const name = (editCm?.name || cmName).trim();
    if (!name) {
      toast.error(t('kubernetes.cmNameRequired'));
      return;
    }
    const set_values: Record<string, string> = {};
    for (const r of cmRows) {
      if (!r.key.trim()) continue;
      set_values[r.key.trim()] = r.value;
    }
    const remove_keys = editCm ? editCm.keys.filter((k) => !(k in set_values)) : [];
    setCmSubmitting(true);
    try {
      await upsertClusterConfigMap(clusterId, name, { set_values, remove_keys }, namespace);
      toast.success(t('kubernetes.cmSaved'));
      setCmOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('kubernetes.toastOperationFailed'));
    } finally {
      setCmSubmitting(false);
    }
  };

  const removeCm = async (row: KubernetesConfigMapItem) => {
    const ok = await confirm({
      title: t('kubernetes.cmDeleteTitle'),
      message: t('kubernetes.cmDeleteConfirm', { name: row.name }),
      confirmLabel: t('kubernetes.deleteTitle'),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteClusterConfigMap(clusterId, row.name, namespace);
      toast.success(t('kubernetes.toastResourceDeleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('kubernetes.toastOperationFailed'));
    }
  };

  const busy = loading || loadingResources;

  return (
    <>
      <section className="console-k8s-section" aria-labelledby="k8s-secrets-heading">
        <div className="console-k8s-section__head">
          <h2 id="k8s-secrets-heading" className="console-k8s-section__title">
            {t('kubernetes.secretsHeading')}
          </h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={openNewSecret}>
            <Plus size={14} aria-hidden />
            {t('kubernetes.secretNew')}
          </button>
        </div>
        <p className="page-subtitle">{t('kubernetes.secretsHint')}</p>
        <div className="ds-table-wrap">
          <table className="console-table">
            <thead>
              <tr>
                <th>{t('kubernetes.colResourceName')}</th>
                <th>{t('kubernetes.colKeys')}</th>
                <th>{t('kubernetes.colManagedBy')}</th>
                <th>{t('kubernetes.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <tr>
                  <td colSpan={4} className="console-table-empty">
                    {t('kubernetes.loading')}
                  </td>
                </tr>
              ) : secrets.length === 0 ? (
                <tr>
                  <td colSpan={4} className="console-table-empty">
                    {t('kubernetes.secretsEmpty')}
                  </td>
                </tr>
              ) : (
                secrets.map((s) => (
                  <tr key={s.name}>
                    <td>
                      <button
                        type="button"
                        className="console-k8s-name-link"
                        onClick={() => {
                          setSecretTab('overview');
                          setViewSecret(s);
                        }}
                      >
                        <strong>{s.name}</strong>
                      </button>
                    </td>
                    <td>{s.keys.join(', ') || t('kubernetes.dash')}</td>
                    <td>
                      {s.managed_by_project_id
                        ? t('kubernetes.secretManagedByProject', { project: s.managed_by_project_id })
                        : t('kubernetes.dash')}
                    </td>
                    <TableRowActionCell>
                      <TableRowActions>
                        <TableRowActionButton
                          title={t('kubernetes.viewTitle')}
                          aria-label={t('kubernetes.viewTitle')}
                          icon={<Eye size={16} aria-hidden />}
                          onClick={() => {
                            setSecretTab('overview');
                            setViewSecret(s);
                          }}
                        />
                        <TableRowActionButton
                          title={t('kubernetes.editTitle')}
                          aria-label={t('kubernetes.editTitle')}
                          icon={<Pencil size={16} aria-hidden />}
                          onClick={() => openEditSecret(s)}
                        />
                        <TableRowActionButton
                          title={t('kubernetes.deleteTitle')}
                          aria-label={t('kubernetes.deleteTitle')}
                          icon={<Trash2 size={16} aria-hidden />}
                          onClick={() => void removeSecret(s)}
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
      </section>

      <section className="console-k8s-section" aria-labelledby="k8s-cm-heading">
        <div className="console-k8s-section__head">
          <h2 id="k8s-cm-heading" className="console-k8s-section__title">
            {t('kubernetes.configmapsHeading')}
          </h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={openNewCm}>
            <Plus size={14} aria-hidden />
            {t('kubernetes.cmNew')}
          </button>
        </div>
        <div className="ds-table-wrap">
          <table className="console-table">
            <thead>
              <tr>
                <th>{t('kubernetes.colResourceName')}</th>
                <th>{t('kubernetes.colKeys')}</th>
                <th>{t('kubernetes.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <tr>
                  <td colSpan={3} className="console-table-empty">
                    {t('kubernetes.loading')}
                  </td>
                </tr>
              ) : configmaps.length === 0 ? (
                <tr>
                  <td colSpan={3} className="console-table-empty">
                    {t('kubernetes.configmapsEmpty')}
                  </td>
                </tr>
              ) : (
                configmaps.map((c) => (
                  <tr key={c.name}>
                    <td>
                      <button
                        type="button"
                        className="console-k8s-name-link"
                        onClick={() => {
                          setCmTab('overview');
                          setViewCm(c);
                        }}
                      >
                        <strong>{c.name}</strong>
                      </button>
                    </td>
                    <td>{c.keys.join(', ') || t('kubernetes.dash')}</td>
                    <TableRowActionCell>
                      <TableRowActions>
                        <TableRowActionButton
                          title={t('kubernetes.viewTitle')}
                          aria-label={t('kubernetes.viewTitle')}
                          icon={<Eye size={16} aria-hidden />}
                          onClick={() => {
                            setCmTab('overview');
                            setViewCm(c);
                          }}
                        />
                        <TableRowActionButton
                          title={t('kubernetes.editTitle')}
                          aria-label={t('kubernetes.editTitle')}
                          icon={<Pencil size={16} aria-hidden />}
                          onClick={() => openEditCm(c)}
                        />
                        <TableRowActionButton
                          title={t('kubernetes.deleteTitle')}
                          aria-label={t('kubernetes.deleteTitle')}
                          icon={<Trash2 size={16} aria-hidden />}
                          onClick={() => void removeCm(c)}
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
      </section>

      <Dialog
        open={!!viewSecret}
        onClose={() => setViewSecret(null)}
        title={
          viewSecret
            ? t('kubernetes.secretDetailTitle', { name: viewSecret.name })
            : t('kubernetes.viewTitle')
        }
        size="lg"
        footer={
          <button type="button" className="btn btn-secondary" onClick={() => setViewSecret(null)}>
            {t('kubernetes.cancel')}
          </button>
        }
      >
        {viewSecret ? (
          <>
            <KubernetesDetailTabs tab={secretTab} onTabChange={setSecretTab} />
            {secretTab === 'yaml' ? (
              <KubernetesResourceYamlPanel
                active
                clusterId={clusterId}
                namespace={namespace}
                kind="Secret"
                name={viewSecret.name}
              />
            ) : (
              <>
                <p className="page-subtitle">{t('kubernetes.secretDetailHint')}</p>
                <dl className="console-k8s-detail-dl">
                  <div>
                    <dt>{t('kubernetes.colResourceName')}</dt>
                    <dd>{viewSecret.name}</dd>
                  </div>
                  <div>
                    <dt>{t('kubernetes.colManagedBy')}</dt>
                    <dd>
                      {viewSecret.managed_by_project_id
                        ? t('kubernetes.secretManagedByProject', {
                            project: viewSecret.managed_by_project_id,
                          })
                        : t('kubernetes.dash')}
                    </dd>
                  </div>
                </dl>
                <h3 className="console-k8s-env-subtitle">{t('kubernetes.colKeys')}</h3>
                {viewSecret.keys.length === 0 ? (
                  <p className="page-subtitle">{t('kubernetes.dash')}</p>
                ) : (
                  <ul className="console-k8s-detail-list">
                    {viewSecret.keys.map((k) => (
                      <li key={k} className="ds-control--mono">
                        {k}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        ) : null}
      </Dialog>

      <Dialog
        open={!!viewCm}
        onClose={() => setViewCm(null)}
        title={
          viewCm
            ? t('kubernetes.cmDetailTitle', { name: viewCm.name })
            : t('kubernetes.viewTitle')
        }
        size="lg"
        footer={
          <button type="button" className="btn btn-secondary" onClick={() => setViewCm(null)}>
            {t('kubernetes.cancel')}
          </button>
        }
      >
        {viewCm ? (
          <>
            <KubernetesDetailTabs tab={cmTab} onTabChange={setCmTab} />
            {cmTab === 'yaml' ? (
              <KubernetesResourceYamlPanel
                active
                clusterId={clusterId}
                namespace={namespace}
                kind="ConfigMap"
                name={viewCm.name}
              />
            ) : (
              <>
                <dl className="console-k8s-detail-dl">
                  <div>
                    <dt>{t('kubernetes.colResourceName')}</dt>
                    <dd>{viewCm.name}</dd>
                  </div>
                </dl>
                <h3 className="console-k8s-env-subtitle">{t('kubernetes.colKeys')}</h3>
                {viewCm.keys.length === 0 ? (
                  <p className="page-subtitle">{t('kubernetes.dash')}</p>
                ) : (
                  <div className="console-k8s-detail-kv">
                    {Object.entries(viewCm.data).map(([key, value]) => (
                      <div key={key} className="console-k8s-detail-kv__row">
                        <div className="console-k8s-detail-kv__key ds-control--mono">{key}</div>
                        <pre className="console-k8s-detail-kv__value">{value}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        ) : null}
      </Dialog>

      <Dialog
        open={secretOpen}
        onClose={() => !secretSubmitting && setSecretOpen(false)}
        closeDisabled={secretSubmitting}
        title={editSecret ? t('kubernetes.secretEditTitle') : t('kubernetes.secretNewTitle')}
        size="md"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setSecretOpen(false)}
              disabled={secretSubmitting}
            >
              {t('kubernetes.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void saveSecret()}
              disabled={secretSubmitting}
            >
              {secretSubmitting ? t('kubernetes.saving') : t('kubernetes.update')}
            </button>
          </>
        }
      >
        <p className="page-subtitle">{t('kubernetes.secretFormHint')}</p>
        <FormField label={t('kubernetes.colResourceName')}>
          <input
            type="text"
            value={secretName}
            onChange={(e) => setSecretName(e.target.value)}
            disabled={!!editSecret || secretSubmitting}
            spellCheck={false}
          />
        </FormField>
        {secretRows.map((row, idx) => (
          <div key={idx} className="console-k8s-kv-row">
            <input
              type="text"
              placeholder="KEY"
              value={row.key}
              onChange={(e) =>
                setSecretRows((rows) =>
                  rows.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r))
                )
              }
              disabled={secretSubmitting}
              spellCheck={false}
            />
            <input
              type="password"
              placeholder={editSecret ? t('kubernetes.secretKeepHint') : t('kubernetes.secretValueHint')}
              value={row.value}
              onChange={(e) =>
                setSecretRows((rows) =>
                  rows.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r))
                )
              }
              disabled={secretSubmitting}
              autoComplete="new-password"
            />
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setSecretRows((r) => [...r, { key: '', value: '' }])}
          disabled={secretSubmitting}
        >
          {t('kubernetes.addKey')}
        </button>
      </Dialog>

      <Dialog
        open={cmOpen}
        onClose={() => !cmSubmitting && setCmOpen(false)}
        closeDisabled={cmSubmitting}
        title={editCm ? t('kubernetes.cmEditTitle') : t('kubernetes.cmNewTitle')}
        size="md"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCmOpen(false)}
              disabled={cmSubmitting}
            >
              {t('kubernetes.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void saveCm()}
              disabled={cmSubmitting}
            >
              {cmSubmitting ? t('kubernetes.saving') : t('kubernetes.update')}
            </button>
          </>
        }
      >
        <FormField label={t('kubernetes.colResourceName')}>
          <input
            type="text"
            value={cmName}
            onChange={(e) => setCmName(e.target.value)}
            disabled={!!editCm || cmSubmitting}
            spellCheck={false}
          />
        </FormField>
        {cmRows.map((row, idx) => (
          <div key={idx} className="console-k8s-kv-row">
            <input
              type="text"
              placeholder="KEY"
              value={row.key}
              onChange={(e) =>
                setCmRows((rows) =>
                  rows.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r))
                )
              }
              disabled={cmSubmitting}
              spellCheck={false}
            />
            <textarea
              className="ds-control--mono"
              rows={2}
              value={row.value}
              onChange={(e) =>
                setCmRows((rows) =>
                  rows.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r))
                )
              }
              disabled={cmSubmitting}
            />
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setCmRows((r) => [...r, { key: '', value: '' }])}
          disabled={cmSubmitting}
        >
          {t('kubernetes.addKey')}
        </button>
      </Dialog>
    </>
  );
}
