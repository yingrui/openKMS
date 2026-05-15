import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, ListTodo, Search, RefreshCw, Loader2, Trash2, CircleX } from 'lucide-react';
import { toast } from 'sonner';
import { fetchJobs, createJob, retryJob, deleteJob, markJobFailed, type JobResponse } from '../../data/jobsApi';
import { fetchPipelines, type PipelineResponse } from '../../data/pipelinesApi';
import './Jobs.css';

function formatDate(iso: string | undefined | null, dash: string): string {
  if (!iso) return dash;
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Jobs() {
  const { t } = useTranslation('workspace');
  const navigate = useNavigate();
  const dash = t('shared.dash');
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [pipelines, setPipelines] = useState<PipelineResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [docIdInput, setDocIdInput] = useState('');
  const [pipelineIdInput, setPipelineIdInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [forceReparseCreate, setForceReparseCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobsRes, pipRes] = await Promise.all([fetchJobs({ limit: 100 }), fetchPipelines()]);
      setJobs(jobsRes.items);
      setPipelines(pipRes.items);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('jobs.loadFailed');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRetry = async (jobId: number) => {
    try {
      await retryJob(jobId);
      toast.success(t('jobs.retryQueued'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('jobs.retryFailed'));
    }
  };

  const handleMarkFailed = async (jobId: number) => {
    if (!window.confirm(t('jobs.markFailedConfirm'))) return;
    try {
      await markJobFailed(jobId);
      toast.success(t('jobs.markFailedToast'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('jobs.markFailedFailed'));
    }
  };

  const handleDelete = async (jobId: number) => {
    if (!window.confirm(t('jobs.deleteConfirm'))) return;
    try {
      await deleteJob(jobId);
      toast.success(t('jobs.deletedToast'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('shared.deleteFailed'));
    }
  };

  const handleCreate = async () => {
    if (!docIdInput.trim()) return;
    setSubmitting(true);
    try {
      await createJob({
        document_id: docIdInput.trim(),
        pipeline_id: pipelineIdInput || undefined,
        force_reparse: forceReparseCreate,
      });
      setShowCreate(false);
      setDocIdInput('');
      setPipelineIdInput('');
      setForceReparseCreate(false);
      toast.success(t('jobs.createdToast'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('jobs.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const pipelineMap = new Map(pipelines.map((p) => [p.id, p]));

  const filtered = jobs.filter((j) => {
    if (statusFilter && j.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const docId = String(j.args?.document_id || '');
      if (!j.task_name.toLowerCase().includes(s) && !docId.toLowerCase().includes(s)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="jobs">
      <div className="page-header jobs-header">
        <div>
          <h1>{t('jobs.title')}</h1>
          <p className="page-subtitle">{t('jobs.subtitle')}</p>
        </div>
        <div className="jobs-header-actions">
          <button type="button" className="btn btn-secondary" onClick={() => void load()} title={t('shared.refresh')}>
            <RefreshCw size={18} />
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={18} />
            <span>{t('jobs.newJob')}</span>
          </button>
        </div>
      </div>
      <div className="jobs-main">
        <div className="jobs-toolbar">
          <div className="jobs-search">
            <Search size={18} />
            <input
              type="search"
              aria-label={t('jobs.searchAria')}
              placeholder={t('jobs.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select aria-label={t('jobs.filterStatusAria')} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">{t('jobs.statusAll')}</option>
            <option value="pending">{t('jobs.statusPending')}</option>
            <option value="running">{t('jobs.statusRunning')}</option>
            <option value="completed">{t('jobs.statusCompleted')}</option>
            <option value="failed">{t('jobs.statusFailed')}</option>
          </select>
        </div>
        {error && <p className="jobs-error">{error}</p>}
        <div className="jobs-table-wrap">
          {loading ? (
            <div className="jobs-loading">
              <Loader2 size={32} className="jobs-loading-spinner" />
              <p>{t('jobs.loadingJobs')}</p>
            </div>
          ) : (
            <table className="jobs-table">
              <thead>
                <tr>
                  <th>{t('jobs.colId')}</th>
                  <th>{t('jobs.colTask')}</th>
                  <th>{t('jobs.colDocument')}</th>
                  <th>{t('jobs.colPipeline')}</th>
                  <th>{t('jobs.colStatus')}</th>
                  <th>{t('jobs.colCreated')}</th>
                  <th>{t('jobs.colAttempts')}</th>
                  <th className="jobs-table-actions-col">{t('shared.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
                      {jobs.length === 0 ? t('jobs.empty') : t('jobs.noMatches')}
                    </td>
                  </tr>
                ) : (
                  filtered.map((job) => {
                    const docId = String(job.args?.document_id || dash);
                    const pipelineId = String(job.args?.pipeline_id || '');
                    const pipeline = pipelineMap.get(pipelineId);
                    return (
                      <tr
                        key={job.id}
                        className="jobs-table-row-clickable"
                        onClick={() => navigate(`/jobs/${job.id}`)}
                      >
                        <td>#{job.id}</td>
                        <td>
                          <div className="jobs-table-name">
                            <ListTodo size={18} strokeWidth={1.5} />
                            <span>{job.task_name}</span>
                          </div>
                        </td>
                        <td className="jobs-table-docid" title={docId}>
                          {docId.length > 12 ? `${docId.slice(0, 10)}…` : docId}
                        </td>
                        <td>{pipeline?.name || pipelineId || dash}</td>
                        <td>
                          <span className={`job-status job-status-${job.status}`}>{job.status}</span>
                        </td>
                        <td>{formatDate(job.created_at, dash)}</td>
                        <td>{job.attempts}</td>
                        <td className="jobs-table-actions-col">
                          <div className="jobs-table-actions-btns">
                            {job.status === 'failed' && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleRetry(job.id);
                                }}
                                title={t('shared.retry')}
                              >
                                <RefreshCw size={14} />
                              </button>
                            )}
                            {(job.status === 'running' || job.status === 'pending') && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleMarkFailed(job.id);
                                }}
                                title={t('jobs.markFailedTitle')}
                              >
                                <CircleX size={14} />
                              </button>
                            )}
                            {job.status !== 'running' && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm jobs-delete-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDelete(job.id);
                                }}
                                title={t('shared.delete')}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
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
        <div className="jobs-modal-overlay" onClick={() => !submitting && setShowCreate(false)}>
          <div className="jobs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="jobs-modal-header">
              <h2>{t('jobs.modalTitle')}</h2>
            </div>
            <div className="jobs-modal-body">
              <label>
                {t('jobs.documentId')}
                <input
                  type="text"
                  value={docIdInput}
                  onChange={(e) => setDocIdInput(e.target.value)}
                  placeholder={t('jobs.documentPlaceholder')}
                />
              </label>
              <label>
                {t('jobs.pipeline')}
                <select value={pipelineIdInput} onChange={(e) => setPipelineIdInput(e.target.value)}>
                  <option value="">{t('jobs.pipelineDefault')}</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="jobs-modal-checkbox">
                <input
                  type="checkbox"
                  checked={forceReparseCreate}
                  onChange={(e) => setForceReparseCreate(e.target.checked)}
                  disabled={submitting}
                />
                <span title={t('jobs.forceFullReparseTitle')}>{t('jobs.forceFullReparse')}</span>
              </label>
            </div>
            <div className="jobs-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)} disabled={submitting}>
                {t('shared.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleCreate()}
                disabled={!docIdInput.trim() || submitting}
              >
                {submitting ? t('shared.creating') : t('jobs.createJob')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
