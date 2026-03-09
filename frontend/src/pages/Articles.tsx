import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  FileText,
  Plus,
  Search,
  Pencil,
  FolderInput,
  Copy,
  Trash2,
  Folder,
} from 'lucide-react';
import { defaultArticleChannel, getArticleLeafChannelIds } from '../data/channels';
import './Articles.css';

interface ArticleItem {
  id: string;
  title: string;
  slug: string;
  author: string;
  status: string;
  updated: string;
  fields: Record<string, string>;
}

const mockArticlesByChannel: Record<string, ArticleItem[]> = {
  ac1a: [
    { id: '1', title: 'Life vs Term: Key Product Differences', slug: 'life-vs-term', author: 'Sales Lead', status: 'Published', updated: '2 hours ago', fields: { category: 'Sales', tags: 'product, life' } },
  ],
  ac1b: [
    { id: '2', title: 'Handling Premium Objections', slug: 'premium-objections', author: 'Sales Lead', status: 'Published', updated: '1 day ago', fields: { category: 'Sales', tags: 'objection, pricing' } },
  ],
  ac2a: [
    { id: '3', title: 'Risk Scoring Criteria', slug: 'risk-scoring', author: 'UW Manager', status: 'Published', updated: '3 days ago', fields: { category: 'Underwriting', tags: 'risk' } },
  ],
  ac2b: [
    { id: '4', title: 'Approval Authority Matrix', slug: 'approval-matrix', author: 'UW Manager', status: 'Published', updated: '1 week ago', fields: { category: 'Underwriting', tags: 'approval' } },
  ],
  ac3a: [
    { id: '5', title: 'Claims Intake Checklist', slug: 'claims-intake', author: 'Ops Lead', status: 'Published', updated: '5 days ago', fields: { category: 'Operation', tags: 'claims' } },
  ],
  ac3b: [
    { id: '6', title: 'Renewal Notice Timeline', slug: 'renewal-timeline', author: 'Ops Lead', status: 'Published', updated: '2 days ago', fields: { category: 'Operation', tags: 'renewal' } },
  ],
  root: [],
  ac1: [],
  ac2: [],
  ac3: [],
};

export function Articles() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const channelId = searchParams.get('channel') || defaultArticleChannel;
  const leafIds = getArticleLeafChannelIds(channelId);
  const articles = leafIds.flatMap((id) => mockArticlesByChannel[id] ?? []);

  return (
    <div className="articles">
      <div className="page-header articles-header">
        <div>
          <h1>Articles</h1>
          <p className="page-subtitle">
            Select a channel in the sidebar. CMS-style articles with content and fields.
          </p>
        </div>
        <button type="button" className="btn btn-primary">
          <Plus size={18} />
          <span>New Article</span>
        </button>
      </div>
      <div className="articles-main">
        <div className="articles-toolbar">
          <div className="articles-search">
            <Search size={18} />
            <input type="search" aria-label="Search in channel" placeholder="Search in channel..." />
          </div>
          <select aria-label="Filter by status">
            <option>All status</option>
            <option>Published</option>
            <option>Draft</option>
          </select>
        </div>
        <div className="articles-table-wrap">
          {articles.length > 0 ? (
            <table className="articles-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Slug</th>
                  <th>Author</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Category</th>
                  <th className="articles-table-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((article) => (
                  <tr
                    key={article.id}
                    className="articles-table-row-clickable"
                    onClick={() => navigate(`/articles/view/${article.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/articles/view/${article.id}`)}
                  >
                    <td>
                      <div className="articles-table-title">
                        <FileText size={18} strokeWidth={1.5} />
                        <span>{article.title}</span>
                      </div>
                    </td>
                    <td>{article.slug}</td>
                    <td>{article.author}</td>
                    <td>
                      <span className={`article-status article-status-${article.status.toLowerCase()}`}>
                        {article.status}
                      </span>
                    </td>
                    <td>{article.updated}</td>
                    <td>{article.fields.category ?? '—'}</td>
                    <td className="articles-table-actions" onClick={(e) => e.stopPropagation()}>
                      <div className="articles-table-btns">
                        <button type="button" title="Edit" aria-label="Edit">
                          <Pencil size={16} />
                        </button>
                        <button type="button" title="Move" aria-label="Move to channel">
                          <FolderInput size={16} />
                        </button>
                        <button type="button" title="Duplicate" aria-label="Duplicate">
                          <Copy size={16} />
                        </button>
                        <button type="button" title="Delete" aria-label="Delete">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="articles-empty">
              <Folder size={48} />
              <p>No articles in this channel</p>
              <p className="articles-empty-hint">Create or move articles here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
