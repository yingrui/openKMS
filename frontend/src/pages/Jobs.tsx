import { Plus, ListTodo, Search } from 'lucide-react';
import './Jobs.css';

const mockJobs = [
  { id: 'j3', pipeline: 'Info Extraction - PDF batch', executor: 'local', status: 'pending', started: '—' },
  { id: 'j2', pipeline: 'Data Integration - Salesforce', executor: 'k8s-worker-1', status: 'completed', started: '1 hour ago' },
  { id: 'j1', pipeline: 'Crawler - docs.example.com', executor: 'local', status: 'running', started: '2 min ago' },
];

export function Jobs() {
  return (
    <div className="jobs">
      <div className="page-header jobs-header">
        <div>
          <h1>Jobs</h1>
          <p className="page-subtitle">
            Jobs from pipelines. Manage where pipelines execute and track status.
          </p>
        </div>
        <button type="button" className="btn btn-primary">
          <Plus size={18} />
          <span>New Job</span>
        </button>
      </div>
      <div className="jobs-main">
        <div className="jobs-toolbar">
          <div className="jobs-search">
            <Search size={18} />
            <input type="search" placeholder="Search jobs..." />
          </div>
          <select aria-label="Filter by status">
            <option>All status</option>
            <option>Running</option>
            <option>Completed</option>
            <option>Pending</option>
          </select>
        </div>
        <div className="jobs-table-wrap">
          <table className="jobs-table">
            <thead>
              <tr>
                <th>Pipeline</th>
                <th>Executor</th>
                <th>Status</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {mockJobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <div className="jobs-table-name">
                      <ListTodo size={18} strokeWidth={1.5} />
                      <span>{job.pipeline}</span>
                    </div>
                  </td>
                  <td>{job.executor}</td>
                  <td>
                    <span className={`job-status job-status-${job.status}`}>{job.status}</span>
                  </td>
                  <td>{job.started}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
