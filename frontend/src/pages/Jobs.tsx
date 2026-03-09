import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ListTodo, Search, RefreshCw, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchJobs, createJob, retryJob, deleteJob, type JobResponse } from '../data/jobsApi';
import { fetchPipelines, type PipelineResponse } from '../data/pipelinesApi';
import './Jobs.css';

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function Jobs() {
  const navigate = useNavigate();
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobsRes, pipRes] = await Promise.all([
        fetchJobs({ limit: 100 }),
        fetchPipelines(),
      ]);
      setJobs(jobsRes.items);
      setPipelines(pipRes.items);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load jobs';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRetry = async (jobId: number) => {
    try {
      await retryJob(jobId);
      toast.success('Job retry queued');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Retry failed');
    }
  };

  const handleDelete = async (jobId: number) => {
    if (!window.confirm('Delete this job? This cannot be undone.')) return;
    try {
      await deleteJob(jobId);
      toast.success('Job deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleCreate = async () => {
    if (!docIdInput.trim()) return;
    setSubmitting(true);
    try {
      await createJob({
        document_id: docIdInput.trim(),
        pipeline_id: pipelineIdInput || undefined,
      });
      setShowCreate(false);
      setDocIdInput('');
      setPipelineIdInput('');
      toast.success('Job created');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create job');
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
          <h1>Jobs</h1>
          <p className="page-subtitle">
            Document processing jobs. Create jobs to process uploaded documents via pipelines.
          </p>
        </div>
        <div className="jobs-header-actions">
          <button type="button" className="btn btn-secondary" onClick={load} title="Refresh">
            <RefreshCw size={18} />
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={18} />
            <span>New Job</span>
          </button>
        </div>
      </div>
      <div className="jobs-main">
        <div className="jobs-toolbar">
          <div className="jobs-search">
            <Search size={18} />
            <input
              type="search"
              aria-label="Search by document ID"
              placeholder="Search by document ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All status</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        {error && <p className="jobs-error">{error}</p>}
        <div className="jobs-table-wrap">
          {loading ? (
            <div className="jobs-loading">
              <Loader2 size={32} className="jobs-loading-spinner" />
              <p>Loading jobs…</p>
            </div>
          ) : (
            <table className="jobs-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Task</th>
                  <th>Document</th>
                  <th>Pipeline</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Attempts</th>
                  <th className="jobs-table-actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
                      {jobs.length === 0 ? 'No jobs yet. Create one to process a document.' : 'No matches found.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((job) => {
                    const docId = String(job.args?.document_id || '—');
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
                        <td>{pipeline?.name || pipelineId || '—'}</td>
                        <td>
                          <span className={`job-status job-status-${job.status}`}>{job.status}</span>
                        </td>
                        <td>{formatDate(job.created_at)}</td>
                        <td>{job.attempts}</td>
                        <td className="jobs-table-actions-col">
                          <div className="jobs-table-actions-btns">
                            {job.status === 'failed' && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={(e) => { e.stopPropagation(); handleRetry(job.id); }}
                                title="Retry"
                              >
                                <RefreshCw size={14} />
                              </button>
                            )}
                            {job.status !== 'running' && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm jobs-delete-btn"
                                onClick={(e) => { e.stopPropagation(); handleDelete(job.id); }}
                                title="Delete"
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
              <h2>New Job</h2>
            </div>
            <div className="jobs-modal-body">
              <label>
                Document ID
                <input
                  type="text"
                  value={docIdInput}
                  onChange={(e) => setDocIdInput(e.target.value)}
                  placeholder="Paste document ID"
                />
              </label>
              <label>
                Pipeline
                <select value={pipelineIdInput} onChange={(e) => setPipelineIdInput(e.target.value)}>
                  <option value="">Use channel default</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="jobs-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)} disabled={submitting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={!docIdInput.trim() || submitting}
              >
                {submitting ? 'Creating…' : 'Create Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
