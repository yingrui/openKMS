import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  HelpCircle,
  Search as SearchIcon,
  Send,
  FileText,
  FileStack,
  Layers,
  Plus,
  Eye,
  Trash2,
  Sparkles,
} from 'lucide-react';
import './KnowledgeBaseDetail.css';

type TabId = 'documents' | 'articles' | 'faqs' | 'chunks' | 'search';

const tabs: { id: TabId; label: string; icon: typeof FileStack }[] = [
  { id: 'documents', label: 'Documents', icon: FileStack },
  { id: 'articles', label: 'Articles', icon: FileText },
  { id: 'faqs', label: 'FAQs', icon: HelpCircle },
  { id: 'chunks', label: 'Chunks', icon: Layers },
  { id: 'search', label: 'Search', icon: SearchIcon },
];

const mockDocuments = [
  { id: 'd1', name: 'User_Guide.pdf', type: 'PDF', added: '2 days ago' },
  { id: 'd2', name: 'API_Spec.html', type: 'HTML', added: '5 days ago' },
];

const mockArticles = [
  { id: 'a1', title: 'Getting Started', slug: 'getting-started', added: '3 days ago' },
  { id: 'a2', title: 'API Authentication', slug: 'api-auth', added: '1 week ago' },
];

const mockFAQs = [
  { id: 'f1', q: 'How do I get started?', a: 'Follow the getting started guide in the documentation.' },
  { id: 'f2', q: 'What formats are supported?', a: 'PDF, HTML, ZIP, and images. All convert to Markdown.' },
];

const mockChunks = [
  { id: 'c1', source: 'User_Guide.pdf', sourceType: 'document', excerpt: 'To get started, run the setup script and configure your environment variables. Ensure Docker is installed for containerized deployment.', tokens: 128 },
  { id: 'c2', source: 'API_Spec.html', sourceType: 'document', excerpt: 'Authentication uses OAuth 2.0. Obtain a token from /auth/token endpoint. Include the Bearer token in the Authorization header.', tokens: 95 },
  { id: 'c3', source: 'Getting Started', sourceType: 'article', excerpt: 'This article walks you through the installation and first steps. After setup, run the health check endpoint to verify.', tokens: 112 },
];

const mockSearchResults = [
  { source: 'User_Guide.pdf', excerpt: '...Run `docker compose up -d` for Docker deployment. For Kubernetes, apply the k8s manifests in the /deploy folder...', score: 0.92 },
  { source: 'API_Spec.html', excerpt: '...Deployment configuration is documented in the Operations section. Environment variables control deployment mode...', score: 0.78 },
];

export function KnowledgeBaseDetail() {
  const { id: _kbId } = useParams();
  const [activeTab, setActiveTab] = useState<TabId>('documents');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredChunks = mockChunks;

  const hasSearched = searchQuery.trim().length > 0;

  return (
    <div className="kb-detail">
      <Link to="/knowledge-bases" className="kb-detail-back">
        <ArrowLeft size={18} />
        <span>Back to Knowledge Bases</span>
      </Link>

      <header className="kb-detail-header">
        <div>
          <h1>Product KB</h1>
          <p className="kb-detail-desc">Product documentation, specs, and FAQs</p>
          <div className="kb-detail-stats">
            <span>{mockDocuments.length} docs</span>
            <span>{mockArticles.length} articles</span>
            <span>{mockFAQs.length} FAQs</span>
            <span>{mockChunks.length} chunks</span>
          </div>
        </div>
      </header>

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
        {activeTab === 'documents' && (
          <section className="kb-section">
            <div className="kb-section-header">
              <h2>Documents</h2>
              <button type="button" className="btn btn-primary btn-sm">
                <Plus size={16} />
                <span>Add document</span>
              </button>
            </div>
            <div className="kb-table-wrap">
              <table className="kb-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Added</th>
                    <th className="kb-table-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {mockDocuments.map((doc) => (
                    <tr key={doc.id}>
                      <td>
                        <div className="kb-table-name">
                          <FileStack size={18} />
                          <span>{doc.name}</span>
                        </div>
                      </td>
                      <td>{doc.type}</td>
                      <td>{doc.added}</td>
                      <td className="kb-table-actions">
                        <div className="kb-table-btns">
                          <button type="button" title="View" aria-label="View">
                            <Eye size={16} />
                          </button>
                          <button type="button" title="Remove" aria-label="Remove">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'articles' && (
          <section className="kb-section">
            <div className="kb-section-header">
              <h2>Articles</h2>
              <button type="button" className="btn btn-primary btn-sm">
                <Plus size={16} />
                <span>Add article</span>
              </button>
            </div>
            <div className="kb-table-wrap">
              <table className="kb-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Slug</th>
                    <th>Added</th>
                    <th className="kb-table-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {mockArticles.map((art) => (
                    <tr key={art.id}>
                      <td>
                        <div className="kb-table-name">
                          <FileText size={18} />
                          <span>{art.title}</span>
                        </div>
                      </td>
                      <td>{art.slug}</td>
                      <td>{art.added}</td>
                      <td className="kb-table-actions">
                        <div className="kb-table-btns">
                          <button type="button" title="View" aria-label="View">
                            <Eye size={16} />
                          </button>
                          <button type="button" title="Remove" aria-label="Remove">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'faqs' && (
          <section className="kb-section">
            <div className="kb-section-header">
              <h2>FAQs</h2>
              <button type="button" className="btn btn-primary btn-sm">
                <Sparkles size={16} />
                <span>Generate FAQ</span>
              </button>
            </div>
            <div className="kb-table-wrap">
              <table className="kb-table">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Answer</th>
                    <th className="kb-table-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {mockFAQs.map((faq) => (
                    <tr key={faq.id}>
                      <td>
                        <div className="kb-table-name">
                          <HelpCircle size={18} />
                          <span>{faq.q}</span>
                        </div>
                      </td>
                      <td>{faq.a}</td>
                      <td className="kb-table-actions">
                        <div className="kb-table-btns">
                          <button type="button" title="View" aria-label="View">
                            <Eye size={16} />
                          </button>
                          <button type="button" title="Remove" aria-label="Remove">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'chunks' && (
          <section className="kb-section">
            <div className="kb-section-header">
              <h2>Chunks</h2>
            </div>
            <div className="kb-table-wrap">
              <table className="kb-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Excerpt</th>
                    <th>Tokens</th>
                    <th className="kb-table-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredChunks.map((chunk) => (
                    <tr key={chunk.id}>
                      <td>
                        <div className="kb-table-name">
                          <Layers size={18} />
                          <span>{chunk.source}</span>
                        </div>
                      </td>
                      <td className="kb-table-excerpt">{chunk.excerpt}</td>
                      <td>{chunk.tokens}</td>
                      <td className="kb-table-actions">
                        <div className="kb-table-btns">
                          <button type="button" title="View" aria-label="View">
                            <Eye size={16} />
                          </button>
                          <button type="button" title="Remove" aria-label="Remove">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'search' && (
          <section className="kb-section kb-search-section">
            <h2>Search</h2>
            <p className="kb-section-desc">
              Advanced search over documents, articles, and FAQs, with semantic search and traditional search capabilities.
            </p>
            <form
              className="kb-search-form"
              onSubmit={(e) => e.preventDefault()}
            >
              <SearchIcon size={20} />
              <input
                type="search"
                aria-label="Search or ask a question"
                placeholder="Search or ask a question..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="kb-search-input"
              />
              <button type="submit" className="kb-search-submit">
                <Send size={18} />
                <span>Search</span>
              </button>
            </form>

            {hasSearched && (
              <div className="kb-search-results-area">
                <div className="kb-search-results-panel">
                  <h3>Matching chunks</h3>
                  <ul className="kb-search-results-list">
                    {mockSearchResults.map((r, i) => (
                      <li key={i} className="kb-search-result-item">
                        <span className="kb-search-result-source">{r.source}</span>
                        <p className="kb-search-result-excerpt">{r.excerpt}</p>
                        <span className="kb-search-result-score">{(r.score * 100).toFixed(0)}% match</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="kb-search-answer-panel">
                  <h3>
                    <Sparkles size={18} />
                    Answer
                  </h3>
                  <div className="kb-search-answer-content">
                    Based on this knowledge base: Run <code>docker compose up -d</code> for Docker, or apply the k8s manifests for Kubernetes.
                  </div>
                </div>
              </div>
            )}

            {!hasSearched && (
              <div className="kb-search-empty">
                <SearchIcon size={48} strokeWidth={1} />
                <p>Enter a search query or question above</p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
