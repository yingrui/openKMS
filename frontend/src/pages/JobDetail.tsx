import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Loader2, ListTodo, Clock, FileText, GitBranch } from 'lucide-react';
import { toast } from 'sonner';
import { fetchJobById, retryJob, type JobResponse } from '../data/jobsApi';
import { fetchPipelineById, type PipelineResponse } from '../data/pipelinesApi';
import './JobDetail.css';

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatDuration(startIso?: string | null, endIso?: string | null): string {
  if (!startIso || !endIso) return '—';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

export function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<JobResponse | null>(null);
  const [pipeline, setPipeline] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load job');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRetry = async () => {
    if (!job) return;
    setRetrying(true);
    try {
      await retryJob(job.id);
      toast.success('Job retry queued');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Retry failed');
    } finally {
      setRetrying(false);
    }
  };

  if (loading) {
    return (
      <div className="job-detail">
        <div className="job-detail-loading">
          <Loader2 size={32} className="job-detail-spinner" />
          <p>Loading job…</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="job-detail">
        <Link to="/jobs" className="job-detail-back"><ArrowLeft size={18} /> Back to Jobs</Link>
        <p className="job-detail-not-found">Job not found.</p>
      </div>
    );
  }

  const documentId = String(job.args?.document_id || '');
  const pipelineId = String(job.args?.pipeline_id || '');
  const commandTemplate = String(job.args?.command || '');
  const renderedCommand = String(job.args?.rendered_command || '');
  const defaultArgs = job.args?.default_args as Record<string, unknown> | null | undefined;

  return (
    <div className="job-detail">
      <Link to="/jobs" className="job-detail-back">
        <ArrowLeft size={18} />
        <span>Back to Jobs</span>
      </Link>

      <div className="job-detail-header">
        <div className="job-detail-title-row">
          <ListTodo size={24} />
          <h1>Job #{job.id}</h1>
          <span className={`job-status job-status-${job.status}`}>{job.status}</span>
        </div>
        <div className="job-detail-header-actions">
          <button type="button" className="btn btn-secondary" onClick={load} title="Refresh">
            <RefreshCw size={16} />
          </button>
          {job.status === 'failed' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRetry}
              disabled={retrying}
            >
              {retrying ? <Loader2 size={16} className="job-detail-spinner" /> : <RefreshCw size={16} />}
              <span>{retrying ? 'Retrying…' : 'Retry'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="job-detail-grid">
        <section className="job-detail-card">
          <h2><Clock size={18} /> Timing</h2>
          <dl className="job-detail-dl">
            <dt>Created</dt>
            <dd>{formatDateTime(job.created_at)}</dd>
            <dt>Scheduled</dt>
            <dd>{formatDateTime(job.scheduled_at)}</dd>
            <dt>Started</dt>
            <dd>{formatDateTime(job.started_at)}</dd>
            <dt>Finished</dt>
            <dd>{formatDateTime(job.finished_at)}</dd>
            <dt>Duration</dt>
            <dd>{formatDuration(job.started_at, job.finished_at)}</dd>
            <dt>Attempts</dt>
            <dd>{job.attempts}</dd>
          </dl>
        </section>

        <section className="job-detail-card">
          <h2><FileText size={18} /> Document</h2>
          <dl className="job-detail-dl">
            <dt>Document ID</dt>
            <dd>
              {documentId ? (
                <Link to={`/documents/view/${documentId}`} className="job-detail-link">
                  {documentId}
                </Link>
              ) : '—'}
            </dd>
            <dt>File Hash</dt>
            <dd className="job-detail-mono">{String(job.args?.file_hash || '—')}</dd>
            <dt>File Extension</dt>
            <dd>{String(job.args?.file_ext || '—')}</dd>
          </dl>
        </section>

        <section className="job-detail-card">
          <h2><GitBranch size={18} /> Pipeline</h2>
          <dl className="job-detail-dl">
            <dt>Pipeline</dt>
            <dd>{pipeline?.name || pipelineId || '—'}</dd>
            {pipeline?.description && (
              <>
                <dt>Description</dt>
                <dd>{pipeline.description}</dd>
              </>
            )}
            {renderedCommand && (
              <>
                <dt>Command</dt>
                <dd>
                  <pre className="job-detail-pre">{renderedCommand}</pre>
                </dd>
              </>
            )}
            {commandTemplate && (
              <>
                <dt>Template</dt>
                <dd className="job-detail-mono">{commandTemplate}</dd>
              </>
            )}
            {defaultArgs && Object.keys(defaultArgs).length > 0 && (
              <>
                <dt>Default Args</dt>
                <dd>
                  <pre className="job-detail-pre">{JSON.stringify(defaultArgs, null, 2)}</pre>
                </dd>
              </>
            )}
          </dl>
        </section>

        <section className="job-detail-card">
          <h2><ListTodo size={18} /> Task Info</h2>
          <dl className="job-detail-dl">
            <dt>Task Name</dt>
            <dd className="job-detail-mono">{job.task_name}</dd>
            <dt>Queue</dt>
            <dd>{job.queue_name}</dd>
          </dl>
        </section>
      </div>

      {job.events && job.events.length > 0 && (
        <section className="job-detail-card job-detail-events">
          <h2><Clock size={18} /> Event Log</h2>
          <table className="job-detail-events-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {job.events.map((ev, i) => (
                <tr key={i}>
                  <td>
                    <span className={`job-event-type job-event-type-${ev.type}`}>{ev.type}</span>
                  </td>
                  <td>{formatDateTime(ev.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
