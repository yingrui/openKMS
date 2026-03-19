import { useEffect, useState, useCallback, useRef } from 'react';
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
  X,
  FileText,
  Check,
  Loader2,
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
  saveFAQs,
  searchKnowledgeBase,
  askQuestion,
  updateKnowledgeBase,
  updateChunk,
  type KnowledgeBaseResponse,
  type KBDocumentResponse,
  type FAQResponse,
  type FAQGenerateResult,
  type ChunkResponse,
  type SearchResult,
} from '../data/knowledgeBasesApi';
import { fetchDocumentById, fetchDocuments, type DocumentResponse } from '../data/documentsApi';
import { fetchChannelById } from '../data/channelsApi';
import { normalizeExtractionSchemaToFields } from '../data/channelUtils';
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
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerResults, setPickerResults] = useState<DocumentResponse[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());
  const [pickerAdding, setPickerAdding] = useState(false);
  const pickerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // FAQs
  const [faqs, setFaqs] = useState<FAQResponse[]>([]);
  const [faqTotal, setFaqTotal] = useState(0);
  const [faqPage, setFaqPage] = useState(0);
  const [faqPageSize, setFaqPageSize] = useState(50);
  const [showFaqDialog, setShowFaqDialog] = useState(false);
  const [editFaq, setEditFaq] = useState<FAQResponse | null>(null);
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');
  const [faqLabelsValues, setFaqLabelsValues] = useState<Record<string, string>>({});
  const [faqDocMetadataValues, setFaqDocMetadataValues] = useState<Record<string, string>>({});
  const [faqLabelAllowMultiple, setFaqLabelAllowMultiple] = useState<Record<string, boolean>>({});
  const [faqMetadataIsArray, setFaqMetadataIsArray] = useState<Record<string, boolean>>({});
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [genSelectedDocs, setGenSelectedDocs] = useState<Set<string>>(new Set());
  const [genModelId, setGenModelId] = useState('');
  const [genPrompt, setGenPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState<'config' | 'review'>('config');
  const [genPreviewFaqs, setGenPreviewFaqs] = useState<FAQGenerateResult[]>([]);
  const [genSaving, setGenSaving] = useState(false);

  // Chunks
  const [chunks, setChunks] = useState<ChunkResponse[]>([]);
  const [chunkTotal, setChunkTotal] = useState(0);
  const [chunkPage, setChunkPage] = useState(0);
  const [chunkPageSize, setChunkPageSize] = useState(50);
  const [editChunk, setEditChunk] = useState<ChunkResponse | null>(null);
  const [showChunkDialog, setShowChunkDialog] = useState(false);
  const [chunkContent, setChunkContent] = useState('');
  const [chunkLabelsValues, setChunkLabelsValues] = useState<Record<string, string>>({});
  const [chunkDocMetadataValues, setChunkDocMetadataValues] = useState<Record<string, string>>({});
  const [chunkLabelAllowMultiple, setChunkLabelAllowMultiple] = useState<Record<string, boolean>>({});
  const [chunkMetadataIsArray, setChunkMetadataIsArray] = useState<Record<string, boolean>>({});
  const [chunkSaving, setChunkSaving] = useState(false);

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
  const [settingsFaqPrompt, setSettingsFaqPrompt] = useState('');
  const [settingsChunkStrategy, setSettingsChunkStrategy] = useState('fixed_size');
  const [settingsChunkSize, setSettingsChunkSize] = useState(512);
  const [settingsChunkOverlap, setSettingsChunkOverlap] = useState(50);
  const [settingsLabelKeys, setSettingsLabelKeys] = useState('');
  const [settingsMetadataKeys, setSettingsMetadataKeys] = useState('');
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
      setSettingsFaqPrompt(data.faq_prompt || '');
      setSettingsLabelKeys(Array.isArray(data.label_keys) ? data.label_keys.join(', ') : '');
      setSettingsMetadataKeys(Array.isArray(data.metadata_keys) ? data.metadata_keys.join(', ') : '');
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
    try {
      const data = await fetchFAQs(kbId, { offset: faqPage * faqPageSize, limit: faqPageSize });
      setFaqs(data.items);
      setFaqTotal(data.total);
      setFaqPage((p) => {
        const maxP = data.total > 0 ? Math.ceil(data.total / faqPageSize) - 1 : 0;
        return Math.min(p, Math.max(0, maxP));
      });
    } catch { /* noop */ }
  }, [kbId, faqPage, faqPageSize]);

  const loadChunks = useCallback(async () => {
    if (!kbId) return;
    try {
      const data = await fetchChunks(kbId, { offset: chunkPage * chunkPageSize, limit: chunkPageSize });
      setChunks(data.items);
      setChunkTotal(data.total);
      setChunkPage((p) => {
        const maxP = data.total > 0 ? Math.ceil(data.total / chunkPageSize) - 1 : 0;
        return Math.min(p, Math.max(0, maxP));
      });
    } catch { /* noop */ }
  }, [kbId, chunkPage, chunkPageSize]);

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

  // Switch away from Q&A tab when agent_url is cleared
  useEffect(() => {
    if (activeTab === 'qa' && !kb?.agent_url) {
      setActiveTab('documents');
    }
  }, [activeTab, kb?.agent_url]);

  // --- Document picker ---
  const alreadyAddedIds = new Set(docs.map((d) => d.document_id));

  const openDocPicker = async () => {
    setShowDocPicker(true);
    setPickerSearch('');
    setPickerSelected(new Set());
    setPickerLoading(true);
    try {
      const res = await fetchDocuments({ limit: 50 });
      setPickerResults(res.items);
    } catch { /* noop */ }
    finally { setPickerLoading(false); }
  };

  const handlePickerSearch = (query: string) => {
    setPickerSearch(query);
    if (pickerDebounceRef.current) clearTimeout(pickerDebounceRef.current);
    pickerDebounceRef.current = setTimeout(async () => {
      setPickerLoading(true);
      try {
        const res = await fetchDocuments({ search: query || undefined, limit: 50 });
        setPickerResults(res.items);
      } catch { /* noop */ }
      finally { setPickerLoading(false); }
    }, 300);
  };

  const togglePickerDoc = (docId: string) => {
    setPickerSelected((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const handleAddSelectedDocuments = async () => {
    if (!kbId || pickerSelected.size === 0) return;
    setPickerAdding(true);
    let added = 0;
    for (const docId of pickerSelected) {
      try {
        await addKBDocument(kbId, docId);
        added++;
      } catch { /* skip duplicates */ }
    }
    setPickerAdding(false);
    setShowDocPicker(false);
    if (added > 0) {
      toast.success(`${added} document${added > 1 ? 's' : ''} added`);
      loadDocs();
      loadKb();
    }
  };

  const closeDocPicker = () => {
    if (!pickerAdding) {
      setShowDocPicker(false);
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
  const configValuesToLabels = (
    values: Record<string, string>,
    keys: string[] | null | undefined,
    allowMultiple: Record<string, boolean>
  ): Record<string, unknown> | null => {
    if (!keys?.length) return null;
    const result: Record<string, unknown> = {};
    for (const k of keys) {
      const v = (values[k] ?? '').trim();
      if (v) {
        result[k] = allowMultiple[k]
          ? v.split(',').map((s) => s.trim()).filter(Boolean)
          : v;
      }
    }
    return Object.keys(result).length ? result : null;
  };

  const objToConfigValues = (obj: Record<string, unknown> | null | undefined, keys: string[] | null | undefined): Record<string, string> => {
    if (!keys?.length) return {};
    return Object.fromEntries(
      keys.map((k) => {
        const v = obj?.[k];
        return [k, Array.isArray(v) ? v.join(', ') : String(v ?? '')];
      })
    );
  };

  const handleSaveFaq = async () => {
    if (!kbId || !faqQuestion.trim() || !faqAnswer.trim()) return;
    try {
      const labels = configValuesToLabels(faqLabelsValues, kb?.label_keys ?? undefined, faqLabelAllowMultiple);
      const doc_metadata = configValuesToLabels(
        faqDocMetadataValues,
        kb?.metadata_keys ?? undefined,
        faqMetadataIsArray
      );
      const payload = { question: faqQuestion, answer: faqAnswer, labels: labels ?? undefined, doc_metadata: doc_metadata ?? undefined };
      if (editFaq) {
        await updateFAQ(kbId, editFaq.id, payload);
        toast.success('FAQ updated');
      } else {
        await createFAQ(kbId, payload);
        toast.success('FAQ created');
      }
      setShowFaqDialog(false);
      setEditFaq(null);
      setFaqQuestion('');
      setFaqAnswer('');
      setFaqLabelsValues({});
      setFaqDocMetadataValues({});
      setFaqLabelAllowMultiple({});
      setFaqMetadataIsArray({});
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

  const openGenerateModal = () => {
    setGenSelectedDocs(new Set(docs.map((d) => d.document_id)));
    setGenModelId('');
    setGenPrompt(kb?.faq_prompt || '');
    setGenStep('config');
    setGenPreviewFaqs([]);
    setShowGenerateModal(true);
  };

  const closeGenerateModal = () => {
    if (!generating && !genSaving) setShowGenerateModal(false);
  };

  const toggleGenDoc = (docId: string) => {
    setGenSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const handleGenerateFaqs = async () => {
    if (!kbId || !genModelId) return;
    const docIds = Array.from(genSelectedDocs);
    if (docIds.length === 0) {
      toast.error('Select at least one document');
      return;
    }
    setGenerating(true);
    try {
      const result = await generateFAQs(kbId, {
        document_ids: docIds,
        model_id: genModelId,
        prompt: genPrompt.trim() || undefined,
      });
      setGenPreviewFaqs(result);
      setGenStep('review');
      toast.success(`Generated ${result.length} FAQ pairs. Review and remove any you don't want, then Save.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'FAQ generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const removeGenPreviewFaq = (idx: number) => {
    setGenPreviewFaqs((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveGeneratedFaqs = async () => {
    if (!kbId || genPreviewFaqs.length === 0) return;
    setGenSaving(true);
    try {
      const items = genPreviewFaqs.map((f) => ({
        document_id: f.document_id,
        question: f.question,
        answer: f.answer,
        labels: f.labels ?? undefined,
        doc_metadata: f.doc_metadata ?? undefined,
      }));
      await saveFAQs(kbId, items);
      toast.success(`Saved ${items.length} FAQs`);
      setShowGenerateModal(false);
      loadFaqs();
      loadKb();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save FAQs');
    } finally {
      setGenSaving(false);
    }
  };

  const handleGenBackToConfig = () => {
    setGenStep('config');
    setGenPreviewFaqs([]);
  };

  // --- Chunk edit ---
  const openChunkEdit = async (chunk: ChunkResponse) => {
    setEditChunk(chunk);
    setChunkContent(chunk.content);
    setChunkLabelsValues(objToConfigValues(chunk.labels, kb?.label_keys ?? undefined));
    setChunkDocMetadataValues(objToConfigValues(chunk.doc_metadata, kb?.metadata_keys ?? undefined));
    const allowMultiple: Record<string, boolean> = {};
    const metadataIsArray: Record<string, boolean> = {};
    try {
      const doc = await fetchDocumentById(chunk.document_id);
      const channel = await fetchChannelById(doc.channel_id);
      if (kb?.label_keys?.length) {
        const lcMap = new Map(
          (channel.label_config ?? []).map((lc: { key: string; allow_multiple?: boolean }) => [lc.key, lc.allow_multiple ?? false])
        );
        for (const k of kb.label_keys) {
          allowMultiple[k] = lcMap.get(k) ?? false;
        }
      }
      if (kb?.metadata_keys?.length) {
        const metaFields = normalizeExtractionSchemaToFields(channel.extraction_schema ?? null);
        const metaMap = new Map(metaFields.map((f) => [f.key, f.type === 'array']));
        for (const k of kb.metadata_keys) {
          metadataIsArray[k] = metaMap.get(k) ?? false;
        }
      }
    } catch {
      /* default to false */
    }
    setChunkLabelAllowMultiple(allowMultiple);
    setChunkMetadataIsArray(metadataIsArray);
    setShowChunkDialog(true);
  };

  const closeChunkDialog = () => {
    setShowChunkDialog(false);
    setEditChunk(null);
  };

  const handleSaveChunk = async () => {
    if (!kbId || !editChunk) return;
    setChunkSaving(true);
    try {
      const labels = configValuesToLabels(chunkLabelsValues, kb?.label_keys ?? undefined, chunkLabelAllowMultiple);
      const doc_metadata = configValuesToLabels(
        chunkDocMetadataValues,
        kb?.metadata_keys ?? undefined,
        chunkMetadataIsArray
      );
      await updateChunk(kbId, editChunk.id, {
        content: chunkContent,
        labels: labels ?? undefined,
        doc_metadata: doc_metadata ?? undefined,
      });
      toast.success('Chunk updated');
      closeChunkDialog();
      loadChunks();
      loadKb();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update chunk');
    } finally {
      setChunkSaving(false);
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
      const labelKeys = settingsLabelKeys
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const metadataKeys = settingsMetadataKeys
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await updateKnowledgeBase(kbId, {
        agent_url: settingsAgentUrl || null,
        embedding_model_id: settingsEmbeddingModelId || null,
        chunk_config: {
          strategy: settingsChunkStrategy,
          chunk_size: settingsChunkSize,
          chunk_overlap: settingsChunkOverlap,
        },
        faq_prompt: settingsFaqPrompt.trim() || null,
        label_keys: labelKeys.length > 0 ? labelKeys : null,
        metadata_keys: metadataKeys.length > 0 ? metadataKeys : null,
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
        {tabs
          .filter((tab) => tab.id !== 'qa' || Boolean(kb?.agent_url))
          .map((tab) => (
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
              <button type="button" className="btn btn-primary btn-sm" onClick={openDocPicker}>
                <Plus size={16} />
                <span>Add document</span>
              </button>
            </div>
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
              <h2>FAQs ({faqTotal})</h2>
              <div className="kb-section-header-btns">
                <button type="button" className="btn btn-secondary btn-sm" onClick={openGenerateModal}>
                  <Sparkles size={16} />
                  <span>Generate FAQ</span>
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => {
                  setEditFaq(null);
                  setFaqQuestion('');
                  setFaqAnswer('');
                  setFaqLabelsValues(objToConfigValues({}, kb?.label_keys ?? undefined));
                  setFaqDocMetadataValues(objToConfigValues({}, kb?.metadata_keys ?? undefined));
                  setFaqLabelAllowMultiple({});
                  setFaqMetadataIsArray({});
                  setShowFaqDialog(true);
                }}>
                  <Plus size={16} />
                  <span>Add FAQ</span>
                </button>
              </div>
            </div>

            {faqTotal === 0 ? (
              <p className="kb-empty-text">No FAQs yet.</p>
            ) : (
              <>
              <div className="kb-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th>Answer</th>
                      <th className="kb-table-source-col">Source</th>
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
                        <td className="kb-table-source-col">
                          <span
                            className="kb-table-source"
                            title={faq.document_name || faq.document_id || undefined}
                          >
                            {faq.document_name || faq.document_id || '—'}
                          </span>
                        </td>
                        <td className="kb-table-actions">
                          <div className="kb-table-btns">
                            <button type="button" title="Edit" aria-label="Edit" onClick={async () => {
                              setEditFaq(faq);
                              setFaqQuestion(faq.question);
                              setFaqAnswer(faq.answer);
                              setFaqLabelsValues(objToConfigValues(faq.labels, kb?.label_keys ?? undefined));
                              setFaqDocMetadataValues(objToConfigValues(faq.doc_metadata, kb?.metadata_keys ?? undefined));
                              const allowMultiple: Record<string, boolean> = {};
                              const metadataIsArray: Record<string, boolean> = {};
                              if (faq.document_id) {
                                try {
                                  const doc = await fetchDocumentById(faq.document_id);
                                  const channel = await fetchChannelById(doc.channel_id);
                                  if (kb?.label_keys?.length) {
                                    const lcMap = new Map(
                                      (channel.label_config ?? []).map((lc: { key: string; allow_multiple?: boolean }) => [lc.key, lc.allow_multiple ?? false])
                                    );
                                    for (const k of kb.label_keys) {
                                      allowMultiple[k] = lcMap.get(k) ?? false;
                                    }
                                  }
                                  if (kb?.metadata_keys?.length) {
                                    const metaFields = normalizeExtractionSchemaToFields(channel.extraction_schema ?? null);
                                    const metaMap = new Map(metaFields.map((f) => [f.key, f.type === 'array']));
                                    for (const k of kb.metadata_keys) {
                                      metadataIsArray[k] = metaMap.get(k) ?? false;
                                    }
                                  }
                                } catch {
                                  /* default to false */
                                }
                              }
                              setFaqLabelAllowMultiple(allowMultiple);
                              setFaqMetadataIsArray(metadataIsArray);
                              setShowFaqDialog(true);
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
              {faqTotal > 0 && (
                <div className="kb-pagination">
                  <div className="kb-pagination-info">
                    <span>
                      Showing {faqTotal === 0 ? 0 : faqPage * faqPageSize + 1}–
                      {Math.min((faqPage + 1) * faqPageSize, faqTotal)} of {faqTotal}
                    </span>
                    <label>
                      <span>Page size:</span>
                      <select
                        value={faqPageSize}
                        onChange={(e) => {
                          setFaqPageSize(Number(e.target.value));
                          setFaqPage(0);
                        }}
                      >
                        {[25, 50, 100, 200].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {Math.ceil(faqTotal / faqPageSize) > 1 && (
                    <div className="kb-pagination-btns">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setFaqPage(0)}
                        disabled={faqPage === 0}
                        title="First page"
                      >
                        «
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setFaqPage((p) => Math.max(0, p - 1))}
                        disabled={faqPage === 0}
                      >
                        Previous
                      </button>
                      <span className="kb-pagination-nums">
                        Page {faqPage + 1} of {Math.ceil(faqTotal / faqPageSize) || 1}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setFaqPage((p) => Math.min(Math.ceil(faqTotal / faqPageSize) - 1, p + 1))}
                        disabled={faqPage >= Math.ceil(faqTotal / faqPageSize) - 1}
                      >
                        Next
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setFaqPage(Math.ceil(faqTotal / faqPageSize) - 1)}
                        disabled={faqPage >= Math.ceil(faqTotal / faqPageSize) - 1}
                        title="Last page"
                      >
                        »
                      </button>
                    </div>
                  )}
                </div>
              )}
              </>
            )}
          </section>
        )}

        {/* ===== CHUNKS TAB ===== */}
        {activeTab === 'chunks' && (
          <section className="kb-section">
            <div className="kb-section-header">
              <h2>Chunks ({chunkTotal})</h2>
            </div>
            {chunkTotal === 0 ? (
              <p className="kb-empty-text">No chunks yet. Run indexing from Settings to generate chunks.</p>
            ) : (
              <>
              <div className="kb-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Excerpt</th>
                      <th>Tokens</th>
                      <th>Embedded</th>
                      <th className="kb-table-actions">Actions</th>
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
                        <td className="kb-table-actions">
                          <div className="kb-table-btns">
                            <button type="button" title="Edit" aria-label="Edit" onClick={() => openChunkEdit(chunk)}>
                              <Pencil size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {chunkTotal > 0 && (
                <div className="kb-pagination">
                  <div className="kb-pagination-info">
                    <span>
                      Showing {chunkTotal === 0 ? 0 : chunkPage * chunkPageSize + 1}–
                      {Math.min((chunkPage + 1) * chunkPageSize, chunkTotal)} of {chunkTotal}
                    </span>
                    <label>
                      <span>Page size:</span>
                      <select
                        value={chunkPageSize}
                        onChange={(e) => {
                          setChunkPageSize(Number(e.target.value));
                          setChunkPage(0);
                        }}
                      >
                        {[25, 50, 100, 200].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {Math.ceil(chunkTotal / chunkPageSize) > 1 && (
                    <div className="kb-pagination-btns">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setChunkPage(0)}
                        disabled={chunkPage === 0}
                        title="First page"
                      >
                        «
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setChunkPage((p) => Math.max(0, p - 1))}
                        disabled={chunkPage === 0}
                      >
                        Previous
                      </button>
                      <span className="kb-pagination-nums">
                        Page {chunkPage + 1} of {Math.ceil(chunkTotal / chunkPageSize) || 1}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setChunkPage((p) => Math.min(Math.ceil(chunkTotal / chunkPageSize) - 1, p + 1))}
                        disabled={chunkPage >= Math.ceil(chunkTotal / chunkPageSize) - 1}
                      >
                        Next
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setChunkPage(Math.ceil(chunkTotal / chunkPageSize) - 1)}
                        disabled={chunkPage >= Math.ceil(chunkTotal / chunkPageSize) - 1}
                        title="Last page"
                      >
                        »
                      </button>
                    </div>
                  )}
                </div>
              )}
              </>
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

              <label>
                <span>FAQ Generation Prompt</span>
                <textarea
                  placeholder="Custom system prompt for FAQ generation (leave empty for default)"
                  value={settingsFaqPrompt}
                  onChange={(e) => setSettingsFaqPrompt(e.target.value)}
                  rows={6}
                />
                <small>System prompt sent to the LLM when generating FAQ pairs from documents</small>
              </label>

              <label>
                <span>Label Keys</span>
                <input
                  type="text"
                  placeholder="product, region"
                  value={settingsLabelKeys}
                  onChange={(e) => setSettingsLabelKeys(e.target.value)}
                />
                <small>Comma-separated keys from document labels to propagate to FAQs and chunks (e.g. product, region)</small>
              </label>

              <label>
                <span>Metadata Keys</span>
                <input
                  type="text"
                  placeholder="author, publish_date, tags"
                  value={settingsMetadataKeys}
                  onChange={(e) => setSettingsMetadataKeys(e.target.value)}
                />
                <small>Comma-separated keys from document metadata to propagate to FAQs and chunks (e.g. author, publish_date, tags)</small>
              </label>

              <div className="kb-settings-actions">
                <button type="button" className="btn btn-primary" disabled={settingsSaving} onClick={handleSaveSettings}>
                  {settingsSaving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>

      {showGenerateModal && (
        <div
          className="kb-doc-picker-overlay"
          onClick={closeGenerateModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="gen-faq-title"
        >
          <div className="kb-doc-picker" onClick={(e) => e.stopPropagation()}>
            <div className="kb-doc-picker-header">
              <h2 id="gen-faq-title">{genStep === 'config' ? 'Generate FAQs' : 'Review FAQs'}</h2>
              <button
                type="button"
                className="kb-doc-picker-close"
                onClick={closeGenerateModal}
                disabled={generating || genSaving}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <p className="kb-doc-picker-hint">
              {genStep === 'config'
                ? 'Select an LLM model and choose which documents to generate Q&A pairs from.'
                : 'Review the generated FAQs. Remove any you do not want to keep, then Save.'}
            </p>

            {genStep === 'config' ? (
              <>
                <div className="kb-gen-model-select">
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
                    <span>Prompt</span>
                    <textarea
                      placeholder="Leave empty to use default prompt"
                      value={genPrompt}
                      onChange={(e) => setGenPrompt(e.target.value)}
                      rows={4}
                    />
                  </label>
                </div>

                <div className="kb-gen-doc-header">
                  <span className="kb-gen-doc-label">Documents</span>
                  <button
                    type="button"
                    className="kb-gen-toggle-all"
                    onClick={() => {
                      if (genSelectedDocs.size === docs.length) setGenSelectedDocs(new Set());
                      else setGenSelectedDocs(new Set(docs.map((d) => d.document_id)));
                    }}
                  >
                    {genSelectedDocs.size === docs.length ? 'Deselect all' : 'Select all'}
                  </button>
                </div>

                <div className="kb-doc-picker-list">
                  {docs.length === 0 ? (
                    <div className="kb-doc-picker-empty">
                      <p>No documents in this knowledge base</p>
                    </div>
                  ) : (
                    docs.map((doc) => {
                      const selected = genSelectedDocs.has(doc.document_id);
                      return (
                        <div
                          key={doc.document_id}
                          className={`kb-doc-picker-item${selected ? ' selected' : ''}`}
                          onClick={() => toggleGenDoc(doc.document_id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && toggleGenDoc(doc.document_id)}
                        >
                          <div className="kb-doc-picker-item-check">
                            {selected ? (
                              <Check size={16} />
                            ) : (
                              <div className="kb-doc-picker-item-checkbox" />
                            )}
                          </div>
                          <FileText size={18} className="kb-doc-picker-item-icon" />
                          <div className="kb-doc-picker-item-info">
                            <span className="kb-doc-picker-item-name">{doc.document_name || doc.document_id}</span>
                            <span className="kb-doc-picker-item-meta">
                              {doc.document_file_type} · {doc.document_status || 'completed'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <div className="kb-gen-review-list">
                {genPreviewFaqs.length === 0 ? (
                  <div className="kb-doc-picker-empty">
                    <p>No FAQs to save. Go back and generate again.</p>
                  </div>
                ) : (
                  genPreviewFaqs.map((faq, idx) => (
                    <div key={idx} className="kb-gen-review-item">
                      <div className="kb-gen-review-content">
                        <span className="kb-gen-review-source">{faq.document_name || faq.document_id}</span>
                        <p className="kb-gen-review-q">{faq.question}</p>
                        <p className="kb-gen-review-a">{faq.answer}</p>
                      </div>
                      <button
                        type="button"
                        className="kb-gen-review-remove"
                        onClick={() => removeGenPreviewFaq(idx)}
                        aria-label="Remove this FAQ"
                        title="Remove"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="kb-doc-picker-footer">
              <span className="kb-doc-picker-count">
                {genStep === 'config'
                  ? (genSelectedDocs.size > 0
                      ? `${genSelectedDocs.size} document${genSelectedDocs.size > 1 ? 's' : ''} selected`
                      : 'No documents selected')
                  : `${genPreviewFaqs.length} FAQ${genPreviewFaqs.length !== 1 ? 's' : ''} to save`}
              </span>
              <div className="kb-doc-picker-actions">
                {genStep === 'config' ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={closeGenerateModal}
                      disabled={generating}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleGenerateFaqs}
                      disabled={!genModelId || genSelectedDocs.size === 0 || generating}
                    >
                      {generating ? (
                        <>
                          <Loader2 size={18} className="kb-doc-picker-spinner" />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={18} />
                          <span>Generate</span>
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleGenBackToConfig}
                      disabled={genSaving}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleSaveGeneratedFaqs}
                      disabled={genPreviewFaqs.length === 0 || genSaving}
                    >
                      {genSaving ? (
                        <>
                          <Loader2 size={18} className="kb-doc-picker-spinner" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Check size={18} />
                          <span>Save {genPreviewFaqs.length} FAQ{genPreviewFaqs.length !== 1 ? 's' : ''}</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showDocPicker && (
        <div
          className="kb-doc-picker-overlay"
          onClick={closeDocPicker}
          role="dialog"
          aria-modal="true"
          aria-labelledby="doc-picker-title"
        >
          <div className="kb-doc-picker" onClick={(e) => e.stopPropagation()}>
            <div className="kb-doc-picker-header">
              <h2 id="doc-picker-title">Add Documents</h2>
              <button
                type="button"
                className="kb-doc-picker-close"
                onClick={closeDocPicker}
                disabled={pickerAdding}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <p className="kb-doc-picker-hint">
              Search and select documents to add to this knowledge base.
            </p>
            <div className="kb-doc-picker-search">
              <SearchIcon size={18} />
              <input
                type="search"
                placeholder="Search documents by name..."
                value={pickerSearch}
                onChange={(e) => handlePickerSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="kb-doc-picker-list">
              {pickerLoading ? (
                <div className="kb-doc-picker-loading">
                  <Loader2 size={24} className="kb-doc-picker-spinner" />
                  <span>Loading documents...</span>
                </div>
              ) : pickerResults.length === 0 ? (
                <div className="kb-doc-picker-empty">
                  <p>No documents found</p>
                </div>
              ) : (
                pickerResults.map((doc) => {
                  const added = alreadyAddedIds.has(doc.id);
                  const selected = pickerSelected.has(doc.id);
                  return (
                    <div
                      key={doc.id}
                      className={`kb-doc-picker-item${selected ? ' selected' : ''}${added ? ' already-added' : ''}`}
                      onClick={() => !added && togglePickerDoc(doc.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && !added && togglePickerDoc(doc.id)}
                    >
                      <div className="kb-doc-picker-item-check">
                        {added ? (
                          <Check size={16} />
                        ) : selected ? (
                          <Check size={16} />
                        ) : (
                          <div className="kb-doc-picker-item-checkbox" />
                        )}
                      </div>
                      <FileText size={18} className="kb-doc-picker-item-icon" />
                      <div className="kb-doc-picker-item-info">
                        <span className="kb-doc-picker-item-name">{doc.name}</span>
                        <span className="kb-doc-picker-item-meta">
                          {doc.file_type} · {doc.status || 'completed'}
                        </span>
                      </div>
                      {added && <span className="kb-doc-picker-item-badge">Added</span>}
                    </div>
                  );
                })
              )}
            </div>
            <div className="kb-doc-picker-footer">
              <span className="kb-doc-picker-count">
                {pickerSelected.size > 0 ? `${pickerSelected.size} selected` : 'No documents selected'}
              </span>
              <div className="kb-doc-picker-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeDocPicker}
                  disabled={pickerAdding}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleAddSelectedDocuments}
                  disabled={pickerSelected.size === 0 || pickerAdding}
                >
                  {pickerAdding ? (
                    <>
                      <Loader2 size={18} className="kb-doc-picker-spinner" />
                      <span>Adding...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={18} />
                      <span>Add {pickerSelected.size > 0 ? `(${pickerSelected.size})` : ''}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showChunkDialog && editChunk && (
        <div
          className="kb-doc-picker-overlay"
          onClick={closeChunkDialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="chunk-dialog-title"
        >
          <div className="kb-doc-picker kb-faq-dialog kb-chunk-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="kb-doc-picker-header">
              <h2 id="chunk-dialog-title">Edit Chunk</h2>
              <button
                type="button"
                className="kb-doc-picker-close"
                onClick={closeChunkDialog}
                disabled={chunkSaving}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="kb-faq-dialog-form">
              <label>
                <span>Source</span>
                <input type="text" value={editChunk.document_name || editChunk.document_id} readOnly disabled className="kb-chunk-dialog-readonly" />
              </label>
              <label>
                <span>Content</span>
                <textarea
                  value={chunkContent}
                  onChange={(e) => setChunkContent(e.target.value)}
                  rows={8}
                />
              </label>

              {kb?.label_keys && kb.label_keys.length > 0 && (
                <div className="kb-kv-editor">
                  <span className="kb-kv-editor-label">Labels</span>
                  <small className="kb-kv-editor-hint">
                    Value per label key from channel settings. {Object.values(chunkLabelAllowMultiple).some(Boolean) ? 'Use comma for multiple values on labels that allow multiple.' : 'Values are stored as single strings.'}
                  </small>
                  {kb.label_keys.map((key) => (
                    <div key={key} className="kb-kv-row kb-kv-row-config">
                      <span className="kb-kv-key-label">{key}{chunkLabelAllowMultiple[key] ? ' (multiple)' : ''}</span>
                      <input
                        type="text"
                        placeholder={chunkLabelAllowMultiple[key] ? `Value(s) for ${key} (comma-separated)` : `Value for ${key}`}
                        value={chunkLabelsValues[key] ?? ''}
                        onChange={(e) => setChunkLabelsValues((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              )}

              {kb?.metadata_keys && kb.metadata_keys.length > 0 && (
                <div className="kb-kv-editor">
                  <span className="kb-kv-editor-label">Document Metadata</span>
                  <small className="kb-kv-editor-hint">
                    Value per metadata key from channel extraction schema. {Object.values(chunkMetadataIsArray).some(Boolean) ? 'Use comma for array fields.' : 'Values are stored as single strings.'}
                  </small>
                  {kb.metadata_keys.map((key) => (
                    <div key={key} className="kb-kv-row kb-kv-row-config">
                      <span className="kb-kv-key-label">{key}{chunkMetadataIsArray[key] ? ' (array)' : ''}</span>
                      <input
                        type="text"
                        placeholder={chunkMetadataIsArray[key] ? `Value(s) for ${key} (comma-separated)` : `Value for ${key}`}
                        value={chunkDocMetadataValues[key] ?? ''}
                        onChange={(e) => setChunkDocMetadataValues((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="kb-doc-picker-footer">
                <div />
                <div className="kb-doc-picker-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeChunkDialog} disabled={chunkSaving}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleSaveChunk} disabled={chunkSaving || !chunkContent.trim()}>
                    {chunkSaving ? 'Saving...' : 'Update'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showFaqDialog && (
        <div
          className="kb-doc-picker-overlay"
          onClick={() => { setShowFaqDialog(false); setEditFaq(null); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="faq-dialog-title"
        >
          <div className="kb-doc-picker kb-faq-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="kb-doc-picker-header">
              <h2 id="faq-dialog-title">{editFaq ? 'Edit FAQ' : 'Add FAQ'}</h2>
              <button
                type="button"
                className="kb-doc-picker-close"
                onClick={() => { setShowFaqDialog(false); setEditFaq(null); }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="kb-faq-dialog-form">
              <label>
                <span>Question</span>
                <input
                  type="text"
                  placeholder="Question"
                  value={faqQuestion}
                  onChange={(e) => setFaqQuestion(e.target.value)}
                  autoFocus
                />
              </label>
              <label>
                <span>Answer</span>
                <textarea
                  placeholder="Answer"
                  value={faqAnswer}
                  onChange={(e) => setFaqAnswer(e.target.value)}
                  rows={5}
                />
              </label>

              {kb?.label_keys && kb.label_keys.length > 0 && (
                <div className="kb-kv-editor">
                  <span className="kb-kv-editor-label">Labels</span>
                  <small className="kb-kv-editor-hint">
                    Value per label key from channel settings. {Object.values(faqLabelAllowMultiple).some(Boolean) ? 'Use comma for multiple values on labels that allow multiple.' : 'Values are stored as single strings.'}
                  </small>
                  {kb.label_keys.map((key) => (
                    <div key={key} className="kb-kv-row kb-kv-row-config">
                      <span className="kb-kv-key-label">{key}{faqLabelAllowMultiple[key] ? ' (multiple)' : ''}</span>
                      <input
                        type="text"
                        placeholder={faqLabelAllowMultiple[key] ? `Value(s) for ${key} (comma-separated)` : `Value for ${key}`}
                        value={faqLabelsValues[key] ?? ''}
                        onChange={(e) => setFaqLabelsValues((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              )}

              {kb?.metadata_keys && kb.metadata_keys.length > 0 && (
                <div className="kb-kv-editor">
                  <span className="kb-kv-editor-label">Document Metadata</span>
                  <small className="kb-kv-editor-hint">
                    Value per metadata key from channel extraction schema. {Object.values(faqMetadataIsArray).some(Boolean) ? 'Use comma for array fields.' : 'Values are stored as single strings.'}
                  </small>
                  {kb.metadata_keys.map((key) => (
                    <div key={key} className="kb-kv-row kb-kv-row-config">
                      <span className="kb-kv-key-label">{key}{faqMetadataIsArray[key] ? ' (array)' : ''}</span>
                      <input
                        type="text"
                        placeholder={faqMetadataIsArray[key] ? `Value(s) for ${key} (comma-separated)` : `Value for ${key}`}
                        value={faqDocMetadataValues[key] ?? ''}
                        onChange={(e) => setFaqDocMetadataValues((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="kb-doc-picker-footer">
                <div />
                <div className="kb-doc-picker-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => { setShowFaqDialog(false); setEditFaq(null); }}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleSaveFaq} disabled={!faqQuestion.trim() || !faqAnswer.trim()}>
                    {editFaq ? 'Update' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
