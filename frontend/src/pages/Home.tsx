import { FileStack, FileText, Database } from 'lucide-react';
import { Link } from 'react-router-dom';
import './Home.css';

const stats = [
  { label: 'Documents', value: '42', icon: FileStack, color: 'teal', path: '/documents' },
  { label: 'Articles', value: '28', icon: FileText, color: 'blue', path: '/articles' },
  { label: 'Knowledge Bases', value: '3', icon: Database, color: 'green', path: '/knowledge-bases' },
];

const recentActivity = [
  { title: 'User_Guide.pdf', type: 'Document', time: '2 min ago', path: '/documents' },
  { title: 'API Authentication', type: 'Article', time: '15 min ago', path: '/articles' },
  { title: 'Product KB', type: 'Knowledge Base', time: '2 hours ago', path: '/knowledge-bases/kb1' },
];

export function Home() {
  return (
    <div className="home">
      <div className="page-header">
        <h1>Home</h1>
        <p className="page-subtitle">
          Documents and articles in channel trees (like Google Drive), plus knowledge bases with RAG Q&A.
        </p>
      </div>
      <section className="home-stats">
        {stats.map(({ label, value, icon: Icon, color, path }) => (
          <Link key={label} to={path} className={`stat-card stat-card-${color}`}>
            <div className="stat-icon">
              <Icon size={24} strokeWidth={1.75} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{value}</span>
              <span className="stat-label">{label}</span>
            </div>
          </Link>
        ))}
      </section>
      <div className="home-grid">
        <section className="home-card">
          <h2>Recent Activity</h2>
          <ul className="activity-list">
            {recentActivity.map(({ title, type, time, path }) => (
              <li key={title}>
                <Link to={path} className="activity-item">
                  <span className="activity-title">{title}</span>
                  <span className="activity-meta">
                    {type} · {time}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="home-card">
          <h2>Quick Actions</h2>
          <div className="quick-actions">
            <Link to="/documents" className="quick-action">
              <FileStack size={20} />
              <span>Upload Document</span>
            </Link>
            <Link to="/articles" className="quick-action">
              <FileText size={20} />
              <span>New Article</span>
            </Link>
            <Link to="/knowledge-bases" className="quick-action">
              <Database size={20} />
              <span>New Knowledge Base</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
