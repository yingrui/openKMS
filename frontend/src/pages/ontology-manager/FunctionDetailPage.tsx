import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  executeOntologyFunction,
  fetchFunctionExecutions,
  fetchOntologyFunction,
  publishOntologyFunction,
  type OntologyFunctionExecutionResponse,
  type OntologyFunctionResponse,
} from '../../data/ontologyFunctionsApi';
import { EntityViewLoading, EntityViewShell } from './EntityViewShell';
import '../ontology/ontology-admin.scss';

type FunctionDetailContext = {
  fn: OntologyFunctionResponse;
  executions: OntologyFunctionExecutionResponse[];
  publishing: boolean;
  onPublish: () => Promise<void>;
  onTestPublished: () => Promise<void>;
  reload: () => Promise<void>;
};

const FunctionDetailCtx = createContext<FunctionDetailContext | null>(null);

function useFunctionDetail(): FunctionDetailContext {
  const ctx = useContext(FunctionDetailCtx);
  if (!ctx) throw new Error('useFunctionDetail requires FunctionDetailPage');
  return ctx;
}

export function FunctionDetailPage() {
  const { t } = useTranslation('ontology');
  const { functionId = '' } = useParams();
  const [fn, setFn] = useState<OntologyFunctionResponse | null>(null);
  const [executions, setExecutions] = useState<OntologyFunctionExecutionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    if (!functionId) return;
    setLoading(true);
    try {
      const [f, ex] = await Promise.all([
        fetchOntologyFunction(functionId),
        fetchFunctionExecutions(functionId),
      ]);
      setFn(f);
      setExecutions(ex);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('functions.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [functionId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onPublish = useCallback(async () => {
    if (!functionId) return;
    setPublishing(true);
    try {
      const updated = await publishOntologyFunction(functionId);
      setFn(updated);
      toast.success(t('functions.published'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('functions.publishFailed'));
    } finally {
      setPublishing(false);
    }
  }, [functionId, t]);

  const onTestPublished = useCallback(async () => {
    if (!functionId) return;
    try {
      const res = await executeOntologyFunction(functionId, {}, { use_published: true });
      if (res.status === 'ok') toast.success(JSON.stringify(res.output));
      else toast.error(res.error || t('functions.runFailed'));
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('functions.runFailed'));
    }
  }, [functionId, load, t]);

  const value = useMemo(
    () =>
      fn
        ? { fn, executions, publishing, onPublish, onTestPublished, reload: load }
        : null,
    [fn, executions, publishing, onPublish, onTestPublished, load],
  );

  if (loading || !fn || !value) {
    return <EntityViewLoading label={t('shared.loading')} />;
  }

  const base = `/ontology-manager/functions/${functionId}`;

  return (
    <FunctionDetailCtx.Provider value={value}>
      <EntityViewShell
        backTo="/ontology-manager/functions"
        backLabel={t('functions.backToList')}
        title={fn.display_name}
        meta={fn.api_name}
        navItems={[
          { to: base, label: t('functions.overview'), end: true },
          { to: `${base}/observability`, label: t('functions.observability') },
        ]}
      >
        <Outlet />
      </EntityViewShell>
    </FunctionDetailCtx.Provider>
  );
}

export function FunctionOverviewTab() {
  const { t } = useTranslation('ontology');
  const { fn, publishing, onPublish, onTestPublished } = useFunctionDetail();

  return (
    <>
      <header className="page-header">
        <div>
          <h1>{t('functions.overview')}</h1>
          <p className="page-subtitle">{fn.description || t('functions.noDescription')}</p>
        </div>
        <div className="entity-view__actions">
          <Link to={`/function-editor/${fn.id}`} className="btn btn-secondary">
            <ExternalLink size={16} aria-hidden />
            {t('functions.openInEditor')}
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => void onPublish()} disabled={publishing}>
            <Upload size={16} aria-hidden />
            {publishing ? t('shared.saving') : t('functions.publish')}
          </button>
        </div>
      </header>
      <dl className="entity-view__dl">
        <dt>{t('functions.publishedVersion')}</dt>
        <dd>{fn.published_version ?? '—'}</dd>
        <dt>{t('functions.latestVersion')}</dt>
        <dd>{fn.latest_version ?? '—'}</dd>
        <dt>{t('functions.developmentStatus')}</dt>
        <dd>{fn.development_status}</dd>
      </dl>
      {fn.published_version_id && (
        <button type="button" className="btn btn-secondary" onClick={() => void onTestPublished()}>
          {t('functions.testPublished')}
        </button>
      )}
    </>
  );
}

export function FunctionObservabilityTab() {
  const { t } = useTranslation('ontology');
  const { executions } = useFunctionDetail();

  return (
    <section className="entity-view__section" style={{ marginTop: 0 }}>
      <header className="page-header">
        <div>
          <h1>{t('functions.observability')}</h1>
          <p className="page-subtitle">{t('functions.recentExecutions')}</p>
        </div>
      </header>
      <div className="ds-table-wrap">
        <table className="console-table">
          <thead>
            <tr>
              <th>{t('functions.execStatus')}</th>
              <th>{t('functions.execDuration')}</th>
              <th>{t('functions.execTime')}</th>
              <th>{t('functions.execError')}</th>
            </tr>
          </thead>
          <tbody>
            {executions.length === 0 ? (
              <tr>
                <td colSpan={4} className="console-table-empty">
                  {t('functions.noExecutions')}
                </td>
              </tr>
            ) : (
              executions.map((ex) => (
                <tr key={ex.id}>
                  <td>{ex.status}</td>
                  <td className="console-table-muted">
                    {ex.duration_ms != null ? `${ex.duration_ms}ms` : '—'}
                  </td>
                  <td className="console-table-muted">{new Date(ex.created_at).toLocaleString()}</td>
                  <td className="console-table-muted">{ex.error_message || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
