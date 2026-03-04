import { Link } from 'react-router-dom';
import { Database, Plus, MessageCircle } from 'lucide-react';
import './KnowledgeBaseList.css';

const mockKnowledgeBases = [
  {
    id: 'kb1',
    name: 'Product KB',
    description: 'Product documentation, specs, and FAQs',
    itemCount: 45,
    hasRag: true,
  },
  {
    id: 'kb2',
    name: 'HR Knowledge Base',
    description: 'HR policies, leave, onboarding FAQs',
    itemCount: 28,
    hasRag: true,
  },
];

export function KnowledgeBaseList() {
  return (
    <div className="kb-list">
      <div className="page-header kb-header">
        <div>
          <h1>Knowledge Bases</h1>
          <p className="page-subtitle">
            Create knowledge bases, copy documents and articles, generate FAQs, and enable RAG Q&A per KB.
          </p>
        </div>
        <button type="button" className="btn btn-primary">
          <Plus size={18} />
          <span>New Knowledge Base</span>
        </button>
      </div>
      <div className="kb-grid">
        {mockKnowledgeBases.map((kb) => (
          <Link key={kb.id} to={`/knowledge-bases/${kb.id}`} className="kb-card">
            <div className="kb-icon">
              <Database size={28} strokeWidth={1.5} />
            </div>
            <h3>{kb.name}</h3>
            <p className="kb-desc">{kb.description}</p>
            <div className="kb-meta">
              <span>{kb.itemCount} items</span>
              {kb.hasRag && (
                <span className="kb-rag-badge">
                  <MessageCircle size={14} />
                  RAG Q&A
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
