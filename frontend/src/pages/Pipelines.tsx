import { Plus, GitBranch, Search } from 'lucide-react';
import './Pipelines.css';

const mockPipelines = [
  { id: 'p1', name: 'PDF entity extraction', desc: 'Extract entities from PDF documents', updated: '1 week ago' },
  { id: 'p2', name: 'Invoice parser', desc: 'Structured extraction from invoices', updated: '2 days ago' },
];

export function Pipelines() {
  return (
    <div className="pipelines">
      <div className="page-header pipelines-header">
        <div>
          <h1>Pipelines</h1>
          <p className="page-subtitle">
            Manage information extraction pipelines for structured extraction from documents.
          </p>
        </div>
        <button type="button" className="btn btn-primary">
          <Plus size={18} />
          <span>New Pipeline</span>
        </button>
      </div>
      <div className="pipelines-content">
        <div className="pipelines-toolbar">
          <div className="pipelines-search">
            <Search size={18} />
            <input type="search" placeholder="Search pipelines..." />
          </div>
        </div>
        <div className="pipelines-table-wrap">
          <table className="pipelines-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {mockPipelines.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="pipelines-table-name">
                        <GitBranch size={18} strokeWidth={1.5} />
                        <span>{p.name}</span>
                      </div>
                    </td>
                    <td>{p.desc}</td>
                    <td>{p.updated}</td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
