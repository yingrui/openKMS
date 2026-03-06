import { useState } from 'react';
import { Plus, GitBranch, Search } from 'lucide-react';
import './Pipelines.css';

const pipelineCategories = [
  { id: 'information-extraction', name: 'Information Extraction' },
  { id: 'data-integration', name: 'Data Integration' },
  { id: 'crawler', name: 'Crawler' },
];

const mockPipelines = [
  { id: 'p1', name: 'docs.example.com crawl', type: 'Crawler', desc: 'Web crawler for documentation site', updated: '2 hours ago' },
  { id: 'p2', name: 'S3 PDF ingest', type: 'Crawler', desc: 'Ingest PDFs from S3 bucket', updated: '1 day ago' },
  { id: 'p3', name: 'Salesforce sync', type: 'Data Integration', desc: 'ETL from Salesforce to warehouse', updated: '3 hours ago' },
  { id: 'p4', name: 'MySQL → Elastic', type: 'Data Integration', desc: 'Sync MySQL to Elasticsearch', updated: '5 days ago' },
  { id: 'p5', name: 'PDF entity extraction', type: 'Information Extraction', desc: 'Extract entities from PDF documents', updated: '1 week ago' },
  { id: 'p6', name: 'Invoice parser', type: 'Information Extraction', desc: 'Structured extraction from invoices', updated: '2 days ago' },
];

const pipelineTypeToCategory: Record<string, string> = {
  'Crawler': 'crawler',
  'Data Integration': 'data-integration',
  'Information Extraction': 'information-extraction',
};

export function Pipelines() {
  const [selectedCategory, setSelectedCategory] = useState<string>('crawler');

  const filteredPipelines = mockPipelines.filter(
    (p) => pipelineTypeToCategory[p.type] === selectedCategory
  );

  return (
    <div className="pipelines">
      <div className="page-header pipelines-header">
        <div>
          <h1>Pipelines</h1>
          <p className="page-subtitle">
            Manage different types of pipelines: crawler, data integration, information extraction, and more.
          </p>
        </div>
        <button type="button" className="btn btn-primary">
          <Plus size={18} />
          <span>New Pipeline</span>
        </button>
      </div>
      <div className="pipelines-main">
        <div className="pipelines-categories">
          <h3>Categories</h3>
          <ul className="pipelines-category-list">
            {pipelineCategories.map((cat) => (
              <li key={cat.id}>
                <button
                  type="button"
                  className={`pipelines-category-item ${selectedCategory === cat.id ? 'selected' : ''}`}
                  onClick={() => setSelectedCategory(cat.id)}
                >
                  <GitBranch size={16} />
                  <span>{cat.name}</span>
                </button>
              </li>
            ))}
          </ul>
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
                {filteredPipelines.map((p) => (
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
    </div>
  );
}
