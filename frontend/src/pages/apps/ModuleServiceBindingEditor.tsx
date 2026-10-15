import { useMemo, useState } from 'react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useTranslation } from 'react-i18next';
import { FormField } from '../../styles/design-system';
import {
  fetchClusterNamespaces,
  fetchClusterServices,
  fetchKubernetesClusters,
} from '../../data/kubernetesClustersApi';
import type { AppBuilderBindings } from '../../data/appBuilderApi';

type K8sBinding = NonNullable<AppBuilderBindings['k8s']>;

type Props = {
  initial: K8sBinding | null | undefined;
  saving: boolean;
  onSave: (k8s: K8sBinding) => void;
};

export function ModuleServiceBindingEditor({ initial, saving, onSave }: Props) {
  const { t } = useTranslation('apps');
  const [clusterId, setClusterId] = useState(initial?.cluster_id ?? '');
  const [namespace, setNamespace] = useState(initial?.namespace ?? 'default');
  const [service, setService] = useState(initial?.service ?? '');
  const [port, setPort] = useState(initial?.port ?? 80);
  const [path, setPath] = useState(initial?.path ?? '');

  // Three loaders, all of the "fetch when the inputs change" shape: `loading` is derived and a
  // failure is just the hook's `error`, so none of them set state synchronously.
  const { data: clustersData } = useAsyncData(
    async () => (await fetchKubernetesClusters({ limit: 200 })).items || [],
    [],
  );
  const clusters = clustersData ?? [];
  const { data: namespacesData, error: namespacesError } = useAsyncData(
    async () =>
      clusterId ? (await fetchClusterNamespaces(clusterId)).items.map((n) => n.name) : null,
    [clusterId],
  );
  const namespaces = namespacesData ?? null;
  const namespacesFailed = Boolean(namespacesError);
  const { data: servicesData, error: servicesError } = useAsyncData(
    async () =>
      clusterId && namespace.trim()
        ? (await fetchClusterServices(clusterId, namespace.trim())).items || []
        : null,
    [clusterId, namespace],
  );
  const services = servicesData ?? null;
  const servicesFailed = Boolean(servicesError);


  const namespaceOptions = useMemo(() => {
    const base = namespaces ?? [];
    const current = namespace.trim();
    if (current && !base.includes(current)) return [current, ...base];
    if (base.length === 0) return current ? [current] : ['default'];
    return base;
  }, [namespaces, namespace]);

  const selectedSvc = useMemo(
    () => (services || []).find((s) => s.name === service) ?? null,
    [services, service],
  );

  const portOptions = selectedSvc?.port_numbers?.length
    ? selectedSvc.port_numbers
    : null;

  const serviceOptions = useMemo(() => {
    const names = (services || []).map((s) => s.name);
    if (service && !names.includes(service)) return [service, ...names];
    return names;
  }, [services, service]);

  const canSave =
    !!clusterId.trim() &&
    !!namespace.trim() &&
    !!service.trim() &&
    port >= 1 &&
    port <= 65535;

  return (
    <div className="app-builder-module-service">
      <FormField label={t('settingsServiceCluster')} htmlFor="module-svc-cluster">
        <select
          id="module-svc-cluster"
          value={clusterId}
          onChange={(e) => {
            const id = e.target.value;
            setClusterId(id);
            const row = clusters.find((c) => c.id === id);
            if (row?.default_namespace) setNamespace(row.default_namespace);
            setService('');
          }}
          disabled={saving}
        >
          <option value="">{t('settingsServiceSelectCluster')}</option>
          {clusters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label={t('settingsServiceNamespace')} htmlFor="module-svc-ns">
        {namespacesFailed ? (
          <input
            id="module-svc-ns"
            type="text"
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            disabled={saving || !clusterId}
            spellCheck={false}
          />
        ) : (
          <select
            id="module-svc-ns"
            value={namespace}
            onChange={(e) => {
              setNamespace(e.target.value);
              setService('');
            }}
            disabled={saving || !clusterId || namespaces === null}
          >
            {namespaceOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
      </FormField>

      <FormField label={t('settingsServiceName')} htmlFor="module-svc-name">
        {servicesFailed || (services !== null && serviceOptions.length === 0 && !service) ? (
          <input
            id="module-svc-name"
            type="text"
            value={service}
            onChange={(e) => setService(e.target.value)}
            disabled={saving || !clusterId}
            spellCheck={false}
          />
        ) : (
          <select
            id="module-svc-name"
            value={service}
            onChange={(e) => {
              const name = e.target.value;
              setService(name);
              const svc = (services || []).find((s) => s.name === name);
              const ports = svc?.port_numbers;
              if (ports?.length) setPort(ports[0]);
            }}
            disabled={saving || !clusterId || services === null}
          >
            <option value="">{t('settingsServiceSelectService')}</option>
            {serviceOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
      </FormField>

      <FormField label={t('settingsServicePort')} htmlFor="module-svc-port">
        {portOptions ? (
          <select
            id="module-svc-port"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            disabled={saving}
          >
            {!portOptions.includes(port) ? (
              <option value={port}>{port}</option>
            ) : null}
            {portOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        ) : (
          <input
            id="module-svc-port"
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(e) => setPort(Number(e.target.value) || 80)}
            disabled={saving}
          />
        )}
      </FormField>

      <FormField label={t('settingsServicePath')} htmlFor="module-svc-path" hint={t('settingsServicePathHint')}>
        <input
          id="module-svc-path"
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          disabled={saving}
          spellCheck={false}
          placeholder="/"
        />
      </FormField>

      <div className="settings-page-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || !canSave}
          onClick={() => {
            const trimmedPath = path.trim();
            onSave({
              cluster_id: clusterId.trim(),
              namespace: namespace.trim(),
              service: service.trim(),
              port,
              ...(trimmedPath
                ? { path: trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}` }
                : {}),
            });
          }}
        >
          {saving ? t('saving') : t('settingsServiceSave')}
        </button>
      </div>
    </div>
  );
}
