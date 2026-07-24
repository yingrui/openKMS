import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ExternalLink, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  executeOntologyFunction,
  fetchFunctionExecutions,
  fetchOntologyFunction,
  publishOntologyFunction,
  type OntologyFunctionExecutionResponse,
  type OntologyFunctionResponse,
} from '../../data/ontologyFunctionsApi';
import '../ontology/ontology-admin.scss';
import './entity-view.scss';

type DetailTab = 'overview' | 'observability';

export function FunctionDetailPage() {
  const { t } = useTranslation('ontology');
  const { functionId = '' } = useParams();
  const navigate = useNavigate();
  const [fn, setFn] = useState<OntologyFunctionResponse | null>(null);
  const [executions, setExecutions] = useState<OntologyFunctionExecutionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [tab, setTab] = useState<DetailTab>('overview');

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

  const onPublish = async () => {
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
  };

  const onTestPublished = async () => {
    if (!functionId) return;
    try {
      const res = await executeOntologyFunction(functionId, {}, { use_published: true });
      if (res.status === 'ok') toast.success(JSON.stringify(res.output));
      else toast.error(res.error || t('functions.runFailed'));
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('functions.runFailed'));
    }
  };

  if (loading || !fn) {
    return (
      <p className="ontology-admin-loading">
        <Loader2 className="spin" size={18} aria-hidden /> {t('shared.loading')}
      </p>
    );
  }

  return (
    <div className="entity-view">
      <aside className="entity-view__sidebar">
        <button type="button" className="entity-view__back" onClick={() => navigate('/ontology-manager/functions')}>
          <ArrowLeft size={16} aria-hidden />
          {t('functions.backToList')}
        </button>
        <h2 className="entity-view__title">{fn.display_name}</h2>
        <p className="entity-view__meta">{fn.api_name}</p>
        <nav className="entity-view__nav">
          <button
            type="button"
            className={`entity-view__nav-item${tab === 'overview' ? ' entity-view__nav-item--active' : ''}`}
            onClick={() => setTab('overview')}
          >
            {t('functions.overview')}
          </button>
          <button
            type="button"
            className={`entity-view__nav-item${tab === 'observability' ? ' entity-view__nav-item--active' : ''}`}
            onClick={() => setTab('observability')}
          >
            {t('functions.observability')}
          </button>
        </nav>
      </aside>
      <div className="entity-view__main">
        {tab === 'overview' && (
          <>
            <header className="page-header">
              <div>
                <h1>{fn.display_name}</h1>
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
        )}
        {tab === 'observability' && (
          <section className="entity-view__section">
            <header className="page-header">
              <div>
                <h1>{t('functions.observability')}</h1>
                <p className="page-subtitle">{t('functions.recentExecutions')}</p>
              </div>
            </header>
            <div className="ontology-admin-table-wrap">
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
                        <td className="console-table-muted">{ex.duration_ms != null ? `${ex.duration_ms}ms` : '—'}</td>
                        <td className="console-table-muted">{new Date(ex.created_at).toLocaleString()}</td>
                        <td className="console-table-muted">{ex.error_message || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
