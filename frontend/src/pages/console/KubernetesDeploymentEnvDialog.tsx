import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  fetchDeploymentEnv,
  patchDeploymentEnv,
  type KubernetesContainerEnv,
  type KubernetesEnvFrom,
  type KubernetesEnvVar,
} from '../../data/kubernetesClustersApi';
import { Dialog, FormField } from '../../styles/design-system';

type Props = {
  open: boolean;
  onClose: () => void;
  clusterId: string;
  namespace: string;
  deployment: string | null;
};

type EnvKind = 'literal' | 'secret' | 'configmap';

type EnvRow = {
  name: string;
  kind: EnvKind;
  value: string;
  refName: string;
  refKey: string;
};

type FromRow = {
  kind: 'secret' | 'configmap';
  name: string;
  prefix: string;
};

function toRows(env: KubernetesEnvVar[]): EnvRow[] {
  return env.map((e) => {
    if (e.value_from?.secret_key_ref) {
      return {
        name: e.name,
        kind: 'secret' as const,
        value: '',
        refName: e.value_from.secret_key_ref.name,
        refKey: e.value_from.secret_key_ref.key,
      };
    }
    if (e.value_from?.config_map_key_ref) {
      return {
        name: e.name,
        kind: 'configmap' as const,
        value: '',
        refName: e.value_from.config_map_key_ref.name,
        refKey: e.value_from.config_map_key_ref.key,
      };
    }
    return {
      name: e.name,
      kind: 'literal' as const,
      value: e.value ?? '',
      refName: '',
      refKey: '',
    };
  });
}

function fromRows(envFrom: KubernetesEnvFrom[]): FromRow[] {
  return envFrom.map((e) => {
    if (e.secret_ref) {
      return { kind: 'secret' as const, name: e.secret_ref.name, prefix: e.prefix || '' };
    }
    return {
      kind: 'configmap' as const,
      name: e.config_map_ref?.name || '',
      prefix: e.prefix || '',
    };
  });
}

function rowsToEnv(rows: EnvRow[]): KubernetesEnvVar[] {
  return rows
    .filter((r) => r.name.trim())
    .map((r) => {
      if (r.kind === 'secret') {
        return {
          name: r.name.trim(),
          value_from: { secret_key_ref: { name: r.refName.trim(), key: r.refKey.trim() } },
        };
      }
      if (r.kind === 'configmap') {
        return {
          name: r.name.trim(),
          value_from: { config_map_key_ref: { name: r.refName.trim(), key: r.refKey.trim() } },
        };
      }
      return { name: r.name.trim(), value: r.value };
    });
}

function rowsToEnvFrom(rows: FromRow[]): KubernetesEnvFrom[] {
  return rows
    .filter((r) => r.name.trim())
    .map((r) => {
      if (r.kind === 'secret') {
        return { prefix: r.prefix || null, secret_ref: { name: r.name.trim() } };
      }
      return { prefix: r.prefix || null, config_map_ref: { name: r.name.trim() } };
    });
}

export function KubernetesDeploymentEnvDialog({
  open,
  onClose,
  clusterId,
  namespace,
  deployment,
}: Props) {
  const { t } = useTranslation('console');
  const [containers, setContainers] = useState<KubernetesContainerEnv[]>([]);
  const [container, setContainer] = useState('');
  const [envRows, setEnvRows] = useState<EnvRow[]>([]);
  const [fromRowsState, setFromRowsState] = useState<FromRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !deployment) return;
    setLoading(true);
    void fetchDeploymentEnv(clusterId, deployment, namespace)
      .then((res) => {
        setContainers(res.containers);
        const first = res.containers[0];
        setContainer(first?.name || '');
        setEnvRows(toRows(first?.env || []));
        setFromRowsState(fromRows(first?.env_from || []));
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : t('kubernetes.toastOperationFailed'));
        setContainers([]);
      })
      .finally(() => setLoading(false));
  }, [open, deployment, clusterId, namespace, t]);

  const selectContainer = (name: string) => {
    setContainer(name);
    const c = containers.find((x) => x.name === name);
    setEnvRows(toRows(c?.env || []));
    setFromRowsState(fromRows(c?.env_from || []));
  };

  const save = async () => {
    if (!deployment || !container) return;
    setSaving(true);
    try {
      await patchDeploymentEnv(
        clusterId,
        deployment,
        {
          container,
          env: rowsToEnv(envRows),
          env_from: rowsToEnvFrom(fromRowsState),
        },
        namespace
      );
      toast.success(t('kubernetes.envSaved'));
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('kubernetes.toastOperationFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      closeDisabled={saving}
      title={
        deployment
          ? t('kubernetes.envHeading', { name: deployment })
          : t('kubernetes.envTitle')
      }
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            {t('kubernetes.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void save()}
            disabled={saving || loading || !container}
          >
            {saving ? t('kubernetes.saving') : t('kubernetes.envSave')}
          </button>
        </>
      }
    >
      {loading ? (
        <p>{t('kubernetes.loading')}</p>
      ) : (
        <>
          <FormField label={t('kubernetes.envContainer')} htmlFor="k8s-env-container">
            <select
              id="k8s-env-container"
              value={container}
              onChange={(e) => selectContainer(e.target.value)}
              disabled={saving}
            >
              {containers.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
          <h3 className="console-k8s-env-subtitle">{t('kubernetes.envVarsHeading')}</h3>
          {envRows.map((row, idx) => (
            <div key={idx} className="console-k8s-env-row">
              <input
                type="text"
                placeholder="NAME"
                value={row.name}
                onChange={(e) =>
                  setEnvRows((rows) =>
                    rows.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r))
                  )
                }
                disabled={saving}
                spellCheck={false}
              />
              <select
                value={row.kind}
                onChange={(e) =>
                  setEnvRows((rows) =>
                    rows.map((r, i) =>
                      i === idx ? { ...r, kind: e.target.value as EnvKind } : r
                    )
                  )
                }
                disabled={saving}
              >
                <option value="literal">{t('kubernetes.envKindLiteral')}</option>
                <option value="secret">{t('kubernetes.envKindSecret')}</option>
                <option value="configmap">{t('kubernetes.envKindConfigMap')}</option>
              </select>
              {row.kind === 'literal' ? (
                <input
                  type="text"
                  value={row.value}
                  onChange={(e) =>
                    setEnvRows((rows) =>
                      rows.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r))
                    )
                  }
                  disabled={saving}
                />
              ) : (
                <>
                  <input
                    type="text"
                    placeholder={t('kubernetes.envRefName')}
                    value={row.refName}
                    onChange={(e) =>
                      setEnvRows((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, refName: e.target.value } : r))
                      )
                    }
                    disabled={saving}
                    spellCheck={false}
                  />
                  <input
                    type="text"
                    placeholder={t('kubernetes.envRefKey')}
                    value={row.refKey}
                    onChange={(e) =>
                      setEnvRows((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, refKey: e.target.value } : r))
                      )
                    }
                    disabled={saving}
                    spellCheck={false}
                  />
                </>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() =>
              setEnvRows((r) => [
                ...r,
                { name: '', kind: 'literal', value: '', refName: '', refKey: '' },
              ])
            }
            disabled={saving}
          >
            {t('kubernetes.envAddVar')}
          </button>

          <h3 className="console-k8s-env-subtitle">{t('kubernetes.envFromHeading')}</h3>
          <p className="page-subtitle">{t('kubernetes.envFromHint')}</p>
          {fromRowsState.map((row, idx) => (
            <div key={idx} className="console-k8s-env-row">
              <select
                value={row.kind}
                onChange={(e) =>
                  setFromRowsState((rows) =>
                    rows.map((r, i) =>
                      i === idx ? { ...r, kind: e.target.value as 'secret' | 'configmap' } : r
                    )
                  )
                }
                disabled={saving}
              >
                <option value="secret">{t('kubernetes.envKindSecret')}</option>
                <option value="configmap">{t('kubernetes.envKindConfigMap')}</option>
              </select>
              <input
                type="text"
                placeholder={t('kubernetes.envRefName')}
                value={row.name}
                onChange={(e) =>
                  setFromRowsState((rows) =>
                    rows.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r))
                  )
                }
                disabled={saving}
                spellCheck={false}
              />
              <input
                type="text"
                placeholder={t('kubernetes.envPrefix')}
                value={row.prefix}
                onChange={(e) =>
                  setFromRowsState((rows) =>
                    rows.map((r, i) => (i === idx ? { ...r, prefix: e.target.value } : r))
                  )
                }
                disabled={saving}
                spellCheck={false}
              />
            </div>
          ))}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() =>
              setFromRowsState((r) => [...r, { kind: 'secret', name: '', prefix: '' }])
            }
            disabled={saving}
          >
            {t('kubernetes.envAddFrom')}
          </button>
        </>
      )}
    </Dialog>
  );
}
