import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Settings, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchKnowledgeBase,
  fetchKBDocuments,
  fetchAllKBDocuments,
  fetchKBWikiSpaces,
  fetchFAQs,
  fetchChunks,
  fetchChunkById,
  addKBDocument,
  removeKBDocument,
  addKBWikiSpace,
  removeKBWikiSpace,
  createFAQ,
  polishFAQAnswer,
  updateFAQ,
  deleteFAQ,
  generateFAQs,
  saveFAQs,
  searchKnowledgeBase,
  updateKnowledgeBase,
  updateChunk,
  enqueueKnowledgeBaseIndexJob,
  enqueueKnowledgeBaseWikiSpaceIndexJob,
  listKbAgentConversations,
  listAllKbAgentMessages,
  createKbAgentConversation,
  deleteKbAgentConversation,
  patchKbAgentConversation,
  postKbAgentMessageStream,
  getStoredKbQaConversationId,
  setStoredKbQaConversationId,
  clearStoredKbQaConversationId,
  type KnowledgeBaseResponse,
  type KBDocumentResponse,
  type KBWikiSpaceResponse,
  type FAQResponse,
  type FAQGenerateResult,
  type ChunkResponse,
  type SearchResult,
} from '../../data/knowledgeBasesApi';
import type { AgentConversationResponse } from '../../data/agentApi';
import { fetchDocuments, fetchDocumentById, type DocumentListItemResponse } from '../../data/documentsApi';
import { fetchAllWikiSpaces, type WikiSpaceResponse } from '../../data/wikiSpacesApi';
import { fetchChannelById } from '../../data/channelsApi';
import { useEnsureDocumentChannels } from '../../contexts/DocumentChannelsContext';
import { normalizeExtractionSchemaToFields } from '../../data/channelUtils';
import { fetchAllModels, type ApiModelResponse } from '../../data/modelsApi';
import { applyCopilotStreamEvent } from '../../components/agents/agentStreamState';
import {
  kbAgentItemsToChatMessages,
  kbQaLineId,
} from './KnowledgeBaseDetail.qaUtils';
import { kbComputeSearchDiff, kbSnapshotFromResults } from './KnowledgeBaseDetail.searchUtils';
import { configValuesToMetadata, objToConfigValues } from './KnowledgeBaseDetail.metadataUtils';
import {
  TAB_ORDER,
  type ChatMessage,
  type KbSearchRetrievalDiff,
  type KbSearchSnapshot,
  type KbQaFeedbackVote,
  type SettingsSubTabId,
  type TabId,
} from './KnowledgeBaseDetail.types';

export function useKnowledgeBaseDetail() {
  const { id: kbId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { channels } = useEnsureDocumentChannels();
  const { t } = useTranslation('knowledgeBase');
  const [kb, setKb] = useState<KnowledgeBaseResponse | null>(null);
  const initialTab = (searchParams.get('tab') as TabId) || 'documents';
  const [activeTab, setActiveTab] = useState<TabId>(TAB_ORDER.includes(initialTab) ? initialTab : 'documents');
  const [qaFullPage, setQaFullPage] = useState(false);
  const [loading, setLoading] = useState(true);

  // Documents
  const [docs, setDocs] = useState<KBDocumentResponse[]>([]);
  const [docTotal, setDocTotal] = useState(0);
  const [docPage, setDocPage] = useState(0);
  const [docPageSize, setDocPageSize] = useState(50);
  const [linkedDocIds, setLinkedDocIds] = useState<Set<string>>(new Set());
  const [genDocs, setGenDocs] = useState<KBDocumentResponse[]>([]);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerResults, setPickerResults] = useState<DocumentListItemResponse[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());
  const [pickerSelectedChannel, setPickerSelectedChannel] = useState<string | null>(null);
  const [pickerChannelExpanded, setPickerChannelExpanded] = useState<Record<string, boolean>>({});
  const [pickerSearchDebounced, setPickerSearchDebounced] = useState('');
  const [pickerPage, setPickerPage] = useState(0);
  const [pickerPageSize] = useState(20);
  const [pickerTotal, setPickerTotal] = useState(0);
  const [pickerAdding, setPickerAdding] = useState(false);
  const pickerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [kbWikiSpaces, setKbWikiSpaces] = useState<KBWikiSpaceResponse[]>([]);
  const [showWikiSpacePicker, setShowWikiSpacePicker] = useState(false);
  const [wikiSpacePickerItems, setWikiSpacePickerItems] = useState<WikiSpaceResponse[]>([]);
  const [wikiSpacePickerLoading, setWikiSpacePickerLoading] = useState(false);
  const [wikiSpaceBusyId, setWikiSpaceBusyId] = useState<string | null>(null);

  // FAQs
  const [faqs, setFaqs] = useState<FAQResponse[]>([]);
  const [faqTotal, setFaqTotal] = useState(0);
  const [faqPage, setFaqPage] = useState(0);
  const [faqPageSize, setFaqPageSize] = useState(50);
  const [showFaqDialog, setShowFaqDialog] = useState(false);
  const [faqDialogSource, setFaqDialogSource] = useState<'manual' | 'from_qa'>('manual');
  const [faqPolishing, setFaqPolishing] = useState(false);
  const [editFaq, setEditFaq] = useState<FAQResponse | null>(null);
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');
  const [, setFaqLabelsValues] = useState<Record<string, string>>({});
  const [faqDocMetadataValues, setFaqDocMetadataValues] = useState<Record<string, string>>({});
  const [, setFaqLabelAllowMultiple] = useState<Record<string, boolean>>({});
  const [faqMetadataIsArray, setFaqMetadataIsArray] = useState<Record<string, boolean>>({});
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [genSelectedDocs, setGenSelectedDocs] = useState<Set<string>>(new Set());
  const [genModelId, setGenModelId] = useState('');
  const [genPrompt, setGenPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<{ current: number; total: number; documentName: string } | null>(null);
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
  const [, setChunkLabelsValues] = useState<Record<string, string>>({});
  const [chunkDocMetadataValues, setChunkDocMetadataValues] = useState<Record<string, string>>({});
  const [, setChunkLabelAllowMultiple] = useState<Record<string, boolean>>({});
  const [chunkMetadataIsArray, setChunkMetadataIsArray] = useState<Record<string, boolean>>({});
  const [chunkSaving, setChunkSaving] = useState(false);
  const [chunkDialogReadOnly, setChunkDialogReadOnly] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'all' | 'chunks' | 'faqs'>('all');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchOptionsExpanded, setSearchOptionsExpanded] = useState(false);
  const [searchLabelFilters] = useState<Record<string, string>>({});
  const [searchMetadataFilters, setSearchMetadataFilters] = useState<Record<string, string>>({});
  const [searchTopK, setSearchTopK] = useState(10);
  const [searchForceDense, setSearchForceDense] = useState(false);
  const searchPrevSnapshotRef = useRef<KbSearchSnapshot | null>(null);
  const [searchRetrievalDiff, setSearchRetrievalDiff] = useState<KbSearchRetrievalDiff | null>(null);

  // QA
  const [qaInput, setQaInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [qaFeedback, setQaFeedback] = useState<Record<string, KbQaFeedbackVote>>({});
  const [qaLoading, setQaLoading] = useState(false);
  const qaStreamAbortRef = useRef<AbortController | null>(null);
  /** Langfuse session id for KB Q&A turns while this full-page chat is open (opaque UUID). */
  const qaTraceSessionRef = useRef<string | null>(null);
  /** Which source indexes are expanded (full detail), keyed by assistant ``replyKey``. */
  const [qaSourcesExpanded, setQaSourcesExpanded] = useState<Record<string, Set<number>>>({});
  const kbIdRef = useRef(kbId);
  kbIdRef.current = kbId;
  const [kbQaConvId, setKbQaConvId] = useState<string | null>(null);
  const [kbQaConversations, setKbQaConversations] = useState<AgentConversationResponse[]>([]);
  const [kbQaConvsLoading, setKbQaConvsLoading] = useState(false);
  const [kbQaConvReady, setKbQaConvReady] = useState(false);
  const kbQaMainScrollRef = useRef<HTMLDivElement | null>(null);

  // Settings
  const [settingsAgentUrl, setSettingsAgentUrl] = useState('');
  const [settingsEmbeddingModelId, setSettingsEmbeddingModelId] = useState('');
  const [settingsFaqPrompt, setSettingsFaqPrompt] = useState('');
  const [settingsChunkStrategy, setSettingsChunkStrategy] = useState('fixed_size');
  const [settingsChunkSize, setSettingsChunkSize] = useState(8000);
  const [settingsChunkOverlap, setSettingsChunkOverlap] = useState(50);
  const [settingsMetadataKeys, setSettingsMetadataKeys] = useState('');
  const [embeddingModels, setEmbeddingModels] = useState<ApiModelResponse[]>([]);
  const [llmModels, setLlmModels] = useState<ApiModelResponse[]>([]);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTabId>('general');
  const [indexJobSubmitting, setIndexJobSubmitting] = useState(false);

  const settingsSubTabs = useMemo(
    () =>
      [
        { id: 'general' as const, label: t('detail.settingsTabGeneral'), icon: Settings },
        { id: 'sharing' as const, label: t('detail.settingsTabSharing'), icon: Users },
      ],
    [t],
  );

  const loadKb = useCallback(async () => {
    if (!kbId) return;
    try {
      const data = await fetchKnowledgeBase(kbId);
      setKb(data);
      setSettingsAgentUrl(data.agent_url || '');
      setSettingsEmbeddingModelId(data.embedding_model_id || '');
      const cc = (data.chunk_config || {}) as Record<string, unknown>;
      setSettingsChunkStrategy((cc.strategy as string) || 'fixed_size');
      setSettingsChunkSize((cc.chunk_size as number) || 8000);
      setSettingsChunkOverlap((cc.chunk_overlap as number) || 50);
      setSettingsFaqPrompt(data.faq_prompt || '');
      setSettingsMetadataKeys(Array.isArray(data.metadata_keys) ? data.metadata_keys.join(', ') : '');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastLoadKbFailed'));
    } finally {
      setLoading(false);
    }
  }, [kbId, t]);

  const refreshLinkedDocIds = useCallback(async () => {
    if (!kbId) return;
    try {
      const all = await fetchAllKBDocuments(kbId);
      setLinkedDocIds(new Set(all.map((d) => d.document_id)));
    } catch { /* noop */ }
  }, [kbId]);

  const loadDocs = useCallback(async () => {
    if (!kbId) return;
    try {
      const data = await fetchKBDocuments(kbId, { offset: docPage * docPageSize, limit: docPageSize });
      setDocs(data.items);
      setDocTotal(data.total);
      setDocPage((p) => {
        const maxP = data.total > 0 ? Math.ceil(data.total / docPageSize) - 1 : 0;
        return Math.min(p, Math.max(0, maxP));
      });
    } catch { /* noop */ }
  }, [kbId, docPage, docPageSize]);

  const loadKbWikiSpaces = useCallback(async () => {
    if (!kbId) return;
    try {
      setKbWikiSpaces(await fetchKBWikiSpaces(kbId));
    } catch { /* noop */ }
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

  const enqueueIndexJob = useCallback(async () => {
    if (!kbId) return;
    if (!kb?.embedding_model_id) {
      toast.error(t('detail.indexJobRequiresEmbedding'));
      return;
    }
    setIndexJobSubmitting(true);
    try {
      const job = await enqueueKnowledgeBaseIndexJob(kbId);
      toast.success(t('detail.indexJobToastQueued', { id: job.id }));
      navigate(`/job-runs/${job.id}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.indexJobToastFailed'));
    } finally {
      setIndexJobSubmitting(false);
    }
  }, [kbId, kb?.embedding_model_id, navigate, t]);

  const loadModels = useCallback(async () => {
    try {
      const emb = await fetchAllModels({ api_kind: 'embeddings' });
      setEmbeddingModels(emb);
      const llm = await fetchAllModels({ api_kind: 'chat-completions' });
      setLlmModels(llm);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { loadKb(); loadModels(); }, [loadKb, loadModels]);

  useEffect(() => {
    const q = searchParams.get('tab');
    if (!q) return;
    if (TAB_ORDER.includes(q as TabId)) {
      setActiveTab(q as TabId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (kbId) void refreshLinkedDocIds();
  }, [kbId, refreshLinkedDocIds]);

  useEffect(() => {
    if (activeTab === 'documents') void loadDocs();
    if (activeTab === 'wiki_spaces') void loadKbWikiSpaces();
    if (activeTab === 'faqs') loadFaqs();
    if (activeTab === 'chunks') loadChunks();
  }, [activeTab, loadDocs, loadKbWikiSpaces, loadFaqs, loadChunks]);

  useEffect(() => {
    if (qaFullPage && kb && !kb.agent_url) {
      setQaFullPage(false);
    }
  }, [qaFullPage, kb]);

  useEffect(() => {
    if (qaFullPage && kb?.agent_url) {
      document.body.classList.add('openkms-kb-qa-fullpage');
      return () => {
        document.body.classList.remove('openkms-kb-qa-fullpage');
      };
    }
    document.body.classList.remove('openkms-kb-qa-fullpage');
    return undefined;
  }, [qaFullPage, kb?.agent_url]);

  useLayoutEffect(() => {
    if (!qaFullPage || !kb?.agent_url) return;
    const sc = kbQaMainScrollRef.current;
    if (!sc) return;
    sc.scrollTop = sc.scrollHeight;
  }, [qaFullPage, kb?.agent_url, chatMessages, qaLoading]);

  const loadKbQaMessagesForConversation = useCallback(
    async (conversationId: string) => {
      if (!kbId) return;
      const msgs = await listAllKbAgentMessages(kbId, conversationId);
      setChatMessages(kbAgentItemsToChatMessages(msgs));
      setQaFeedback({});
    },
    [kbId]
  );

  useEffect(() => {
    if (!qaFullPage || !kbId) return;
    let cancelled = false;
    (async () => {
      setKbQaConvReady(false);
      setKbQaConvsLoading(true);
      try {
        const items = await listKbAgentConversations(kbId);
        if (cancelled) return;
        setKbQaConversations(items);
        const stored = getStoredKbQaConversationId(kbId);
        const validStored = stored && items.some((x) => x.id === stored) ? stored : null;
        const nextId = validStored || items[0]?.id || null;
        setKbQaConvId(nextId);
        if (nextId) {
          setStoredKbQaConversationId(kbId, nextId);
          try {
            await loadKbQaMessagesForConversation(nextId);
          } catch {
            if (!cancelled) {
              setChatMessages([]);
              toast.error(t('detail.qaToastLoadMessagesFailed'));
            }
          }
        } else {
          clearStoredKbQaConversationId(kbId);
          if (!cancelled) setChatMessages([]);
        }
      } catch {
        if (!cancelled) toast.error(t('detail.qaToastLoadConversationsFailed'));
      } finally {
        if (!cancelled) {
          setKbQaConvsLoading(false);
          setKbQaConvReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qaFullPage, kbId, t, loadKbQaMessagesForConversation]);

  // --- Document picker ---
  const alreadyAddedIds = linkedDocIds;

  const openDocPicker = async () => {
    setShowDocPicker(true);
    setPickerSearch('');
    setPickerSearchDebounced('');
    setPickerSelected(new Set());
    setPickerSelectedChannel(null);
    setPickerPage(0);
    setPickerResults([]);
    setPickerTotal(0);
    setPickerLoading(false);
    setPickerChannelExpanded(
      channels.reduce<Record<string, boolean>>((acc, ch) => {
        if (ch.children?.length) acc[ch.id] = true;
        return acc;
      }, {})
    );
  };

  const handlePickerChannelSelect = (channelId: string) => {
    setPickerSelectedChannel(channelId);
    setPickerPage(0);
  };

  const handlePickerChannelToggle = (channelId: string) => {
    setPickerChannelExpanded((prev) => ({ ...prev, [channelId]: !prev[channelId] }));
  };

  const loadPickerDocuments = useCallback(async () => {
    if (!pickerSelectedChannel) {
      setPickerResults([]);
      setPickerTotal(0);
      return;
    }
    setPickerLoading(true);
    try {
      const res = await fetchDocuments({
        channel_id: pickerSelectedChannel,
        search: pickerSearchDebounced || undefined,
        offset: pickerPage * pickerPageSize,
        limit: pickerPageSize,
      });
      setPickerResults(res.items);
      setPickerTotal(res.total);
    } catch { /* noop */ }
    finally { setPickerLoading(false); }
  }, [pickerSelectedChannel, pickerSearchDebounced, pickerPage, pickerPageSize]);

  useEffect(() => {
    if (showDocPicker && pickerSelectedChannel) {
      loadPickerDocuments();
    } else if (showDocPicker && !pickerSelectedChannel) {
      setPickerResults([]);
      setPickerTotal(0);
    }
  }, [showDocPicker, pickerSelectedChannel, loadPickerDocuments]);

  const handlePickerSearch = (query: string) => {
    setPickerSearch(query);
    if (pickerDebounceRef.current) clearTimeout(pickerDebounceRef.current);
    pickerDebounceRef.current = setTimeout(() => {
      setPickerSearchDebounced(query);
      setPickerPage(0);
    }, 300);
  };

  const pickerTotalPages = Math.ceil(pickerTotal / pickerPageSize) || 1;
  const pickerCanPrev = pickerPage > 0;
  const pickerCanNext = pickerPage < pickerTotalPages - 1;

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
      toast.success(t('detail.toastDocumentsAdded', { count: added }));
      void loadDocs();
      void refreshLinkedDocIds();
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
      toast.success(t('detail.toastDocRemoved'));
      void loadDocs();
      void refreshLinkedDocIds();
      loadKb();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastRemoveDocFailed'));
    }
  };

  const openWikiSpacePicker = async () => {
    setShowWikiSpacePicker(true);
    setWikiSpacePickerLoading(true);
    setWikiSpacePickerItems([]);
    try {
      const res = await fetchAllWikiSpaces();
      setWikiSpacePickerItems(res);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastWikiSpacesLoadFailed'));
    } finally {
      setWikiSpacePickerLoading(false);
    }
  };

  const closeWikiSpacePicker = () => {
    if (!wikiSpaceBusyId) setShowWikiSpacePicker(false);
  };

  const handleAddWikiSpaceToKb = async (wikiSpaceId: string) => {
    if (!kbId) return;
    setWikiSpaceBusyId(wikiSpaceId);
    try {
      await addKBWikiSpace(kbId, wikiSpaceId);
      toast.success(t('detail.toastWikiSpaceLinked'));
      await loadKbWikiSpaces();
      await loadKb();
      setShowWikiSpacePicker(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastWikiSpaceLinkFailed'));
    } finally {
      setWikiSpaceBusyId(null);
    }
  };

  const handleRemoveWikiSpaceFromKb = async (wikiSpaceId: string) => {
    if (!kbId) return;
    setWikiSpaceBusyId(wikiSpaceId);
    try {
      await removeKBWikiSpace(kbId, wikiSpaceId);
      toast.success(t('detail.toastWikiSpaceRemoved'));
      await loadKbWikiSpaces();
      await loadKb();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastWikiSpaceRemoveFailed'));
    } finally {
      setWikiSpaceBusyId(null);
    }
  };

  const handleIndexWikiSpace = async (wikiSpaceId: string) => {
    if (!kbId) return;
    if (!kb?.embedding_model_id) {
      toast.error(t('detail.indexJobRequiresEmbedding'));
      return;
    }
    setWikiSpaceBusyId(wikiSpaceId);
    try {
      const job = await enqueueKnowledgeBaseWikiSpaceIndexJob(kbId, wikiSpaceId);
      toast.success(t('detail.wikiSpaceIndexJobQueued', { id: job.id }));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.wikiSpaceIndexJobFailed'));
    } finally {
      setWikiSpaceBusyId(null);
    }
  };

  // --- FAQ handlers ---

  const kbQaAssistantText = (msg: ChatMessage): string => msg.content?.trim() ?? '';

  const setKbQaFeedbackVote = (key: string, vote: KbQaFeedbackVote) => {
    setQaFeedback((prev) => {
      if (prev[key] === vote) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: vote };
    });
  };

  const closeFaqDialog = () => {
    setShowFaqDialog(false);
    setEditFaq(null);
    setFaqDialogSource('manual');
    setFaqPolishing(false);
  };

  const openFaqFromQa = (question: string, answer: string) => {
    setEditFaq(null);
    setFaqDialogSource('from_qa');
    setFaqQuestion(question.trim());
    setFaqAnswer(answer.trim());
    setFaqLabelsValues({});
    setFaqDocMetadataValues({});
    setFaqLabelAllowMultiple({});
    setFaqMetadataIsArray({});
    setShowFaqDialog(true);
  };

  const handlePolishFaqAnswer = async () => {
    if (!kbId || !faqQuestion.trim() || !faqAnswer.trim() || faqPolishing) return;
    setFaqPolishing(true);
    try {
      const res = await polishFAQAnswer(kbId, {
        question: faqQuestion.trim(),
        answer: faqAnswer.trim(),
      });
      setFaqAnswer(res.answer);
      toast.success(t('detail.toastFaqPolished'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastFaqPolishFailed'));
    } finally {
      setFaqPolishing(false);
    }
  };

  const handleSaveFaq = async () => {
    if (!kbId || !faqQuestion.trim() || !faqAnswer.trim()) return;
    try {
      const doc_metadata = configValuesToMetadata(
        faqDocMetadataValues,
        kb?.metadata_keys ?? undefined,
        faqMetadataIsArray
      );
      const payload = { question: faqQuestion, answer: faqAnswer, doc_metadata: doc_metadata ?? undefined };
      if (editFaq) {
        await updateFAQ(kbId, editFaq.id, payload);
        toast.success(t('detail.toastFaqUpdated'));
      } else {
        await createFAQ(kbId, payload);
        toast.success(t('detail.toastFaqCreated'));
      }
      closeFaqDialog();
      setFaqQuestion('');
      setFaqAnswer('');
      setFaqLabelsValues({});
      setFaqDocMetadataValues({});
      setFaqLabelAllowMultiple({});
      setFaqMetadataIsArray({});
      loadFaqs();
      loadKb();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastSaveFaqFailed'));
    }
  };

  const handleDeleteFaq = async (faqId: string) => {
    if (!kbId) return;
    try {
      await deleteFAQ(kbId, faqId);
      toast.success(t('detail.toastFaqDeleted'));
      loadFaqs();
      loadKb();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastDeleteFaqFailed'));
    }
  };

  const openGenerateModal = async () => {
    if (!kbId) return;
    try {
      const all = await fetchAllKBDocuments(kbId);
      setGenDocs(all);
      setGenSelectedDocs(new Set(all.map((d) => d.document_id)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastLoadKbFailed'));
      return;
    }
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
      toast.error(t('detail.toastSelectDoc'));
      return;
    }
    const docIdToName = new Map(genDocs.map((d) => [d.document_id, d.document_name || d.document_id]));
    setGenerating(true);
    setGenProgress(null);
    try {
      const allResults: FAQGenerateResult[] = [];
      if (docIds.length === 1) {
        setGenProgress({
          current: 1,
          total: 1,
          documentName: docIdToName.get(docIds[0]) || docIds[0],
        });
        const result = await generateFAQs(kbId, {
          document_ids: docIds,
          model_id: genModelId,
          prompt: genPrompt.trim() || undefined,
        });
        allResults.push(...result);
      } else {
        for (let i = 0; i < docIds.length; i++) {
          const docId = docIds[i];
          setGenProgress({
            current: i + 1,
            total: docIds.length,
            documentName: docIdToName.get(docId) || docId,
          });
          const result = await generateFAQs(kbId, {
            document_ids: [docId],
            model_id: genModelId,
            prompt: genPrompt.trim() || undefined,
          });
          allResults.push(...result);
        }
      }
      setGenProgress(null);
      setGenPreviewFaqs(allResults);
      setGenStep('review');
      toast.success(t('detail.toastGenDone', { count: allResults.length }));
    } catch (e: unknown) {
      setGenProgress(null);
      toast.error(e instanceof Error ? e.message : t('detail.toastGenFailed'));
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
        doc_metadata: f.doc_metadata ?? undefined,
      }));
      await saveFAQs(kbId, items);
      toast.success(t('detail.toastFaqsSaved', { count: items.length }));
      setShowGenerateModal(false);
      loadFaqs();
      loadKb();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastSaveFaqsFailed'));
    } finally {
      setGenSaving(false);
    }
  };

  const handleGenBackToConfig = () => {
    setGenStep('config');
    setGenPreviewFaqs([]);
  };

  // --- Chunk edit ---
  const openChunkEdit = async (chunk: ChunkResponse, options?: { readOnly?: boolean }) => {
    setChunkDialogReadOnly(options?.readOnly ?? false);
    setEditChunk(chunk);
    setChunkContent(chunk.content);
    const metaValues = objToConfigValues(chunk.doc_metadata, kb?.metadata_keys ?? undefined);
    setChunkLabelsValues(metaValues);
    setChunkDocMetadataValues(metaValues);
    const metadataIsArray: Record<string, boolean> = {};
    if (chunk.document_id) {
      try {
        const doc = await fetchDocumentById(chunk.document_id);
        const channel = await fetchChannelById(doc.channel_id);
        if (kb?.metadata_keys?.length) {
          const metaFields = normalizeExtractionSchemaToFields(channel.extraction_schema ?? null);
          const metaMap = new Map(metaFields.map((f) => [f.key, f.type === 'array']));
          const lcMap = new Map(
            (channel.label_config ?? []).map((lc: { key: string; type?: string }) => [lc.key, lc.type === 'list[object_type]'])
          );
          for (const k of kb.metadata_keys) {
            metadataIsArray[k] = metaMap.get(k) ?? lcMap.get(k) ?? false;
          }
        }
      } catch {
        /* default to false */
      }
    }
    setChunkLabelAllowMultiple({});
    setChunkMetadataIsArray(metadataIsArray);
    setShowChunkDialog(true);
  };

  const openChunkViewFromId = async (chunkId: string) => {
    if (!kbId) return;
    try {
      const c = await fetchChunkById(kbId, chunkId);
      await openChunkEdit(c, { readOnly: true });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastChunkFailed'));
    }
  };

  const openChunkEditFromId = async (chunkId: string) => {
    if (!kbId) return;
    try {
      const c = await fetchChunkById(kbId, chunkId);
      await openChunkEdit(c);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastChunkFailed'));
    }
  };

  const closeChunkDialog = () => {
    setShowChunkDialog(false);
    setEditChunk(null);
    setChunkDialogReadOnly(false);
  };

  const handleSaveChunk = async () => {
    if (!kbId || !editChunk) return;
    setChunkSaving(true);
    try {
      const doc_metadata = configValuesToMetadata(
        chunkDocMetadataValues,
        kb?.metadata_keys ?? undefined,
        chunkMetadataIsArray
      );
      await updateChunk(kbId, editChunk.id, {
        content: chunkContent,
        doc_metadata: doc_metadata ?? undefined,
      });
      toast.success(t('detail.toastChunkUpdated'));
      closeChunkDialog();
      loadChunks();
      loadKb();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastChunkFailed'));
    } finally {
      setChunkSaving(false);
    }
  };

  // --- Search ---
  const parseFilterValue = (v: string): string | string[] => {
    const trimmed = v.trim();
    if (!trimmed) return trimmed;
    if (trimmed.includes(',')) {
      return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return trimmed;
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kbId || !searchQuery.trim()) return;
    setSearching(true);
    try {
      const metadata_filters: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(searchMetadataFilters)) {
        const parsed = parseFilterValue(v);
        if (parsed && (typeof parsed === 'string' ? parsed : parsed.length > 0)) {
          metadata_filters[k] = parsed;
        }
      }
      const res = await searchKnowledgeBase(kbId, {
        query: searchQuery,
        top_k: searchTopK,
        search_type: searchType,
        force_dense: searchForceDense || undefined,
        metadata_filters: Object.keys(metadata_filters).length ? metadata_filters : undefined,
      });
      const snap = kbSnapshotFromResults(
        searchQuery,
        searchType,
        searchTopK,
        searchForceDense,
        res.results
      );
      const prev = searchPrevSnapshotRef.current;
      setSearchRetrievalDiff(prev ? kbComputeSearchDiff(prev, snap) : null);
      searchPrevSnapshotRef.current = snap;
      setSearchResults(res.results);
      setHasSearched(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastSearchFailed'));
    } finally {
      setSearching(false);
    }
  };

  // --- QA (persisted threads; NDJSON via backend → qa-agent, like wiki copilot) ---
  const onSelectKbQaConversation = async (id: string) => {
    if (!kbId || !id || id === kbQaConvId) return;
    setKbQaConvId(id);
    setStoredKbQaConversationId(kbId, id);
    try {
      await loadKbQaMessagesForConversation(id);
    } catch {
      toast.error(t('detail.qaToastLoadMessagesFailed'));
    }
  };

  const onNewKbQaChat = async () => {
    if (!kbId) return;
    try {
      const c = await createKbAgentConversation(kbId);
      setKbQaConvId(c.id);
      setStoredKbQaConversationId(kbId, c.id);
      setKbQaConversations((prev) => [c, ...prev.filter((x) => x.id !== c.id)]);
      setChatMessages([]);
      setQaFeedback({});
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.qaToastNewChatFailed'));
    }
  };

  const onRenameKbQaChat = async (id: string, title: string) => {
    if (!kbId) return;
    try {
      const updated = await patchKbAgentConversation(kbId, id, { title });
      setKbQaConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.qaToastRenameChatFailed'));
    }
  };

  const onDeleteKbQaChat = async (id: string) => {
    if (!kbId) return;
    const deletingActive = kbQaConvId === id;
    try {
      await deleteKbAgentConversation(kbId, id);
      const items = await listKbAgentConversations(kbId);
      setKbQaConversations(items);
      if (!deletingActive) return;
      const next = items[0]?.id || null;
      setKbQaConvId(next);
      if (next) {
        setStoredKbQaConversationId(kbId, next);
        await loadKbQaMessagesForConversation(next);
      } else {
        clearStoredKbQaConversationId(kbId);
        setChatMessages([]);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.qaToastDeleteChatFailed'));
    }
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kbId || !qaInput.trim() || !kbQaConvReady) return;
    const startedKb = kbId;
    const userText = qaInput.trim();

    qaStreamAbortRef.current?.abort();
    const ac = new AbortController();
    qaStreamAbortRef.current = ac;

    setQaInput('');
    const tempUserId = kbQaLineId();
    const asstStreamId = kbQaLineId();
    let streamPersistedUserId: string | null = null;

    setChatMessages((prev) => [
      ...prev,
      { id: tempUserId, role: 'user', content: userText },
      { id: asstStreamId, role: 'assistant', content: '', streamParts: [], replyKey: asstStreamId },
    ]);
    setQaLoading(true);
    try {
      let convId = kbQaConvId;
      if (!convId) {
        const c = await createKbAgentConversation(kbId);
        if (startedKb !== kbIdRef.current) return;
        convId = c.id;
        setKbQaConvId(c.id);
        setKbQaConversations((prev) => [c, ...prev.filter((x) => x.id !== c.id)]);
        setStoredKbQaConversationId(kbId, c.id);
      }

      await postKbAgentMessageStream(
        kbId,
        convId,
        userText,
        (ev) => {
          if (startedKb !== kbIdRef.current) return;
          if (ev.type === 'user') {
            streamPersistedUserId = ev.message.id;
          }
          if (ev.type === 'done' && !('user' in ev)) {
            setChatMessages((prev) => {
              const next = [...prev];
              for (let i = next.length - 1; i >= 0; i--) {
                if (next[i].role === 'assistant') {
                  const m = next[i];
                  next[i] = {
                    ...m,
                    content: ev.answer,
                    sources: ev.sources,
                    streamParts: m.streamParts && m.streamParts.length > 0 ? m.streamParts : undefined,
                  };
                  break;
                }
              }
              return next;
            });
            return;
          }
          if (ev.type === 'error') {
            if ('message' in ev && ev.message) {
              setChatMessages((prev) =>
                prev.map((p) =>
                  p.id === asstStreamId
                    ? {
                        ...p,
                        id: ev.message.id,
                        content: ev.message.content,
                        replyKey: ev.message.id,
                      }
                    : p,
                ),
              );
              return;
            }
            const msg = `${t('detail.qaErrorPrefix')} ${ev.detail}${ev.answer ? ` ${ev.answer}` : ''}`;
            setChatMessages((prev) => {
              const next = [...prev];
              for (let i = next.length - 1; i >= 0; i--) {
                if (next[i].role === 'assistant') {
                  next[i] = { ...next[i], role: 'assistant', content: msg };
                  break;
                }
              }
              return next;
            });
            return;
          }
          applyCopilotStreamEvent<ChatMessage>(ev, { asstStreamId, userTempId: tempUserId, userText }, {
            setLines: setChatMessages,
            getText: (p) => p.content,
            setText: (p, text) => ({ ...p, content: text }),
            onDone: (prev, { userText: savedText, streamed, ev: doneEv, asstStreamId: aId, userTempId: uId }) => {
              const kbDone = doneEv as Extract<typeof ev, { type: 'done' }> & {
                user: { id: string };
                message: { id: string; content: string };
                sources?: SearchResult[];
              };
              const without = prev.filter(
                (p) => p.id !== aId && p.id !== kbDone.user.id && (uId == null || p.id !== uId),
              );
              const parts = streamed?.role === 'assistant' ? streamed.streamParts : undefined;
              return [
                ...without,
                { id: kbDone.user.id, role: 'user' as const, content: savedText },
                {
                  id: kbDone.message.id,
                  role: 'assistant' as const,
                  content: kbDone.message.content,
                  sources: kbDone.sources,
                  streamParts: parts && parts.length > 0 ? parts : undefined,
                  replyKey: kbDone.message.id,
                },
              ];
            },
          });
        },
        { signal: ac.signal, session_id: qaTraceSessionRef.current ?? undefined }
      );
      if (startedKb === kbIdRef.current) {
        void listKbAgentConversations(kbId).then((list) => setKbQaConversations(list));
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (startedKb !== kbIdRef.current) return;
      const persisted = streamPersistedUserId;
      const stripIds = (p: ChatMessage) =>
        p.id !== asstStreamId &&
        p.id !== tempUserId &&
        (persisted == null || p.id !== persisted);
      const msg = `${t('detail.qaErrorPrefix')} ${err instanceof Error ? err.message : t('detail.toastAnswerFailed')}`;
      setQaInput(userText);
      setChatMessages((prev) => prev.filter(stripIds));
      toast.error(msg);
    } finally {
      setQaLoading(false);
      if (qaStreamAbortRef.current === ac) qaStreamAbortRef.current = null;
    }
  };

  // --- Settings ---
  const handleSaveSettings = async () => {
    if (!kbId) return;
    setSettingsSaving(true);
    try {
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
        metadata_keys: metadataKeys.length > 0 ? metadataKeys : null,
      });
      toast.success(t('detail.toastSettingsSaved'));
      loadKb();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastSettingsFailed'));
    } finally {
      setSettingsSaving(false);
    }
  };

  return {
    kbId,
    navigate,
    searchParams,
    channels,
    t,
    kb,
    initialTab,
    activeTab,
    setActiveTab,
    qaFullPage,
    setQaFullPage,
    loading,
    docs,
    docTotal,
    docPage,
    setDocPage,
    docPageSize,
    setDocPageSize,
    linkedDocIds,
    setLinkedDocIds,
    genDocs,
    setGenDocs,
    showDocPicker,
    setShowDocPicker,
    pickerSearch,
    setPickerSearch,
    pickerResults,
    setPickerResults,
    pickerLoading,
    pickerSelected,
    setPickerSelected,
    pickerSelectedChannel,
    setPickerSelectedChannel,
    pickerChannelExpanded,
    setPickerChannelExpanded,
    pickerSearchDebounced,
    setPickerSearchDebounced,
    pickerPage,
    setPickerPage,
    pickerPageSize,
    pickerTotal,
    setPickerTotal,
    pickerAdding,
    setPickerAdding,
    pickerDebounceRef,
    kbWikiSpaces,
    setKbWikiSpaces,
    showWikiSpacePicker,
    setShowWikiSpacePicker,
    wikiSpacePickerItems,
    setWikiSpacePickerItems,
    wikiSpacePickerLoading,
    setWikiSpacePickerLoading,
    wikiSpaceBusyId,
    setWikiSpaceBusyId,
    faqs,
    faqTotal,
    faqPage,
    setFaqPage,
    faqPageSize,
    setFaqPageSize,
    showFaqDialog,
    setShowFaqDialog,
    faqDialogSource,
    setFaqDialogSource,
    faqPolishing,
    setFaqPolishing,
    editFaq,
    setEditFaq,
    faqQuestion,
    setFaqQuestion,
    faqAnswer,
    setFaqAnswer,
    setFaqLabelsValues,
    faqDocMetadataValues,
    setFaqDocMetadataValues,
    setFaqLabelAllowMultiple,
    faqMetadataIsArray,
    setFaqMetadataIsArray,
    showGenerateModal,
    setShowGenerateModal,
    genSelectedDocs,
    setGenSelectedDocs,
    genModelId,
    setGenModelId,
    genPrompt,
    setGenPrompt,
    generating,
    setGenerating,
    genProgress,
    setGenProgress,
    genStep,
    setGenStep,
    genPreviewFaqs,
    setGenPreviewFaqs,
    genSaving,
    setGenSaving,
    chunks,
    chunkTotal,
    chunkPage,
    setChunkPage,
    chunkPageSize,
    setChunkPageSize,
    editChunk,
    setEditChunk,
    showChunkDialog,
    setShowChunkDialog,
    chunkContent,
    setChunkContent,
    setChunkLabelsValues,
    chunkDocMetadataValues,
    setChunkDocMetadataValues,
    setChunkLabelAllowMultiple,
    chunkMetadataIsArray,
    setChunkMetadataIsArray,
    chunkSaving,
    setChunkSaving,
    chunkDialogReadOnly,
    setChunkDialogReadOnly,
    searchQuery,
    setSearchQuery,
    searchType,
    setSearchType,
    searchResults,
    setSearchResults,
    searching,
    setSearching,
    hasSearched,
    setHasSearched,
    searchOptionsExpanded,
    setSearchOptionsExpanded,
    searchLabelFilters,
    searchMetadataFilters,
    setSearchMetadataFilters,
    searchTopK,
    setSearchTopK,
    searchForceDense,
    setSearchForceDense,
    searchPrevSnapshotRef,
    searchRetrievalDiff,
    setSearchRetrievalDiff,
    qaInput,
    setQaInput,
    chatMessages,
    setChatMessages,
    qaFeedback,
    setQaFeedback,
    qaLoading,
    setQaLoading,
    qaStreamAbortRef,
    qaTraceSessionRef,
    qaSourcesExpanded,
    setQaSourcesExpanded,
    kbQaConvId,
    setKbQaConvId,
    kbQaConversations,
    setKbQaConversations,
    kbQaConvsLoading,
    setKbQaConvsLoading,
    kbQaConvReady,
    setKbQaConvReady,
    kbIdRef,
    kbQaMainScrollRef,
    settingsAgentUrl,
    setSettingsAgentUrl,
    settingsEmbeddingModelId,
    setSettingsEmbeddingModelId,
    settingsFaqPrompt,
    setSettingsFaqPrompt,
    settingsChunkStrategy,
    setSettingsChunkStrategy,
    settingsChunkSize,
    setSettingsChunkSize,
    settingsChunkOverlap,
    setSettingsChunkOverlap,
    settingsMetadataKeys,
    setSettingsMetadataKeys,
    embeddingModels,
    llmModels,
    settingsSaving,
    setSettingsSaving,
    settingsSubTab,
    setSettingsSubTab,
    indexJobSubmitting,
    setIndexJobSubmitting,
    settingsSubTabs,
    loadKb,
    loadModels,
    refreshLinkedDocIds,
    loadDocs,
    loadKbWikiSpaces,
    loadFaqs,
    loadChunks,
    enqueueIndexJob,
    loadKbQaMessagesForConversation,
    onSelectKbQaConversation,
    onNewKbQaChat,
    onRenameKbQaChat,
    onDeleteKbQaChat,
    alreadyAddedIds,
    openDocPicker,
    closeDocPicker,
    loadPickerDocuments,
    handlePickerSearch,
    handlePickerChannelSelect,
    handlePickerChannelToggle,
    handleAddSelectedDocuments,
    handleRemoveDocument,
    togglePickerDoc,
    pickerTotalPages,
    openWikiSpacePicker,
    closeWikiSpacePicker,
    handleAddWikiSpaceToKb,
    handleRemoveWikiSpaceFromKb,
    handleIndexWikiSpace,
    closeFaqDialog,
    openFaqFromQa,
    handlePolishFaqAnswer,
    handleSaveFaq,
    handleDeleteFaq,
    openGenerateModal,
    closeGenerateModal,
    handleGenerateFaqs,
    handleSaveGeneratedFaqs,
    handleGenBackToConfig,
    openChunkEdit,
    openChunkViewFromId,
    openChunkEditFromId,
    closeChunkDialog,
    handleSaveChunk,
    handleSearch,
    handleAsk,
    setKbQaFeedbackVote,
    kbQaAssistantText,
    handleSaveSettings,
    configValuesToMetadata,
    objToConfigValues,
    pickerCanPrev,
    pickerCanNext,
    toggleGenDoc,
    removeGenPreviewFaq,
  };
}
