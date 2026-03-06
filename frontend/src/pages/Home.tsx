import { FileStack, FileText, Database } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useFeatureToggles } from '../contexts/FeatureTogglesContext';
import './Home.css';

const allStats = [
  { label: 'Documents', value: '42', icon: FileStack, color: 'teal', path: '/documents', feature: null as 'articles' | 'knowledgeBases' | null },
  { label: 'Articles', value: '28', icon: FileText, color: 'blue', path: '/articles', feature: 'articles' as const },
  { label: 'Knowledge Bases', value: '3', icon: Database, color: 'green', path: '/knowledge-bases', feature: 'knowledgeBases' as const },
];

const allActivity = [
  { title: 'User_Guide.pdf', type: 'Document', time: '2 min ago', path: '/documents', feature: null as 'articles' | 'knowledgeBases' | null },
  { title: 'API Authentication', type: 'Article', time: '15 min ago', path: '/articles', feature: 'articles' as const },
  { title: 'Product KB', type: 'Knowledge Base', time: '2 hours ago', path: '/knowledge-bases/kb1', feature: 'knowledgeBases' as const },
];

const allQuickActions = [
  { label: 'Upload Document', icon: FileStack, path: '/documents', feature: null as 'articles' | 'knowledgeBases' | null },
  { label: 'New Article', icon: FileText, path: '/articles', feature: 'articles' as const },
  { label: 'New Knowledge Base', icon: Database, path: '/knowledge-bases', feature: 'knowledgeBases' as const },
];

export function Home() {
  const { isEnabled } = useFeatureToggles();

  const visibleStats = allStats.filter((s) => !s.feature || isEnabled(s.feature));
  const visibleActivity = allActivity.filter((a) => !a.feature || isEnabled(a.feature));
  const visibleQuickActions = allQuickActions.filter((a) => !a.feature || isEnabled(a.feature));

  return (
    <div className="home">
      <div className="page-header">
        <h1>Home</h1>
        <p className="page-subtitle">
          Documents and articles in channel trees (like Google Drive), plus knowledge bases with RAG Q&A.
        </p>
      </div>
      <section className="home-stats">
        {visibleStats.map(({ label, value, icon: Icon, color, path }) => (
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
            {visibleActivity.map(({ title, type, time, path }) => (
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
            {visibleQuickActions.map(({ label, icon: Icon, path }) => (
              <Link key={path} to={path} className="quick-action">
                <Icon size={20} />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
