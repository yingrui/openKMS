import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Loader2, ListTodo, Clock, FileText, GitBranch, Cpu, Terminal, CircleX, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { fetchJobById, markJobFailed, retryJob, type JobResponse } from '../../data/jobsApi';
import { fetchPipelineById, type PipelineResponse } from '../../data/pipelinesApi';
import { fetchModelById, type ApiModelResponse } from '../../data/modelsApi';
import './JobDetail.css';

function formatDateTime(iso: string | undefined | null, dash: string): string {
  if (!iso) return dash;
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(startIso?: string | null, endIso?: string | null, dash = '—'): string {
  if (!startIso || !endIso) return dash;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

export function JobDetail() {
  const { t } = useTranslation('workspace');
  const dash = t('shared.dash');
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<JobResponse | null>(null);
  const [pipeline, setPipeline] = useState<PipelineResponse | null>(null);
  const [model, setModel] = useState<ApiModelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [markingFailed, setMarkingFailed] = useState(false);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const j = await fetchJobById(Number(jobId));
      setJob(j);
      const pipelineId = String(j.args?.pipeline_id || '');
      if (pipelineId) {
        try {
          const p = await fetchPipelineById(pipelineId);
          setPipeline(p);
        } catch {
          setPipeline(null);
        }
      }
      const modelId = String(j.args?.model_id || '');
      if (modelId) {
        try {
          const m = await fetchModelById(modelId);
          setModel(m);
        } catch {
          setModel(null);
        }
      } else {
        setModel(null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('jobDetail.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [jobId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRetry = async () => {
    if (!job) return;
    setRetrying(true);
    try {
      await retryJob(job.id);
      toast.success(t('jobDetail.retryQueued'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('jobs.retryFailed'));
    } finally {
      setRetrying(false);
    }
  };

  const handleMarkFailed = async () => {
    if (!job) return;
    if (!window.confirm(t('jobs.markFailedConfirm'))) return;
    setMarkingFailed(true);
    try {
      await markJobFailed(job.id);
      toast.success(t('jobs.markFailedToast'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('jobs.markFailedFailed'));
    } finally {
      setMarkingFailed(false);
    }
  };

  if (loading) {
    return (
      <div className="job-detail">
        <div className="job-detail-loading">
          <Loader2 size={32} className="job-detail-spinner" />
          <p>{t('jobDetail.loading')}</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="job-detail">
        <Link to="/jobs" className="job-detail-back">
          <ArrowLeft size={18} /> {t('jobDetail.back')}
        </Link>
        <p className="job-detail-not-found">{t('jobDetail.notFound')}</p>
      </div>
    );
  }

  const documentId = String(job.args?.document_id || '');
  const knowledgeBaseId = String(job.args?.knowledge_base_id || '');
  const pipelineId = String(job.args?.pipeline_id || '');
  const commandTemplate = String(job.args?.command || '');
  const renderedCommand = String(job.args?.rendered_command || '');
  const defaultArgs = job.args?.default_args as Record<string, unknown> | null | undefined;
  const isKbIndex = job.task_name === 'run_kb_index';

  return (
    <div className="job-detail">
      <Link to="/jobs" className="job-detail-back">
        <ArrowLeft size={18} />
        <span>{t('jobDetail.back')}</span>
      </Link>

      <div className="job-detail-header">
        <div className="job-detail-title-row">
          <ListTodo size={24} />
          <h1>{t('jobDetail.title', { id: job.id })}</h1>
          <span className={`job-status job-status-${job.status}`}>{job.status}</span>
        </div>
        <div className="job-detail-header-actions">
          <button type="button" className="btn btn-secondary" onClick={() => void load()} title={t('shared.refresh')}>
            <RefreshCw size={16} />
          </button>
          {(job.status === 'running' || job.status === 'pending') && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void handleMarkFailed()}
              disabled={markingFailed}
              title={t('jobs.markFailedTitle')}
            >
              {markingFailed ? <Loader2 size={16} className="job-detail-spinner" /> : <CircleX size={16} />}
              <span>{markingFailed ? t('jobs.markingFailed') : t('jobs.markFailed')}</span>
            </button>
          )}
          {job.status === 'failed' && (
            <button type="button" className="btn btn-primary" onClick={() => void handleRetry()} disabled={retrying}>
              {retrying ? <Loader2 size={16} className="job-detail-spinner" /> : <RefreshCw size={16} />}
              <span>{retrying ? t('jobDetail.retrying') : t('shared.retry')}</span>
            </button>
          )}
        </div>
      </div>

      <div className="job-detail-grid">
        <section className="job-detail-card">
          <h2>
            <Clock size={18} /> {t('jobDetail.timing')}
          </h2>
          <dl className="job-detail-dl">
            <dt>{t('jobDetail.created')}</dt>
            <dd>{formatDateTime(job.created_at, dash)}</dd>
            <dt>{t('jobDetail.scheduled')}</dt>
            <dd>{formatDateTime(job.scheduled_at, dash)}</dd>
            <dt>{t('jobDetail.started')}</dt>
            <dd>{formatDateTime(job.started_at, dash)}</dd>
            <dt>{t('jobDetail.finished')}</dt>
            <dd>{formatDateTime(job.finished_at, dash)}</dd>
            <dt>{t('jobDetail.duration')}</dt>
            <dd>{formatDuration(job.started_at, job.finished_at, dash)}</dd>
            <dt>{t('jobDetail.attempts')}</dt>
            <dd>{job.attempts}</dd>
          </dl>
        </section>

        <section className="job-detail-card">
          <h2>
            {isKbIndex ? <BookOpen size={18} /> : <FileText size={18} />}{' '}
            {isKbIndex ? t('jobDetail.knowledgeBase') : t('jobDetail.document')}
          </h2>
          <dl className="job-detail-dl">
            {isKbIndex ? (
              <>
                <dt>{t('jobDetail.knowledgeBaseId')}</dt>
                <dd>
                  {knowledgeBaseId ? (
                    <Link to={`/knowledge-bases/${knowledgeBaseId}`} className="job-detail-link">
                      {knowledgeBaseId}
                    </Link>
                  ) : (
                    dash
                  )}
                </dd>
              </>
            ) : (
              <>
                <dt>{t('jobDetail.documentId')}</dt>
                <dd>
                  {documentId ? (
                    <Link to={`/documents/view/${documentId}`} className="job-detail-link">
                      {documentId}
                    </Link>
                  ) : (
                    dash
                  )}
                </dd>
                <dt>{t('jobDetail.fileHash')}</dt>
                <dd className="job-detail-mono">{String(job.args?.file_hash || dash)}</dd>
                <dt>{t('jobDetail.fileExtension')}</dt>
                <dd>{String(job.args?.file_ext || dash)}</dd>
              </>
            )}
          </dl>
        </section>

        {!isKbIndex && (
        <section className="job-detail-card">
          <h2>
            <GitBranch size={18} /> {t('jobDetail.pipeline')}
          </h2>
          <dl className="job-detail-dl">
            <dt>{t('jobDetail.pipeline')}</dt>
            <dd>{pipeline?.name || pipelineId || dash}</dd>
            {pipeline?.description && (
              <>
                <dt>{t('shared.description')}</dt>
                <dd>{pipeline.description}</dd>
              </>
            )}
            {renderedCommand && (
              <>
                <dt>{t('jobDetail.command')}</dt>
                <dd>
                  <pre className="job-detail-pre">{renderedCommand}</pre>
                </dd>
              </>
            )}
            {commandTemplate && (
              <>
                <dt>{t('jobDetail.template')}</dt>
                <dd className="job-detail-mono">{commandTemplate}</dd>
              </>
            )}
            {defaultArgs && Object.keys(defaultArgs).length > 0 && (
              <>
                <dt>{t('jobDetail.defaultArgs')}</dt>
                <dd>
                  <pre className="job-detail-pre">{JSON.stringify(defaultArgs, null, 2)}</pre>
                </dd>
              </>
            )}
          </dl>
        </section>
        )}

        {model && (
          <section className="job-detail-card">
            <h2>
              <Cpu size={18} /> {t('jobDetail.model')}
            </h2>
            <dl className="job-detail-dl">
              <dt>{t('shared.name')}</dt>
              <dd>{model.name}</dd>
              <dt>{t('jobDetail.provider')}</dt>
              <dd>{model.provider_name}</dd>
              <dt>{t('jobDetail.category')}</dt>
              <dd>{model.category}</dd>
              <dt>{t('jobDetail.baseUrl')}</dt>
              <dd className="job-detail-mono">{model.base_url}</dd>
              {model.model_name && (
                <>
                  <dt>{t('jobDetail.modelName')}</dt>
                  <dd className="job-detail-mono">{model.model_name}</dd>
                </>
              )}
            </dl>
          </section>
        )}

        <section className="job-detail-card">
          <h2>
            <ListTodo size={18} /> {t('jobDetail.taskInfo')}
          </h2>
          <dl className="job-detail-dl">
            <dt>{t('jobDetail.taskName')}</dt>
            <dd className="job-detail-mono">{job.task_name}</dd>
            <dt>{t('jobDetail.queue')}</dt>
            <dd>{job.queue_name}</dd>
          </dl>
        </section>
      </div>

      {job.worker_log != null && job.worker_log !== '' && (
        <section className="job-detail-card job-detail-worker-log">
          <div className="job-detail-worker-log-heading">
            <h2>
              <Terminal size={18} /> {t('jobDetail.workerLog')}
            </h2>
            {job.worker_log_truncated && (
              <span className="job-detail-worker-log-badge">{t('jobDetail.workerLogTruncatedBadge')}</span>
            )}
          </div>
          {job.worker_log_char_limit != null && job.worker_log_char_limit > 0 && (
            <p className="job-detail-worker-log-meta">
              {t('jobDetail.workerLogLimit', { limit: job.worker_log_char_limit.toLocaleString() })}
            </p>
          )}
          <pre className="job-detail-pre job-detail-worker-log-pre">{job.worker_log}</pre>
        </section>
      )}

      {job.events && job.events.length > 0 && (
        <section className="job-detail-card job-detail-events">
          <h2>
            <Clock size={18} /> {t('jobDetail.eventLog')}
          </h2>
          <table className="job-detail-events-table">
            <thead>
              <tr>
                <th>{t('jobDetail.event')}</th>
                <th>{t('jobDetail.timestamp')}</th>
              </tr>
            </thead>
            <tbody>
              {job.events.map((ev, i) => (
                <tr key={i}>
                  <td>
                    <span className={`job-event-type job-event-type-${ev.type}`}>{ev.type}</span>
                  </td>
                  <td>{formatDateTime(ev.at, dash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
