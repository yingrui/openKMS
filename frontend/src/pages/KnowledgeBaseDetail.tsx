import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Database,
  Search,
  Copy,
  HelpCircle,
  MessageCircle,
  Send,
  FileText,
  FileStack,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import './KnowledgeBaseDetail.css';

type TabId = 'content' | 'search' | 'faq' | 'rag';

const tabs: { id: TabId; label: string; icon: typeof Database }[] = [
  { id: 'content', label: 'Content', icon: Database },
  { id: 'search', label: 'Search & Copy', icon: Search },
  { id: 'faq', label: 'Generate FAQ', icon: HelpCircle },
  { id: 'rag', label: 'RAG Q&A', icon: MessageCircle },
];

const mockContent = [
  { type: 'document', name: 'User_Guide.pdf', added: '2 days ago' },
  { type: 'article', name: 'Getting Started', added: '3 days ago' },
  { type: 'faq', name: 'Product FAQ (12 Q&As)', added: '1 week ago' },
];

const mockSearchResults = [
  { type: 'document', name: 'API_Spec.html', source: 'Documents' },
  { type: 'article', name: 'API Authentication', source: 'Articles' },
];

const mockFAQs = [
  { q: 'How do I get started?', a: 'Follow the getting started guide in the documentation.' },
  { q: 'What formats are supported?', a: 'PDF, HTML, ZIP, and images. All convert to Markdown.' },
];

const mockRagHistory = [
  { role: 'user', content: 'How do I deploy?' },
  { role: 'assistant', content: 'Based on this knowledge base: Run `docker compose up -d` for Docker, or apply the k8s manifests for Kubernetes.' },
];

export function KnowledgeBaseDetail() {
  const { id: _kbId } = useParams();
  const [activeTab, setActiveTab] = useState<TabId>('content');
  const [ragQuery, setRagQuery] = useState('');

  return (
    <div className="kb-detail">
      <Link to="/knowledge-bases" className="kb-detail-back">
        <ArrowLeft size={18} />
        <span>Back to Knowledge Bases</span>
      </Link>
      <div className="page-header">
        <h1>Product KB</h1>
        <p className="page-subtitle">
          Add content by searching and copying. Generate FAQs. Each KB has its own RAG Q&A.
        </p>
      </div>
      <div className="kb-detail-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`kb-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={18} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
      <div className="kb-detail-content">
        {activeTab === 'content' && (
          <section className="kb-section">
            <h2>Content in this Knowledge Base</h2>
            <ul className="kb-content-list">
              {mockContent.map((item, i) => (
                <li key={i} className="kb-content-item">
                  {item.type === 'document' && <FileStack size={18} />}
                  {item.type === 'article' && <FileText size={18} />}
                  {item.type === 'faq' && <HelpCircle size={18} />}
                  <span>{item.name}</span>
                  <span className="kb-content-meta">Added {item.added}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {activeTab === 'search' && (
          <section className="kb-section">
            <h2>Search documents and articles</h2>
            <p className="kb-section-desc">
              Find content across your documents and articles, then copy to this knowledge base.
            </p>
            <div className="kb-search-box">
              <Search size={20} />
              <input type="search" placeholder="Search documents and articles..." />
            </div>
            <div className="kb-search-results">
              <h3>Results</h3>
              {mockSearchResults.map((r, i) => (
                <div key={i} className="kb-search-item">
                  <div>
                    {r.type === 'document' && <FileStack size={18} />}
                    {r.type === 'article' && <FileText size={18} />}
                    <span>{r.name}</span>
                    <span className="kb-search-source">{r.source}</span>
                  </div>
                  <button type="button" className="btn btn-sm">
                    <Copy size={14} />
                    Copy to KB
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
        {activeTab === 'faq' && (
          <section className="kb-section">
            <h2>Generate FAQ</h2>
            <p className="kb-section-desc">
              Generate FAQs from documents and articles in this KB, then add to the knowledge base.
            </p>
            <button type="button" className="btn btn-primary">
              <Sparkles size={18} />
              <span>Generate FAQ from content</span>
            </button>
            <div className="kb-faq-list">
              <h3>Generated FAQs</h3>
              {mockFAQs.map((faq, i) => (
                <div key={i} className="kb-faq-item">
                  <button type="button" className="kb-faq-question">
                    <HelpCircle size={16} />
                    <span>{faq.q}</span>
                    <ChevronDown size={16} />
                  </button>
                  <div className="kb-faq-answer">{faq.a}</div>
                </div>
              ))}
            </div>
          </section>
        )}
        {activeTab === 'rag' && (
          <section className="kb-section kb-rag-section">
            <h2>RAG Q&A</h2>
            <p className="kb-section-desc">
              Ask questions against this knowledge base. Answers use only content in this KB.
            </p>
            <div className="kb-rag-chat">
              <div className="kb-rag-messages">
                {mockRagHistory.map((msg, i) => (
                  <div key={i} className={`kb-rag-msg kb-rag-msg-${msg.role}`}>
                    <div className="kb-rag-avatar">
                      {msg.role === 'user' ? (
                        <MessageCircle size={18} />
                      ) : (
                        <Sparkles size={18} />
                      )}
                    </div>
                    <div className="kb-rag-text">{msg.content}</div>
                  </div>
                ))}
              </div>
              <form
                className="kb-rag-input"
                onSubmit={(e) => e.preventDefault()}
              >
                <input
                  type="text"
                  placeholder="Ask a question about this knowledge base..."
                  value={ragQuery}
                  onChange={(e) => setRagQuery(e.target.value)}
                />
                <button type="submit" className="kb-rag-send">
                  <Send size={20} />
                </button>
              </form>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
