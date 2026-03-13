import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  HelpCircle,
  Search as SearchIcon,
  Send,
  FileStack,
  Layers,
  Plus,
  Eye,
  Trash2,
  Sparkles,
  Settings,
  MessageSquare,
  Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchKnowledgeBase,
  fetchKBDocuments,
  fetchFAQs,
  fetchChunks,
  addKBDocument,
  removeKBDocument,
  createFAQ,
  updateFAQ,
  deleteFAQ,
  generateFAQs,
  searchKnowledgeBase,
  askQuestion,
  updateKnowledgeBase,
  type KnowledgeBaseResponse,
  type KBDocumentResponse,
  type FAQResponse,
  type ChunkResponse,
  type SearchResult,
} from '../data/knowledgeBasesApi';
import { fetchModels, type ApiModelResponse } from '../data/modelsApi';
import './KnowledgeBaseDetail.css';

type TabId = 'documents' | 'faqs' | 'chunks' | 'search' | 'qa' | 'settings';

const tabs: { id: TabId; label: string; icon: typeof FileStack }[] = [
  { id: 'documents', label: 'Documents', icon: FileStack },
  { id: 'faqs', label: 'FAQs', icon: HelpCircle },
  { id: 'chunks', label: 'Chunks', icon: Layers },
  { id: 'search', label: 'Search', icon: SearchIcon },
  { id: 'qa', label: 'Q&A', icon: MessageSquare },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchResult[];
}

export function KnowledgeBaseDetail() {
  const { id: kbId } = useParams<{ id: string }>();
  const [kb, setKb] = useState<KnowledgeBaseResponse | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('documents');
  const [loading, setLoading] = useState(true);

  // Documents
  const [docs, setDocs] = useState<KBDocumentResponse[]>([]);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [addDocId, setAddDocId] = useState('');

  // FAQs
  const [faqs, setFaqs] = useState<FAQResponse[]>([]);
  const [showFaqForm, setShowFaqForm] = useState(false);
  const [editFaq, setEditFaq] = useState<FAQResponse | null>(null);
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [genDocIds, setGenDocIds] = useState('');
  const [genModelId, setGenModelId] = useState('');
  const [generating, setGenerating] = useState(false);

  // Chunks
  const [chunks, setChunks] = useState<ChunkResponse[]>([]);
  const [chunkTotal, setChunkTotal] = useState(0);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // QA
  const [qaInput, setQaInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [qaLoading, setQaLoading] = useState(false);

  // Settings
  const [settingsAgentUrl, setSettingsAgentUrl] = useState('');
  const [settingsEmbeddingModelId, setSettingsEmbeddingModelId] = useState('');
  const [settingsChunkStrategy, setSettingsChunkStrategy] = useState('fixed_size');
  const [settingsChunkSize, setSettingsChunkSize] = useState(512);
  const [settingsChunkOverlap, setSettingsChunkOverlap] = useState(50);
  const [embeddingModels, setEmbeddingModels] = useState<ApiModelResponse[]>([]);
  const [llmModels, setLlmModels] = useState<ApiModelResponse[]>([]);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const loadKb = useCallback(async () => {
    if (!kbId) return;
    try {
      const data = await fetchKnowledgeBase(kbId);
      setKb(data);
      setSettingsAgentUrl(data.agent_url || '');
      setSettingsEmbeddingModelId(data.embedding_model_id || '');
      const cc = (data.chunk_config || {}) as Record<string, unknown>;
      setSettingsChunkStrategy((cc.strategy as string) || 'fixed_size');
      setSettingsChunkSize((cc.chunk_size as number) || 512);
      setSettingsChunkOverlap((cc.chunk_overlap as number) || 50);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load KB');
    } finally {
      setLoading(false);
    }
  }, [kbId]);

  const loadDocs = useCallback(async () => {
    if (!kbId) return;
    try { setDocs(await fetchKBDocuments(kbId)); } catch { /* noop */ }
  }, [kbId]);

  const loadFaqs = useCallback(async () => {
    if (!kbId) return;
    try { setFaqs(await fetchFAQs(kbId)); } catch { /* noop */ }
  }, [kbId]);

  const loadChunks = useCallback(async () => {
    if (!kbId) return;
    try {
      const data = await fetchChunks(kbId, { limit: 100 });
      setChunks(data.items);
      setChunkTotal(data.total);
    } catch { /* noop */ }
  }, [kbId]);

  const loadModels = useCallback(async () => {
    try {
      const emb = await fetchModels({ category: 'embedding' });
      setEmbeddingModels(emb.items);
      const llm = await fetchModels({ category: 'llm' });
      setLlmModels(llm.items);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { loadKb(); loadModels(); }, [loadKb, loadModels]);

  useEffect(() => {
    if (activeTab === 'documents') loadDocs();
    if (activeTab === 'faqs') loadFaqs();
    if (activeTab === 'chunks') loadChunks();
  }, [activeTab, loadDocs, loadFaqs, loadChunks]);

  // --- Document handlers ---
  const handleAddDocument = async () => {
    if (!kbId || !addDocId.trim()) return;
    try {
      await addKBDocument(kbId, addDocId.trim());
      setAddDocId('');
      setShowAddDoc(false);
      toast.success('Document added');
      loadDocs();
      loadKb();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to add document');
    }
  };

  const handleRemoveDocument = async (docId: string) => {
    if (!kbId) return;
    try {
      await removeKBDocument(kbId, docId);
      toast.success('Document removed');
      loadDocs();
      loadKb();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove document');
    }
  };

  // --- FAQ handlers ---
  const handleSaveFaq = async () => {
    if (!kbId || !faqQuestion.trim() || !faqAnswer.trim()) return;
    try {
      if (editFaq) {
        await updateFAQ(kbId, editFaq.id, { question: faqQuestion, answer: faqAnswer });
        toast.success('FAQ updated');
      } else {
        await createFAQ(kbId, { question: faqQuestion, answer: faqAnswer });
        toast.success('FAQ created');
      }
      setShowFaqForm(false);
      setEditFaq(null);
      setFaqQuestion('');
      setFaqAnswer('');
      loadFaqs();
      loadKb();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save FAQ');
    }
  };

  const handleDeleteFaq = async (faqId: string) => {
    if (!kbId) return;
    try {
      await deleteFAQ(kbId, faqId);
      toast.success('FAQ deleted');
      loadFaqs();
      loadKb();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete FAQ');
    }
  };

  const handleGenerateFaqs = async () => {
    if (!kbId || !genModelId) return;
    setGenerating(true);
    try {
      const docIds = genDocIds.trim()
        ? genDocIds.split(',').map((s) => s.trim()).filter(Boolean)
        : docs.map((d) => d.document_id);
      if (docIds.length === 0) {
        toast.error('No documents to generate from');
        return;
      }
      const result = await generateFAQs(kbId, { document_ids: docIds, model_id: genModelId });
      toast.success(`Generated ${result.length} FAQ pairs`);
      setShowGenerateForm(false);
      loadFaqs();
      loadKb();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'FAQ generation failed');
    } finally {
      setGenerating(false);
    }
  };

  // --- Search ---
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kbId || !searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await searchKnowledgeBase(kbId, { query: searchQuery, top_k: 10 });
      setSearchResults(res.results);
      setHasSearched(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  // --- QA ---
  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kbId || !qaInput.trim()) return;
    const question = qaInput.trim();
    setQaInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: question }]);
    setQaLoading(true);
    try {
      const history = chatMessages.map((m) => ({ role: m.role, content: m.content }));
      const res = await askQuestion(kbId, { question, conversation_history: history });
      setChatMessages((prev) => [...prev, { role: 'assistant', content: res.answer, sources: res.sources }]);
    } catch (e: unknown) {
      setChatMessages((prev) => [...prev, {
        role: 'assistant',
        content: `Error: ${e instanceof Error ? e.message : 'Failed to get answer'}`,
      }]);
    } finally {
      setQaLoading(false);
    }
  };

  // --- Settings ---
  const handleSaveSettings = async () => {
    if (!kbId) return;
    setSettingsSaving(true);
    try {
      await updateKnowledgeBase(kbId, {
        agent_url: settingsAgentUrl || null,
        embedding_model_id: settingsEmbeddingModelId || null,
        chunk_config: {
          strategy: settingsChunkStrategy,
          chunk_size: settingsChunkSize,
          chunk_overlap: settingsChunkOverlap,
        },
      });
      toast.success('Settings saved');
      loadKb();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSettingsSaving(false);
    }
  };

  if (loading) return <div className="kb-detail"><p>Loading...</p></div>;
  if (!kb) return <div className="kb-detail"><p>Knowledge base not found.</p></div>;

  return (
    <div className="kb-detail">
      <Link to="/knowledge-bases" className="kb-detail-back">
        <ArrowLeft size={18} />
        <span>Back to Knowledge Bases</span>
      </Link>

      <header className="kb-detail-header">
        <div>
          <h1>{kb.name}</h1>
          <p className="kb-detail-desc">{kb.description || 'No description'}</p>
          <div className="kb-detail-stats">
            <span>{kb.document_count} docs</span>
            <span>{kb.faq_count} FAQs</span>
            <span>{kb.chunk_count} chunks</span>
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
        {/* ===== DOCUMENTS TAB ===== */}
        {activeTab === 'documents' && (
          <section className="kb-section">
            <div className="kb-section-header">
              <h2>Documents</h2>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowAddDoc(true)}>
                <Plus size={16} />
                <span>Add document</span>
              </button>
            </div>
            {showAddDoc && (
              <div className="kb-inline-form">
                <input
                  type="text"
                  placeholder="Paste document ID"
                  value={addDocId}
                  onChange={(e) => setAddDocId(e.target.value)}
                  autoFocus
                />
                <button type="button" className="btn btn-primary btn-sm" onClick={handleAddDocument}>Add</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowAddDoc(false); setAddDocId(''); }}>Cancel</button>
              </div>
            )}
            {docs.length === 0 ? (
              <p className="kb-empty-text">No documents added yet.</p>
            ) : (
              <div className="kb-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th className="kb-table-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((doc) => (
                      <tr key={doc.id}>
                        <td>
                          <div className="kb-table-name">
                            <FileStack size={18} />
                            <Link to={`/documents/view/${doc.document_id}`}>{doc.document_name || doc.document_id}</Link>
                          </div>
                        </td>
                        <td>{doc.document_file_type}</td>
                        <td>{doc.document_status}</td>
                        <td className="kb-table-actions">
                          <div className="kb-table-btns">
                            <Link to={`/documents/view/${doc.document_id}`} title="View" aria-label="View">
                              <Eye size={16} />
                            </Link>
                            <button type="button" title="Remove" aria-label="Remove" onClick={() => handleRemoveDocument(doc.document_id)}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ===== FAQS TAB ===== */}
        {activeTab === 'faqs' && (
          <section className="kb-section">
            <div className="kb-section-header">
              <h2>FAQs</h2>
              <div className="kb-section-header-btns">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowGenerateForm(true)}>
                  <Sparkles size={16} />
                  <span>Generate FAQ</span>
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => {
                  setShowFaqForm(true);
                  setEditFaq(null);
                  setFaqQuestion('');
                  setFaqAnswer('');
                }}>
                  <Plus size={16} />
                  <span>Add FAQ</span>
                </button>
              </div>
            </div>

            {showGenerateForm && (
              <div className="kb-inline-form kb-generate-form">
                <label>
                  <span>LLM Model</span>
                  <select value={genModelId} onChange={(e) => setGenModelId(e.target.value)}>
                    <option value="">Select a model...</option>
                    {llmModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Document IDs (comma-separated, leave empty for all)</span>
                  <input
                    type="text"
                    placeholder="doc-id-1, doc-id-2 (optional)"
                    value={genDocIds}
                    onChange={(e) => setGenDocIds(e.target.value)}
                  />
                </label>
                <div className="kb-inline-form-actions">
                  <button type="button" className="btn btn-primary btn-sm" disabled={!genModelId || generating} onClick={handleGenerateFaqs}>
                    {generating ? 'Generating...' : 'Generate'}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowGenerateForm(false)}>Cancel</button>
                </div>
              </div>
            )}

            {showFaqForm && (
              <div className="kb-inline-form">
                <input
                  type="text"
                  placeholder="Question"
                  value={faqQuestion}
                  onChange={(e) => setFaqQuestion(e.target.value)}
                  autoFocus
                />
                <textarea
                  placeholder="Answer"
                  value={faqAnswer}
                  onChange={(e) => setFaqAnswer(e.target.value)}
                  rows={3}
                />
                <div className="kb-inline-form-actions">
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveFaq} disabled={!faqQuestion.trim() || !faqAnswer.trim()}>
                    {editFaq ? 'Update' : 'Create'}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowFaqForm(false); setEditFaq(null); }}>Cancel</button>
                </div>
              </div>
            )}

            {faqs.length === 0 ? (
              <p className="kb-empty-text">No FAQs yet.</p>
            ) : (
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
                    {faqs.map((faq) => (
                      <tr key={faq.id}>
                        <td>
                          <div className="kb-table-name">
                            <HelpCircle size={18} />
                            <span>{faq.question}</span>
                          </div>
                        </td>
                        <td className="kb-table-excerpt">{faq.answer}</td>
                        <td className="kb-table-actions">
                          <div className="kb-table-btns">
                            <button type="button" title="Edit" aria-label="Edit" onClick={() => {
                              setEditFaq(faq);
                              setFaqQuestion(faq.question);
                              setFaqAnswer(faq.answer);
                              setShowFaqForm(true);
                            }}>
                              <Pencil size={16} />
                            </button>
                            <button type="button" title="Remove" aria-label="Remove" onClick={() => handleDeleteFaq(faq.id)}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ===== CHUNKS TAB ===== */}
        {activeTab === 'chunks' && (
          <section className="kb-section">
            <div className="kb-section-header">
              <h2>Chunks ({chunkTotal})</h2>
            </div>
            {chunks.length === 0 ? (
              <p className="kb-empty-text">No chunks yet. Run indexing from Settings to generate chunks.</p>
            ) : (
              <div className="kb-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Excerpt</th>
                      <th>Tokens</th>
                      <th>Embedded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chunks.map((chunk) => (
                      <tr key={chunk.id}>
                        <td>
                          <div className="kb-table-name">
                            <Layers size={18} />
                            <span>{chunk.document_name || chunk.document_id}</span>
                          </div>
                        </td>
                        <td className="kb-table-excerpt">{chunk.content.slice(0, 150)}...</td>
                        <td>{chunk.token_count ?? '—'}</td>
                        <td>{chunk.has_embedding ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ===== SEARCH TAB ===== */}
        {activeTab === 'search' && (
          <section className="kb-section kb-search-section">
            <h2>Semantic Search</h2>
            <p className="kb-section-desc">
              Search over document chunks and FAQs using vector similarity.
            </p>
            <form className="kb-search-form" onSubmit={handleSearch}>
              <SearchIcon size={20} />
              <input
                type="search"
                aria-label="Search"
                placeholder="Search chunks and FAQs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="kb-search-input"
              />
              <button type="submit" className="kb-search-submit" disabled={searching}>
                <Send size={18} />
                <span>{searching ? 'Searching...' : 'Search'}</span>
              </button>
            </form>

            {hasSearched && searchResults.length > 0 && (
              <div className="kb-search-results-panel">
                <h3>Results ({searchResults.length})</h3>
                <ul className="kb-search-results-list">
                  {searchResults.map((r) => (
                    <li key={r.id} className="kb-search-result-item">
                      <span className="kb-search-result-source">
                        [{r.source_type}] {r.source_name || r.document_id || 'FAQ'}
                      </span>
                      <p className="kb-search-result-excerpt">{r.content.slice(0, 300)}</p>
                      <span className="kb-search-result-score">{(r.score * 100).toFixed(0)}% match</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasSearched && searchResults.length === 0 && (
              <p className="kb-empty-text">No results found.</p>
            )}

            {!hasSearched && (
              <div className="kb-search-empty">
                <SearchIcon size={48} strokeWidth={1} />
                <p>Enter a search query above</p>
              </div>
            )}
          </section>
        )}

        {/* ===== QA TAB ===== */}
        {activeTab === 'qa' && (
          <section className="kb-section kb-qa-section">
            <h2>Q&A</h2>
            <p className="kb-section-desc">
              Ask questions against this knowledge base. Requires an agent service to be configured in Settings.
            </p>
            {!kb.agent_url && (
              <div className="kb-qa-warning">
                No agent URL configured. Go to Settings to set up the QA agent service URL.
              </div>
            )}

            <div className="kb-qa-chat">
              <div className="kb-qa-messages">
                {chatMessages.length === 0 && (
                  <div className="kb-qa-empty">
                    <MessageSquare size={40} strokeWidth={1} />
                    <p>Ask a question to get started</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`kb-qa-msg kb-qa-msg-${msg.role}`}>
                    <div className="kb-qa-msg-content">{msg.content}</div>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="kb-qa-sources">
                        <span className="kb-qa-sources-label">Sources:</span>
                        {msg.sources.map((s, j) => (
                          <span key={j} className="kb-qa-source-tag">
                            [{s.source_type}] {s.source_name || 'FAQ'} ({(s.score * 100).toFixed(0)}%)
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {qaLoading && (
                  <div className="kb-qa-msg kb-qa-msg-assistant">
                    <div className="kb-qa-msg-content kb-qa-typing">Thinking...</div>
                  </div>
                )}
              </div>
              <form className="kb-qa-input-form" onSubmit={handleAsk}>
                <input
                  type="text"
                  placeholder="Ask a question..."
                  value={qaInput}
                  onChange={(e) => setQaInput(e.target.value)}
                  disabled={qaLoading || !kb.agent_url}
                />
                <button type="submit" disabled={qaLoading || !qaInput.trim() || !kb.agent_url}>
                  <Send size={18} />
                </button>
              </form>
            </div>
          </section>
        )}

        {/* ===== SETTINGS TAB ===== */}
        {activeTab === 'settings' && (
          <section className="kb-section kb-settings-section">
            <h2>Knowledge Base Settings</h2>

            <div className="kb-settings-form">
              <label>
                <span>QA Agent Service URL</span>
                <input
                  type="url"
                  placeholder="http://localhost:8103"
                  value={settingsAgentUrl}
                  onChange={(e) => setSettingsAgentUrl(e.target.value)}
                />
                <small>URL of the QA agent service for answering questions</small>
              </label>

              <label>
                <span>Embedding Model</span>
                <select value={settingsEmbeddingModelId} onChange={(e) => setSettingsEmbeddingModelId(e.target.value)}>
                  <option value="">None</option>
                  {embeddingModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.model_name})</option>
                  ))}
                </select>
                <small>Used for generating chunk and FAQ embeddings during indexing</small>
              </label>

              <fieldset className="kb-settings-fieldset">
                <legend>Chunking Configuration</legend>
                <label>
                  <span>Strategy</span>
                  <select value={settingsChunkStrategy} onChange={(e) => setSettingsChunkStrategy(e.target.value)}>
                    <option value="fixed_size">Fixed Size</option>
                    <option value="markdown_header">Markdown Header</option>
                    <option value="paragraph">Paragraph</option>
                  </select>
                </label>
                {settingsChunkStrategy === 'fixed_size' && (
                  <>
                    <label>
                      <span>Chunk Size (characters)</span>
                      <input
                        type="number"
                        min={100}
                        max={10000}
                        value={settingsChunkSize}
                        onChange={(e) => setSettingsChunkSize(Number(e.target.value))}
                      />
                    </label>
                    <label>
                      <span>Chunk Overlap (characters)</span>
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        value={settingsChunkOverlap}
                        onChange={(e) => setSettingsChunkOverlap(Number(e.target.value))}
                      />
                    </label>
                  </>
                )}
              </fieldset>

              <div className="kb-settings-actions">
                <button type="button" className="btn btn-primary" disabled={settingsSaving} onClick={handleSaveSettings}>
                  {settingsSaving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
