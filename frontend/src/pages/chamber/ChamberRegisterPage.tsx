import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check, Loader2, Server } from 'lucide-react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useAuth } from '../../contexts/AuthContext';
import { PERM_CONSOLE_KUBERNETES, PERM_ONTOLOGY_WRITE } from '../../config/permissions';
import { createChamberApp } from '../../data/chamberApi';
import {
  fetchClusterNamespaces,
  fetchClusterServices,
  fetchKubernetesClusters,
  type KubernetesClusterResponse,
  type KubernetesServiceItem,
} from '../../data/kubernetesClustersApi';
import { FormField } from '../../styles/design-system';
import { API_NAME_RE, firstPort, suggestApiName } from './registerDefaults';
import './ChamberPages.scss';

type Step = 0 | 1 | 2;

/** `useAsyncData` hands back `unknown`: a thrown string still has to be shown to a person. */
const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const STEPS = ['registerStepCluster', 'registerStepService', 'registerStepApp'] as const;

/**
 * Register a cluster Service as a Chamber app without leaving Chamber. The three inputs the backend needs
 * (cluster, namespace, Service) are the three steps; the last one names the app and opens it. Failure is a
 * step's content rather than an empty list: an unreachable cluster, a namespace with no Services and a
 * namespace that does not exist are three different sentences.
 */
export function ChamberRegisterPage() {
  const { t } = useTranslation('chamber');
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canRegister = hasPermission(PERM_ONTOLOGY_WRITE) && hasPermission(PERM_CONSOLE_KUBERNETES);

  const [step, setStep] = useState<Step>(0);
  const [cluster, setCluster] = useState<KubernetesClusterResponse | null>(null);
  const [namespace, setNamespace] = useState('');
  const [service, setService] = useState<KubernetesServiceItem | null>(null);
  const [name, setName] = useState('');
  const [apiName, setApiName] = useState('');
  const [port, setPort] = useState<number>(80);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [apiNameError, setApiNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    data: clustersData,
    error: clustersError,
    loading: clustersLoading,
  } = useAsyncData(
    async () => (await fetchKubernetesClusters({ limit: 200 })).items || [],
    [canRegister],
  );
  const clusters = clustersData ?? [];

  const {
    data: namespacesData,
    error: namespacesError,
    loading: namespacesLoading,
    reload: reloadNamespaces,
  } = useAsyncData(
    async () =>
      cluster ? (await fetchClusterNamespaces(cluster.id)).items.map((n) => n.name) : null,
    [cluster?.id],
  );
  const namespaces = namespacesData ?? null;

  const {
    data: servicesData,
    error: servicesError,
    loading: servicesLoading,
    reload: reloadServices,
  } = useAsyncData(
    async () =>
      cluster && namespace ? (await fetchClusterServices(cluster.id, namespace)).items || [] : null,
    [cluster?.id, namespace],
  );
  const services = servicesData ?? null;

  const canSubmit = useMemo(
    () => Boolean(name.trim() && apiName.trim() && API_NAME_RE.test(apiName.trim()) && port > 0),
    [name, apiName, port],
  );

  const pickService = (svc: KubernetesServiceItem) => {
    setService(svc);
    setName(svc.name);
    setApiName(suggestApiName(svc.name));
    setPort(firstPort(svc));
    setApiNameError(null);
    setFormError(null);
    setStep(2);
  };

  const submit = async () => {
    if (!cluster || !service) return;
    if (!API_NAME_RE.test(apiName.trim())) {
      setApiNameError(t('registerApiNameInvalid'));
      return;
    }
    setSubmitting(true);
    setApiNameError(null);
    setFormError(null);
    try {
      const app = await createChamberApp({
        name: name.trim(),
        api_name: apiName.trim(),
        description: description.trim() || undefined,
        template_id: 'module',
        bindings: {
          k8s: {
            cluster_id: cluster.id,
            namespace,
            service: service.name,
            port,
          },
        },
      });
      // Registering exists to open the app; stopping on the list would break the journey one step short.
      navigate(`/chamber/${app.id}`, { replace: true });
    } catch (e) {
      const message = errorText(e);
      // 409 is the only failure the user can fix on this form without leaving it.
      if (/exist|duplicate|409/i.test(message)) setApiNameError(t('registerApiNameTaken'));
      else setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!canRegister) {
    return (
      <div className="chamber-page chamber-register">
        <Link to="/chamber" className="chamber-page__back">
          <ArrowLeft size={18} />
          <span>{t('backToGallery')}</span>
        </Link>
        <div className="page-header">
          <h1>{t('registerTitle')}</h1>
        </div>
        <p className="chamber-page__error" role="alert">
          {t('registerNoPermission')}
        </p>
      </div>
    );
  }

  return (
    <div className="chamber-page chamber-register">
      <Link to="/chamber" className="chamber-page__back">
        <ArrowLeft size={18} />
        <span>{t('backToGallery')}</span>
      </Link>

      <header className="page-header">
        <h1>{t('registerTitle')}</h1>
        <p className="page-subtitle">{t('registerSubtitle')}</p>
      </header>

      <ol className="chamber-register__steps" aria-label={t('registerTitle')}>
        {STEPS.map((key, index) => {
          // Built from variables, not inline comparisons: the shared-class checker scrapes className
          // template literals and a bare `step` inside one reads as a page-shared class name.
          const isCurrent = index === step;
          const isDone = index < step;
          return (
            <li
              key={key}
              className={`chamber-register__step${isCurrent ? ' is-current' : ''}${isDone ? ' is-done' : ''}`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span className="chamber-register__index" aria-hidden>
                {index < step ? <Check size={14} /> : index + 1}
              </span>
              <span>{t(key)}</span>
            </li>
          );
        })}
      </ol>

      <div className="chamber-register__pane">
        {step === 0 ? (
          <section className="chamber-register__section">
            <h2>{t('registerStepCluster')}</h2>
            {clustersLoading ? <p>{t('loading')}</p> : null}
            {clustersError ? (
              <p className="chamber-page__error" role="alert">
                {errorText(clustersError)}
              </p>
            ) : null}
            {!clustersLoading && !clustersError && !clusters.length ? (
              <p className="settings-page-hint">{t('registerNoClusters')}</p>
            ) : null}
            <div className="chamber-register__list">
              {clusters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`chamber-register__option${
                    cluster?.id === item.id ? ' is-selected' : ''
                  }`}
                  onClick={() => {
                    setCluster(item);
                    setNamespace(item.default_namespace || '');
                    setService(null);
                    setStep(1);
                  }}
                >
                  <Server size={16} aria-hidden />
                  <span className="chamber-register__option-main">{item.name}</span>
                  <span className="chamber-register__option-meta">
                    {item.api_server || t('registerClusterNoApiServer')}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="chamber-register__section">
            <h2>{t('registerStepService')}</h2>
            <p className="settings-page-hint">
              {cluster?.name}
              {namespace ? ` · ${namespace}` : ''}
            </p>
            {namespacesError || servicesError ? (
              // An unreachable cluster used to render as an empty Service list, which reads as "this cluster
              // has none". Say what happened and offer the retry instead.
              <div className="chamber-page__error" role="alert">
                <p>{errorText(namespacesError ?? servicesError)}</p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    reloadNamespaces();
                    reloadServices();
                  }}
                >
                  {t('retry')}
                </button>
              </div>
            ) : null}
            {namespacesLoading ? <p>{t('loading')}</p> : null}
            {namespaces && namespaces.length > 0 ? (
              <FormField label={t('registerNamespace')} htmlFor="chamber-register-ns">
                <select
                  id="chamber-register-ns"
                  value={namespace}
                  onChange={(e) => {
                    setNamespace(e.target.value);
                    setService(null);
                  }}
                >
                  {namespaces.map((ns) => (
                    <option key={ns} value={ns}>
                      {ns}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : null}
            {namespaces && !namespaces.length ? (
              <p className="settings-page-hint">{t('registerNoNamespaces')}</p>
            ) : null}

            {servicesLoading ? <p>{t('loading')}</p> : null}
            {services && !services.length ? (
              <p className="settings-page-hint">{t('registerNoServices')}</p>
            ) : null}
            <div className="chamber-register__list">
              {(services ?? []).map((svc) => (
                <button
                  key={`${svc.namespace}/${svc.name}`}
                  type="button"
                  className="chamber-register__option"
                  onClick={() => pickService(svc)}
                >
                  <span className="chamber-register__option-main">{svc.name}</span>
                  <span className="chamber-register__option-meta">
                    {svc.type}
                    {svc.ports ? ` · ${svc.ports}` : ''}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {step === 2 && cluster && service ? (
          <section className="chamber-register__section">
            <h2>{t('registerStepApp')}</h2>
            <p className="settings-page-hint">
              {cluster.name} · {namespace}/{service.name}:{port}
            </p>
            <FormField label={t('name')} htmlFor="chamber-register-name">
              <input
                id="chamber-register-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
              />
            </FormField>
            <FormField
              label={t('apiName')}
              htmlFor="chamber-register-api"
              hint={t('registerApiNameHint')}
            >
              <input
                id="chamber-register-api"
                type="text"
                value={apiName}
                onChange={(e) => {
                  setApiName(e.target.value);
                  setApiNameError(null);
                }}
                disabled={submitting}
              />
            </FormField>
            {apiNameError ? (
              <p className="chamber-page__error" role="alert">
                {apiNameError}
              </p>
            ) : null}
            <FormField label={t('registerPort')} htmlFor="chamber-register-port">
              <input
                id="chamber-register-port"
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(Number(e.target.value) || 0)}
                disabled={submitting}
              />
            </FormField>
            <FormField label={t('description')} htmlFor="chamber-register-desc">
              <textarea
                id="chamber-register-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={submitting}
              />
            </FormField>
            {formError ? (
              <p className="chamber-page__error" role="alert">
                {formError}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>

      <div className="chamber-register__actions">
        {step > 0 ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setStep((s) => (s === 2 ? 1 : 0))}
            disabled={submitting}
          >
            <ArrowLeft size={16} />
            <span>{t('back')}</span>
          </button>
        ) : (
          <span />
        )}
        {step === 2 ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void submit()}
            disabled={submitting || !canSubmit}
          >
            {submitting ? <Loader2 size={16} className="ds-loading__spinner" /> : null}
            {submitting ? t('registerSubmitting') : t('registerSubmit')}
          </button>
        ) : step === 1 ? (
          // Picking a Service is the action here — it moves to the form — so there is no "next" to press.
          <span />
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setStep(1)}
            disabled={!cluster}
          >
            <span>{t('next')}</span>
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
