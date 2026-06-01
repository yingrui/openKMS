import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Search as SearchIcon,
  Send,
  FileStack,
  Folder,
  FolderOpen,
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
  Filter,
  ChevronDown,
  Terminal,
  ArrowUp,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchKnowledgeBase,
  fetchKBDocuments,
  fetchKBWikiSpaces,
  fetchFAQs,
  fetchChunks,
  fetchChunkById,
  addKBDocument,
  removeKBDocument,
  addKBWikiSpace,
  removeKBWikiSpace,
  createFAQ,
  updateFAQ,
  deleteFAQ,
  generateFAQs,
  saveFAQs,
  searchKnowledgeBase,
  updateKnowledgeBase,
  updateChunk,
  enqueueKnowledgeBaseIndexJob,
  listKbAgentConversations,
  listAllKbAgentMessages,
  createKbAgentConversation,
  deleteKbAgentConversation,
  postKbAgentMessageStream,
  getStoredKbQaConversationId,
  setStoredKbQaConversationId,
  clearStoredKbQaConversationId,
  KB_QA_SOURCES_V1,
  type KnowledgeBaseResponse,
  type KBDocumentResponse,
  type KBWikiSpaceResponse,
  type FAQResponse,
  type FAQGenerateResult,
  type ChunkResponse,
  type SearchResult,
} from '../../data/knowledgeBasesApi';
import type { AgentConversationResponse, AgentMessageItem } from '../../data/agentApi';
import { fetchDocumentById, fetchDocuments, type DocumentListItemResponse } from '../../data/documentsApi';
import { fetchWikiSpaces, type WikiSpaceResponse } from '../../data/wikiSpacesApi';
import { fetchChannelById, type ChannelNode } from '../../data/channelsApi';
import { useDocumentChannels } from '../../contexts/DocumentChannelsContext';
import { normalizeExtractionSchemaToFields } from '../../data/channelUtils';
import { fetchAllModels, type ApiModelResponse } from '../../data/modelsApi';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
import { WikiAgentMessageBody } from '../../components/wiki/WikiAgentMessageBody';
import {
  appendDeltaToStreamParts,
  updateToolInParts,
  assistantHistoryStreamParts,
  type AssistantStreamPart,
} from '../../components/wiki/wikiCopilotStreamParts';
import '../../components/wiki/WikiSpaceAgentPanel.scss';
import './KnowledgeBaseDetail.scss';

type TabId = 'documents' | 'wiki_spaces' | 'faqs' | 'chunks' | 'search' | 'settings';

const TAB_ORDER: TabId[] = ['documents', 'wiki_spaces', 'faqs', 'chunks', 'search', 'settings'];

const TAB_ICONS: Record<TabId, typeof FileStack> = {
  documents: FileStack,
  wiki_spaces: BookOpen,
  faqs: HelpCircle,
  chunks: Layers,
  search: SearchIcon,
  settings: Settings,
};

interface KbSearchSnapshot {
  query: string;
  searchType: string;
  topK: number;
  forceDense: boolean;
  orderedIds: string[];
  scores: Record<string, number>;
}

interface KbSearchRetrievalDiff {
  added: string[];
  removed: string[];
  moved: { id: string; from: number; to: number }[];
}

function kbSnapshotFromResults(
  query: string,
  searchType: string,
  topK: number,
  forceDense: boolean,
  results: SearchResult[]
): KbSearchSnapshot {
  const orderedIds = results.map((r) => r.id);
  const scores: Record<string, number> = {};
  for (const r of results) scores[r.id] = r.score;
  return { query, searchType, topK, forceDense, orderedIds, scores };
}

function kbComputeSearchDiff(prev: KbSearchSnapshot, cur: KbSearchSnapshot): KbSearchRetrievalDiff {
  const prevSet = new Set(prev.orderedIds);
  const curSet = new Set(cur.orderedIds);
  const added = cur.orderedIds.filter((id) => !prevSet.has(id));
  const removed = prev.orderedIds.filter((id) => !curSet.has(id));
  const moved: { id: string; from: number; to: number }[] = [];
  cur.orderedIds.forEach((id, to) => {
    const from = prev.orderedIds.indexOf(id);
    if (from >= 0 && from !== to) moved.push({ id, from, to });
  });
  return { added, removed, moved };
}

function kbHasRetrievalProvenance(s: SearchResult): boolean {
  if (s.chunk_index != null && s.chunk_index !== undefined) return true;
  if (s.retrieval_mode) return true;
  const d = s.retrieval_debug;
  if (d && typeof d === 'object' && Object.keys(d).length > 0) return true;
  return false;
}

interface KbRetrievalProvenanceProps {
  s: SearchResult;
  t: (key: string, options?: Record<string, unknown>) => string;
}

function KbRetrievalProvenancePanel({ s, t }: KbRetrievalProvenanceProps) {
  if (!kbHasRetrievalProvenance(s)) return null;
  const dbg = s.retrieval_debug;
  const num = (v: unknown): string | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return v;
    return null;
  };
  const stages = dbg?.pipeline_stages;
  const stageLine =
    Array.isArray(stages) && stages.length
      ? (stages as unknown[])
          .map((x) => (typeof x === 'string' ? t(`detail.retrieval.stage.${x}`, { defaultValue: String(x) }) : ''))
          .filter(Boolean)
          .join(' → ')
      : null;
  const modeLabel = s.retrieval_mode
    ? t(`detail.retrieval.mode.${s.retrieval_mode}`, { defaultValue: s.retrieval_mode })
    : null;
  const rows: { label: string; value: string }[] = [];
  if (s.chunk_index != null && s.chunk_index !== undefined) {
    rows.push({ label: t('detail.retrieval.chunkIndex'), value: String(s.chunk_index) });
  }
  if (modeLabel) rows.push({ label: t('detail.retrieval.modeLabel'), value: modeLabel });
  if (stageLine) rows.push({ label: t('detail.retrieval.pipelineLabel'), value: stageLine });
  const dr = dbg?.dense_rank;
  if (dr != null && num(dr) != null) rows.push({ label: t('detail.retrieval.denseRank'), value: num(dr)! });
  const ds = dbg?.dense_similarity;
  if (ds != null && num(ds) != null) rows.push({ label: t('detail.retrieval.denseSimilarity'), value: num(ds)! });
  const br = dbg?.bm25_rank;
  if (br != null && num(br) != null) rows.push({ label: t('detail.retrieval.bm25Rank'), value: num(br)! });
  const bs = dbg?.bm25_score;
  if (bs != null && num(bs) != null) rows.push({ label: t('detail.retrieval.bm25Score'), value: num(bs)! });
  const rf = dbg?.rrf_score;
  if (rf != null && num(rf) != null) rows.push({ label: t('detail.retrieval.rrfScore'), value: num(rf)! });
  const rr = dbg?.rerank_score;
  if (rr != null && num(rr) != null) rows.push({ label: t('detail.retrieval.rerankScore'), value: num(rr)! });
  if (!rows.length && !stageLine && !modeLabel) return null;
  return (
    <div className="kb-retrieval-panel">
      <div className="kb-retrieval-panel__title">{t('detail.retrieval.panelTitle')}</div>
      <dl className="kb-retrieval-panel__dl">
        {rows.map((row) => (
          <div key={row.label} className="kb-retrieval-panel__row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchResult[];
  streamParts?: AssistantStreamPart[];
  /** Stable id for this assistant turn (which reference rows are expanded). */
  replyKey?: string;
}

function kbAgentItemsToChatMessages(items: AgentMessageItem[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of items) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    if (m.role === 'user') {
      out.push({ id: m.id, role: 'user', content: m.content });
      continue;
    }
    const tc = m.tool_calls as Record<string, unknown> | undefined;
    const rawSources = tc?.[KB_QA_SOURCES_V1];
    const sources = Array.isArray(rawSources) ? (rawSources as SearchResult[]) : undefined;
    out.push({
      id: m.id,
      role: 'assistant',
      content: m.content,
      sources,
      streamParts: assistantHistoryStreamParts(m.content, m.tool_calls),
      replyKey: m.id,
    });
  }
  return out;
}

function kbQaLineId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `line_${Date.now()}`;
}

function groupKbConversationsByMonth(
  items: AgentConversationResponse[]
): { key: string; items: AgentConversationResponse[] }[] {
  const map = new Map<string, AgentConversationResponse[]>();
  for (const c of items) {
    const d = new Date(c.updated_at || c.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  const keys = [...map.keys()].sort((a, b) => b.localeCompare(a));
  return keys.map((key) => ({
    key,
    items: (map.get(key) || []).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    ),
  }));
}

function formatKbQaMonthGroupLabel(key: string, locale: string): string {
  const [ys, ms] = key.split('-');
  const y = Number(ys);
  const m = Number(ms);
  if (!y || !m || m < 1 || m > 12) return key;
  try {
    const loc = locale.startsWith('zh') ? 'zh-CN' : 'en-US';
    return new Date(y, m - 1, 1).toLocaleDateString(loc, { year: 'numeric', month: 'long' });
  } catch {
    return key;
  }
}

function kbQaNormalizeSourceKind(sourceType: string | null | undefined): string {
  const k = (sourceType || 'chunk').toLowerCase();
  if (k === 'ontology' || k === 'document_section' || k === 'faq' || k === 'chunk') return k;
  return 'chunk';
}

function kbQaSourceCardModifierClass(sourceType: string | null | undefined): string {
  const k = kbQaNormalizeSourceKind(sourceType);
  if (k === 'ontology') return 'kb-qa-source-card--ontology';
  if (k === 'document_section') return 'kb-qa-source-card--section';
  if (k === 'faq') return 'kb-qa-source-card--faq';
  return 'kb-qa-source-card--chunk';
}

function kbQaTruncatePreview(text: string, maxLen: number): string {
  const n = text.replace(/\s+/g, ' ').trim();
  if (!n) return '';
  if (n.length <= maxLen) return n;
  return `${n.slice(0, Math.max(0, maxLen - 1))}…`;
}

function kbQaShowRetrievalScore(sourceType: string | null | undefined, score: number): boolean {
  const k = kbQaNormalizeSourceKind(sourceType);
  if (k === 'ontology' || k === 'document_section') return false;
  return score < 0.999;
}

function kbQaSourceChipModifierClass(sourceType: string | null | undefined): string {
  const k = kbQaNormalizeSourceKind(sourceType);
  if (k === 'ontology') return 'kb-qa-source-chip--ontology';
  if (k === 'document_section') return 'kb-qa-source-chip--section';
  if (k === 'faq') return 'kb-qa-source-chip--faq';
  return 'kb-qa-source-chip--chunk';
}

function kbQaChipTitle(s: SearchResult, maxLen = 26): string {
  const raw =
    (s.source_name && s.source_name.trim()) ||
    (s.wiki_page_id ? String(s.wiki_page_id) : '') ||
    (s.document_id ? String(s.document_id) : '') ||
    (s.id ? String(s.id) : '');
  const x = raw.replace(/\s+/g, ' ').trim();
  if (!x) return '…';
  if (x.length <= maxLen) return x;
  return `${x.slice(0, Math.max(0, maxLen - 1))}…`;
}

function kbQaExpandedDetailPreviewMaxLen(sourceType: string | null | undefined): number {
  const k = kbQaNormalizeSourceKind(sourceType);
  if (k === 'ontology') return 12_000;
  if (k === 'document_section') return 4_000;
  return 1_200;
}

function DocPickerChannelTree({
  node,
  selectedId,
  expanded,
  onSelect,
  onToggle,
  depth,
}: {
  node: ChannelNode;
  selectedId: string | null;
  expanded: Record<string, boolean>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  depth: number;
}) {
  const { t } = useTranslation('knowledgeBase');
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expanded[node.id];
  return (
    <li className="kb-doc-picker-channel-li">
      <div
        className={`kb-doc-picker-channel-item${selectedId === node.id ? ' selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="kb-doc-picker-channel-toggle"
            onClick={() => onToggle(node.id)}
            aria-label={isExpanded ? t('detail.collapseTree') : t('detail.expandTree')}
          >
            <ChevronRight size={14} className={isExpanded ? 'expanded' : ''} />
          </button>
        ) : (
          <span className="kb-doc-picker-channel-spacer" />
        )}
        <button
          type="button"
          className="kb-doc-picker-channel-label"
          onClick={() => onSelect(node.id)}
        >
          {hasChildren && isExpanded ? (
            <FolderOpen size={16} />
          ) : (
            <Folder size={16} />
          )}
          <span>{node.name}</span>
        </button>
      </div>
      {hasChildren && isExpanded && (
        <ul className="kb-doc-picker-channel-tree kb-doc-picker-channel-tree--root">
          {node.children!.map((ch) => (
            <DocPickerChannelTree
              key={ch.id}
              node={ch}
              selectedId={selectedId}
              expanded={expanded}
              onSelect={onSelect}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function KnowledgeBaseDetail() {
  const { id: kbId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { channels } = useDocumentChannels();
  const { t, i18n } = useTranslation('knowledgeBase');
  const [kb, setKb] = useState<KnowledgeBaseResponse | null>(null);
  const initialTab = (searchParams.get('tab') as TabId) || 'documents';
  const [activeTab, setActiveTab] = useState<TabId>(TAB_ORDER.includes(initialTab) ? initialTab : 'documents');
  const [qaFullPage, setQaFullPage] = useState(false);
  const [loading, setLoading] = useState(true);

  // Documents
  const [docs, setDocs] = useState<KBDocumentResponse[]>([]);
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
  const [settingsChunkSize, setSettingsChunkSize] = useState(512);
  const [settingsChunkOverlap, setSettingsChunkOverlap] = useState(50);
  const [settingsMetadataKeys, setSettingsMetadataKeys] = useState('');
  const [embeddingModels, setEmbeddingModels] = useState<ApiModelResponse[]>([]);
  const [llmModels, setLlmModels] = useState<ApiModelResponse[]>([]);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [indexJobSubmitting, setIndexJobSubmitting] = useState(false);

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
      setSettingsMetadataKeys(Array.isArray(data.metadata_keys) ? data.metadata_keys.join(', ') : '');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastLoadKbFailed'));
    } finally {
      setLoading(false);
    }
  }, [kbId, t]);

  const loadDocs = useCallback(async () => {
    if (!kbId) return;
    try { setDocs(await fetchKBDocuments(kbId)); } catch { /* noop */ }
  }, [kbId]);

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
      navigate(`/jobs/${job.id}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.indexJobToastFailed'));
    } finally {
      setIndexJobSubmitting(false);
    }
  }, [kbId, kb?.embedding_model_id, navigate, t]);

  const loadModels = useCallback(async () => {
    try {
      const emb = await fetchAllModels({ category: 'embedding' });
      setEmbeddingModels(emb);
      const llm = await fetchAllModels({ category: 'llm' });
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
    },
    [kbId]
  );

  const kbQaConvLabel = useCallback(
    (c: AgentConversationResponse) => {
      const t0 = (c.title || '').trim();
      if (t0) return t0.length > 60 ? `${t0.slice(0, 59)}…` : t0;
      return t('detail.qaChatUntitled', { snippet: `${c.id.slice(0, 8)}…` });
    },
    [t]
  );

  const kbQaConvMonthGroups = useMemo(
    () => groupKbConversationsByMonth(kbQaConversations),
    [kbQaConversations]
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
  const alreadyAddedIds = new Set(docs.map((d) => d.document_id));

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
      toast.success(t('detail.toastDocRemoved'));
      loadDocs();
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
      const res = await fetchWikiSpaces();
      setWikiSpacePickerItems(res.items);
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

  // --- FAQ handlers ---
  const configValuesToMetadata = (
    values: Record<string, string>,
    keys: string[] | null | undefined,
    isArray: Record<string, boolean>
  ): Record<string, unknown> | null => {
    if (!keys?.length) return null;
    const result: Record<string, unknown> = {};
    for (const k of keys) {
      const v = (values[k] ?? '').trim();
      if (v) {
        result[k] = isArray[k]
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
      toast.error(t('detail.toastSelectDoc'));
      return;
    }
    const docIdToName = new Map(docs.map((d) => [d.document_id, d.document_name || d.document_id]));
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
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.qaToastNewChatFailed'));
    }
  };

  const onDeleteKbQaChat = async () => {
    if (!kbId || !kbQaConvId) return;
    if (!window.confirm(t('detail.qaConfirmDeleteChat'))) return;
    try {
      await deleteKbAgentConversation(kbId, kbQaConvId);
      const items = await listKbAgentConversations(kbId);
      setKbQaConversations(items);
      const next = items[0]?.id || null;
      setKbQaConvId(next);
      if (next) {
        setStoredKbQaConversationId(kbId, next);
        await loadKbQaMessagesForConversation(next);
      } else {
        clearStoredKbQaConversationId(kbId);
        setChatMessages([]);
      }
      toast.success(t('detail.qaToastChatDeleted'));
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
            setChatMessages((prev) =>
              prev.map((p) => (p.id === tempUserId ? { ...p, id: ev.message.id } : p))
            );
            return;
          }
          if (ev.type === 'tool_start') {
            setChatMessages((prev) =>
              prev.map((p) => {
                if (p.id !== asstStreamId || p.role !== 'assistant') return p;
                return {
                  ...p,
                  streamParts: [
                    ...(p.streamParts || []),
                    {
                      type: 'tool' as const,
                      step: {
                        runId: ev.run_id,
                        name: ev.name,
                        input: ev.input,
                        status: 'running' as const,
                      },
                    },
                  ],
                };
              })
            );
            return;
          }
          if (ev.type === 'tool_end') {
            setChatMessages((prev) =>
              prev.map((p) => {
                if (p.id !== asstStreamId || p.role !== 'assistant') return p;
                const { next, updated } = updateToolInParts(p.streamParts, ev.run_id, (s) => ({
                  ...s,
                  name: ev.name,
                  output: ev.output,
                  status: 'ok' as const,
                }));
                const sp = updated
                  ? next
                  : [
                      ...next,
                      {
                        type: 'tool' as const,
                        step: {
                          runId: ev.run_id,
                          name: ev.name,
                          output: ev.output,
                          status: 'ok' as const,
                        },
                      },
                    ];
                return { ...p, streamParts: sp };
              })
            );
            return;
          }
          if (ev.type === 'tool_error') {
            setChatMessages((prev) =>
              prev.map((p) => {
                if (p.id !== asstStreamId || p.role !== 'assistant') return p;
                const { next, updated } = updateToolInParts(p.streamParts, ev.run_id, (s) => ({
                  ...s,
                  name: ev.name,
                  error: ev.error,
                  status: 'err' as const,
                }));
                const sp = updated
                  ? next
                  : [
                      ...next,
                      {
                        type: 'tool' as const,
                        step: {
                          runId: ev.run_id,
                          name: ev.name,
                          error: ev.error,
                          status: 'err' as const,
                        },
                      },
                    ];
                return { ...p, streamParts: sp };
              })
            );
            return;
          }
          if (ev.type === 'delta') {
            if (!ev.t) return;
            setChatMessages((prev) =>
              prev.map((p) => {
                if (p.id !== asstStreamId || p.role !== 'assistant') return p;
                return {
                  ...p,
                  content: p.content + ev.t,
                  streamParts: appendDeltaToStreamParts(p.streamParts, ev.t),
                };
              })
            );
            return;
          }
          if (ev.type === 'done' && 'message' in ev && 'user' in ev) {
            setChatMessages((prev) => {
              const without = prev.filter(
                (p) => p.id !== asstStreamId && p.id !== ev.user.id && p.id !== tempUserId
              );
              const streamed = prev.find((p) => p.id === asstStreamId);
              const parts = streamed?.role === 'assistant' ? streamed.streamParts : undefined;
              return [
                ...without,
                { id: ev.user.id, role: 'user' as const, content: userText },
                {
                  id: ev.message.id,
                  role: 'assistant' as const,
                  content: ev.message.content,
                  sources: ev.sources,
                  streamParts: parts && parts.length > 0 ? parts : undefined,
                  replyKey: ev.message.id,
                },
              ];
            });
            return;
          }
          if (ev.type === 'done') {
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
                    : p
                )
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
          }
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

  if (loading) return <div className="kb-detail"><p>{t('detail.loading')}</p></div>;
  if (!kb) return <div className="kb-detail"><p>{t('detail.notFound')}</p></div>;

  if (qaFullPage && kb.agent_url) {
    return (
      <div className="kb-detail kb-detail--qa-fullpage">
        <div className="kb-qa-shell">
          <div className="kb-qa-shell-body">
            <aside className="kb-qa-sidebar" aria-label={t('detail.qaChatsAria')}>
              <div className="kb-qa-sidebar-head">
                <button
                  type="button"
                  className="kb-qa-sidebar-back"
                  onClick={() => {
                    qaTraceSessionRef.current = null;
                    setQaFullPage(false);
                  }}
                  aria-label={t('detail.qaBackAria')}
                  title={t('detail.qaBackToKb')}
                >
                  <ArrowLeft size={18} strokeWidth={2.25} aria-hidden />
                </button>
                <div className="kb-qa-sidebar-head-text">
                  <span className="kb-qa-sidebar-kb-name">{kb.name}</span>
                  <span className="kb-qa-sidebar-badge">{t('detail.qaTitle')}</span>
                </div>
              </div>
              <button
                type="button"
                className="kb-qa-sidebar-newchat"
                onClick={() => void onNewKbQaChat()}
                disabled={kbQaConvsLoading || qaLoading}
              >
                  <Plus size={16} strokeWidth={2} aria-hidden />
                <span>{t('detail.qaNewChat')}</span>
              </button>
              <div className="kb-qa-sidebar-scroll">
                {kbQaConvsLoading ? (
                  <div className="kb-qa-sidebar-loading" role="status">
                    <Loader2 className="kb-qa-sidebar-loading-ico" size={22} aria-hidden />
                    <span>{t('detail.qaChatsLoading')}</span>
                  </div>
                ) : kbQaConvMonthGroups.length === 0 ? (
                  <p className="kb-qa-sidebar-empty">{t('detail.qaNoChatsYet')}</p>
                ) : (
                  kbQaConvMonthGroups.map((group) => (
                    <section key={group.key} className="kb-qa-sidebar-group">
                      <h2 className="kb-qa-sidebar-month">{formatKbQaMonthGroupLabel(group.key, i18n.language)}</h2>
                      <ul className="kb-qa-sidebar-list">
                        {group.items.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              className={`kb-qa-sidebar-item${kbQaConvId === c.id ? ' kb-qa-sidebar-item--active' : ''}`}
                              onClick={() => void onSelectKbQaConversation(c.id)}
                              title={kbQaConvLabel(c)}
                            >
                              <span className="kb-qa-sidebar-item-text">{kbQaConvLabel(c)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))
                )}
              </div>
              {kbQaConvId ? (
                <button
                  type="button"
                  className="kb-qa-sidebar-footdel"
                  onClick={() => void onDeleteKbQaChat()}
                  disabled={kbQaConvsLoading || qaLoading}
                >
                  <Trash2 size={15} aria-hidden />
                  <span>{t('detail.qaDeleteChatAction')}</span>
                </button>
              ) : null}
            </aside>
            <main className="kb-qa-main">
              <div className="kb-qa-main-scroll" ref={kbQaMainScrollRef}>
                {chatMessages.length === 0 && !qaLoading ? (
                  <div className="kb-qa-hero">
                    <div className="kb-qa-hero-mark" aria-hidden>
                      <Sparkles size={28} strokeWidth={1.75} />
                    </div>
                    <h1 className="kb-qa-hero-title">{t('detail.qaHeroTitle', { name: kb.name })}</h1>
                    <p className="kb-qa-hero-sub">{t('detail.qaHeroSubtitle')}</p>
                  </div>
                ) : null}
                {chatMessages.length > 0 ? (
                  <div className="kb-qa-thread kb-qa-messages kb-qa-messages--fullpage">
                {chatMessages.map((msg, i) => {
                  const isLast = i === chatMessages.length - 1;
                  return (
                    <div key={msg.id ?? `msg-fp-${i}`} className={`kb-qa-msg kb-qa-msg-${msg.role}`}>
                      <span className="kb-qa-msg-label">
                        {msg.role === 'user' ? t('detail.qaLabelYou') : t('detail.qaLabelAssistant')}
                      </span>
                      {msg.role === 'assistant' && msg.streamParts && msg.streamParts.length > 0 ? (
                        <div
                          className="wiki-space-agent-panel__assistant-stream kb-qa-assistant-stream"
                          aria-label={t('detail.qaReplyAria')}
                        >
                          {msg.streamParts.map((part, j) =>
                            part.type === 'text' ? (
                              <WikiAgentMessageBody
                                key={`t-${i}-${j}`}
                                text={part.text}
                                variant="assistant"
                              />
                            ) : (
                              <div
                                key={
                                  part.step.runId
                                    ? `tool-${part.step.runId}-${j}`
                                    : `tool-${i}-${j}`
                                }
                                className="wiki-space-agent-panel__tool-pill"
                              >
                                <div className="wiki-space-agent-panel__tool-pill-line">
                                  <Terminal
                                    size={12}
                                    strokeWidth={2}
                                    className="wiki-space-agent-panel__tool-pill-ico"
                                    aria-hidden
                                  />
                                  <span className="wiki-space-agent-panel__tool-pill-name">
                                    {part.step.name}
                                  </span>
                                  {part.step.status === 'running' ? (
                                    <span className="wiki-space-agent-panel__tool-pill-badge">…</span>
                                  ) : null}
                                  {part.step.status === 'ok' ? (
                                    <span className="wiki-space-agent-panel__tool-pill-badge wiki-space-agent-panel__tool-pill-badge--ok">
                                      {t('detail.qaToolDone')}
                                    </span>
                                  ) : null}
                                  {part.step.status === 'err' ? (
                                    <span className="wiki-space-agent-panel__tool-pill-badge wiki-space-agent-panel__tool-pill-badge--err">
                                      {t('detail.qaToolError')}
                                    </span>
                                  ) : null}
                                </div>
                                {(part.step.input || part.step.output || part.step.error) &&
                                (part.step.status !== 'running' || part.step.input) ? (
                                  <details className="wiki-space-agent-panel__tool-details">
                                    <summary>{t('detail.qaToolIoSummary')}</summary>
                                    {part.step.input ? (
                                      <pre className="wiki-space-agent-panel__tool-pre">{part.step.input}</pre>
                                    ) : null}
                                    {part.step.output ? (
                                      <pre className="wiki-space-agent-panel__tool-pre">{part.step.output}</pre>
                                    ) : null}
                                    {part.step.error ? (
                                      <pre className="wiki-space-agent-panel__tool-pre wiki-space-agent-panel__tool-pre--err">
                                        {part.step.error}
                                      </pre>
                                    ) : null}
                                  </details>
                                ) : null}
                              </div>
                            )
                          )}
                        </div>
                      ) : msg.role === 'assistant' &&
                        !msg.content &&
                        !(msg.streamParts && msg.streamParts.length) &&
                        qaLoading &&
                        isLast ? (
                        <div className="kb-qa-msg-bubble kb-qa-msg-bubble--assistant kb-qa-typing">
                          {t('detail.qaThinking')}
                        </div>
                      ) : (
                        <div
                          className={
                            msg.role === 'user' ? 'kb-qa-msg-bubble kb-qa-msg-bubble--user' : 'kb-qa-msg-bubble kb-qa-msg-bubble--assistant'
                          }
                        >
                          <WikiAgentMessageBody
                            text={msg.content}
                            variant={msg.role === 'user' ? 'user' : 'assistant'}
                          />
                        </div>
                      )}
                      {msg.sources && msg.sources.length > 0 && (() => {
                        const rk = msg.replyKey ?? `legacy-${i}`;
                        const expandedSet = qaSourcesExpanded[rk];
                        const expandedList = expandedSet ? [...expandedSet].sort((a, b) => a - b) : [];
                        return (
                          <div className="kb-qa-sources" role="region" aria-label={t('detail.qaSourcesAria')}>
                            <div className="kb-qa-sources-toolbar">
                              <div className="kb-qa-sources-heading">{t('detail.qaSourcesHeading')}</div>
                              <div className="kb-qa-sources-actions">
                                <button
                                  type="button"
                                  className="kb-qa-sources-action-btn"
                                  onClick={() =>
                                    setQaSourcesExpanded((prev) => ({
                                      ...prev,
                                      [rk]: new Set(msg.sources!.map((_, ix) => ix)),
                                    }))
                                  }
                                >
                                  {t('detail.qaSourcesExpandAll')}
                                </button>
                                <button
                                  type="button"
                                  className="kb-qa-sources-action-btn"
                                  onClick={() => setQaSourcesExpanded((prev) => ({ ...prev, [rk]: new Set() }))}
                                >
                                  {t('detail.qaSourcesCollapseAll')}
                                </button>
                              </div>
                            </div>
                            <div className="kb-qa-sources-chips" role="list">
                              {msg.sources.map((s, j) => {
                                const kind = kbQaNormalizeSourceKind(s.source_type);
                                const chipMod = kbQaSourceChipModifierClass(s.source_type);
                                const kindLabel = t(`detail.qaSourceKind.${kind}`, {
                                  defaultValue: s.source_type || kind,
                                });
                                const showScore = kbQaShowRetrievalScore(s.source_type, s.score);
                                const chipTitle = kbQaChipTitle(s);
                                const isOpen = expandedSet?.has(j) ?? false;
                                return (
                                  <button
                                    key={`${s.id}-${j}`}
                                    type="button"
                                    role="listitem"
                                    className={`kb-qa-source-chip ${chipMod}${isOpen ? ' kb-qa-source-chip--open' : ''}`}
                                    aria-expanded={isOpen}
                                    aria-label={t('detail.qaSourceChipAria', { kind: kindLabel, title: chipTitle })}
                                    onClick={() =>
                                      setQaSourcesExpanded((prev) => {
                                        const next = { ...prev };
                                        const cur = new Set(next[rk] || []);
                                        if (cur.has(j)) cur.delete(j);
                                        else cur.add(j);
                                        next[rk] = cur;
                                        return next;
                                      })
                                    }
                                  >
                                    <span className="kb-qa-source-chip__kind">{kindLabel}</span>
                                    <span className="kb-qa-source-chip__title">{chipTitle}</span>
                                    {showScore ? (
                                      <span className="kb-qa-source-chip__score">
                                        {t('detail.qaSourceScore', { pct: (s.score * 100).toFixed(0) })}
                                      </span>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                            {expandedList.length > 0 ? (
                              <div className="kb-qa-sources-panels">
                                {expandedList.map((j) => {
                                  const s = msg.sources![j];
                                  const kind = kbQaNormalizeSourceKind(s.source_type);
                                  const mod = kbQaSourceCardModifierClass(s.source_type);
                                  const kindLabel = t(`detail.qaSourceKind.${kind}`, {
                                    defaultValue: s.source_type || kind,
                                  });
                                  const detailPreview = kbQaTruncatePreview(
                                    s.content || '',
                                    kbQaExpandedDetailPreviewMaxLen(s.source_type)
                                  );
                                  const showScore = kbQaShowRetrievalScore(s.source_type, s.score);
                                  return (
                                    <div
                                      key={`panel-${rk}-${j}-${s.id}`}
                                      className={`kb-qa-source-card kb-qa-source-card--static ${mod}`}
                                    >
                                      <div className="kb-qa-source-card__head">
                                        <span className="kb-qa-source-card__kind">{kindLabel}</span>
                                        {showScore ? (
                                          <span className="kb-qa-source-card__score">
                                            {t('detail.qaSourceScore', { pct: (s.score * 100).toFixed(0) })}
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="kb-qa-source-card__title">
                                        {s.wiki_page_id && s.wiki_space_id ? (
                                          <Link
                                            className="kb-qa-source-card__link"
                                            to={`/wikis/${s.wiki_space_id}/pages/${s.wiki_page_id}`}
                                          >
                                            {s.source_name || s.wiki_page_id}
                                          </Link>
                                        ) : s.document_id ? (
                                          <Link className="kb-qa-source-card__link" to={`/documents/view/${s.document_id}`}>
                                            {s.source_name || s.document_id}
                                          </Link>
                                        ) : (
                                          <span className="kb-qa-source-card__title-text">
                                            {s.source_name || t('detail.faqSourceFallback')}
                                          </span>
                                        )}
                                      </div>
                                      {detailPreview ? (
                                        <p className="kb-qa-source-card__preview">{detailPreview}</p>
                                      ) : null}
                                      <KbRetrievalProvenancePanel s={s} t={t} />
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
                  </div>
                ) : null}
              </div>
              <div className="kb-qa-composer-outer">
                <form className="kb-qa-composer" onSubmit={handleAsk}>
                  <textarea
                    className="kb-qa-composer-input"
                    placeholder={t('detail.qaPlaceholder')}
                    value={qaInput}
                    onChange={(e) => setQaInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                      }
                    }}
                    disabled={qaLoading || !kbQaConvReady}
                    rows={1}
                    autoComplete="off"
                    aria-label={t('detail.qaPlaceholder')}
                  />
                  <div className="kb-qa-composer-bar">
                    <p className="kb-qa-composer-hint">{t('detail.qaComposerHint')}</p>
                    <button
                      type="submit"
                      className="kb-qa-composer-send"
                      disabled={qaLoading || !qaInput.trim() || !kbQaConvReady}
                      aria-label={t('detail.qaSendAria')}
                    >
                      <ArrowUp size={18} strokeWidth={2.25} aria-hidden />
                    </button>
                  </div>
                </form>
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="kb-detail">
      <Link to="/knowledge-bases" className="kb-detail-back">
        <ArrowLeft size={18} />
        <span>{t('detail.backToList')}</span>
      </Link>

      <header className="kb-detail-header kb-detail-header--split">
        <div className="kb-detail-header-text">
          <h1>{kb.name}</h1>
          <p className="kb-detail-desc">{kb.description || t('detail.noDescription')}</p>
          <div className="kb-detail-stats">
            <span>{t('detail.statDocs', { count: kb.document_count })}</span>
            <span>{t('detail.statWikiSpaces', { count: kb.wiki_space_count ?? 0 })}</span>
            <span>{t('detail.statFaqs', { count: kb.faq_count })}</span>
            <span>{t('detail.statChunks', { count: kb.chunk_count })}</span>
          </div>
        </div>
        <div className="kb-detail-header-actions">
          {kb.embedding_model_id ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm kb-detail-header-index-btn"
              onClick={() => void enqueueIndexJob()}
              disabled={indexJobSubmitting}
              title={t('detail.indexJobHeaderTitle')}
            >
              {indexJobSubmitting ? (
                <Loader2 size={18} className="kb-spinner-inline" aria-hidden />
              ) : (
                <RefreshCw size={18} aria-hidden />
              )}
              <span>{t('detail.indexJobHeader')}</span>
            </button>
          ) : null}
        {kb.agent_url ? (
          <button
            type="button"
            className="btn btn-primary btn-sm kb-detail-header-qa-btn"
            onClick={() => {
              qaTraceSessionRef.current = crypto.randomUUID();
              setQaFullPage(true);
            }}
          >
            <MessageSquare size={18} />
            <span>{t('detail.qaOpenChat')}</span>
          </button>
        ) : null}
        </div>
      </header>

      <div className="kb-detail-tabs">
        {TAB_ORDER.map((tabId) => {
          const Icon = TAB_ICONS[tabId];
          return (
            <button
              key={tabId}
              type="button"
              className={`kb-tab ${activeTab === tabId ? 'active' : ''}`}
              onClick={() => setActiveTab(tabId)}
            >
              <Icon size={18} />
              <span>{t(`detail.tabs.${tabId}`)}</span>
            </button>
          );
        })}
      </div>

      <div className="kb-detail-content">
        {/* ===== DOCUMENTS TAB ===== */}
        {activeTab === 'documents' && (
          <section className="kb-section">
            <div className="kb-section-header">
              <h2>{t('detail.documentsTitle')}</h2>
              <button type="button" className="btn btn-primary btn-sm" onClick={openDocPicker}>
                <Plus size={16} />
                <span>{t('detail.addDocument')}</span>
              </button>
            </div>
            {docs.length === 0 ? (
              <p className="kb-empty-text">{t('detail.emptyDocuments')}</p>
            ) : (
              <div className="kb-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>{t('detail.colName')}</th>
                      <th>{t('detail.colType')}</th>
                      <th>{t('detail.colStatus')}</th>
                      <th className="kb-table-actions">{t('detail.actions')}</th>
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
                            <Link to={`/documents/view/${doc.document_id}`} title={t('detail.view')} aria-label={t('detail.view')}>
                              <Eye size={16} />
                            </Link>
                            <button type="button" title={t('detail.remove')} aria-label={t('detail.remove')} onClick={() => handleRemoveDocument(doc.document_id)}>
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

        {/* ===== WIKI SPACES TAB ===== */}
        {activeTab === 'wiki_spaces' && (
          <section className="kb-section">
            <div className="kb-section-header">
              <h2>{t('detail.wikiSpacesTitle')}</h2>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void openWikiSpacePicker()}>
                <Plus size={16} />
                <span>{t('detail.addWikiSpace')}</span>
              </button>
            </div>
            <p className="kb-section-desc kb-wiki-index-hint">{t('detail.wikiIndexHint')}</p>
            {kbWikiSpaces.length === 0 ? (
              <p className="kb-empty-text">{t('detail.emptyWikiSpaces')}</p>
            ) : (
              <div className="kb-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>{t('detail.colWikiSpace')}</th>
                      <th className="kb-table-actions">{t('detail.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kbWikiSpaces.map((ws) => (
                      <tr key={ws.id}>
                        <td>
                          <div className="kb-table-name">
                            <BookOpen size={18} />
                            <Link to={`/wikis/${ws.wiki_space_id}/pages/graph`}>{ws.wiki_space_name || ws.wiki_space_id}</Link>
                          </div>
                        </td>
                        <td className="kb-table-actions">
                          <div className="kb-table-btns">
                            <Link to={`/wikis/${ws.wiki_space_id}/pages/graph`} title={t('detail.view')} aria-label={t('detail.view')}>
                              <Eye size={16} />
                            </Link>
                            <button
                              type="button"
                              title={t('detail.remove')}
                              aria-label={t('detail.remove')}
                              disabled={wikiSpaceBusyId === ws.wiki_space_id}
                              onClick={() => void handleRemoveWikiSpaceFromKb(ws.wiki_space_id)}
                            >
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
              <h2>{t('detail.faqsTitle', { count: faqTotal })}</h2>
              <div className="kb-section-header-btns">
                <button type="button" className="btn btn-secondary btn-sm" onClick={openGenerateModal}>
                  <Sparkles size={16} />
                  <span>{t('detail.generateFaq')}</span>
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => {
                  setEditFaq(null);
                  setFaqQuestion('');
                  setFaqLabelsValues(objToConfigValues({}, kb?.metadata_keys ?? undefined));
                  setFaqDocMetadataValues(objToConfigValues({}, kb?.metadata_keys ?? undefined));
                  setFaqLabelAllowMultiple({});
                  setFaqMetadataIsArray({});
                  setShowFaqDialog(true);
                }}>
                  <Plus size={16} />
                  <span>{t('detail.addFaq')}</span>
                </button>
              </div>
            </div>

            {faqTotal === 0 ? (
              <p className="kb-empty-text">{t('detail.emptyFaqs')}</p>
            ) : (
              <>
              <div className="kb-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th className="kb-table-question-col">{t('detail.colQuestion')}</th>
                      <th>{t('detail.colAnswer')}</th>
                      <th className="kb-table-source-col">{t('detail.colSource')}</th>
                      <th className="kb-table-actions">{t('detail.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faqs.map((faq) => (
                      <tr key={faq.id}>
                        <td className="kb-table-question-col">
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
                            {faq.document_name || faq.document_id || t('detail.dash')}
                          </span>
                        </td>
                        <td className="kb-table-actions">
                          <div className="kb-table-btns">
                            <button type="button" title={t('detail.edit')} aria-label={t('detail.edit')} onClick={async () => {
                              setEditFaq(faq);
                              setFaqQuestion(faq.question);
                              setFaqAnswer(faq.answer);
                              const metaValues = objToConfigValues(faq.doc_metadata, kb?.metadata_keys ?? undefined);
                              setFaqLabelsValues(metaValues);
                              setFaqDocMetadataValues(metaValues);
                              const metadataIsArray: Record<string, boolean> = {};
                              if (faq.document_id && kb?.metadata_keys?.length) {
                                try {
                                  const doc = await fetchDocumentById(faq.document_id);
                                  const channel = await fetchChannelById(doc.channel_id);
                                  const metaFields = normalizeExtractionSchemaToFields(channel.extraction_schema ?? null);
                                  const metaMap = new Map(metaFields.map((f) => [f.key, f.type === 'array']));
                                  const lcMap = new Map(
                                    (channel.label_config ?? []).map((lc: { key: string; type?: string }) => [lc.key, lc.type === 'list[object_type]'])
                                  );
                                  for (const k of kb.metadata_keys) {
                                    metadataIsArray[k] = metaMap.get(k) ?? lcMap.get(k) ?? false;
                                  }
                                } catch {
                                  /* default to false */
                                }
                              }
                              setFaqLabelAllowMultiple({});
                              setFaqMetadataIsArray(metadataIsArray);
                              setShowFaqDialog(true);
                            }}>
                              <Pencil size={16} />
                            </button>
                            <button type="button" title={t('detail.remove')} aria-label={t('detail.remove')} onClick={() => handleDeleteFaq(faq.id)}>
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
                      {t('detail.paginationRange', {
                        start: faqTotal === 0 ? 0 : faqPage * faqPageSize + 1,
                        end: Math.min((faqPage + 1) * faqPageSize, faqTotal),
                        total: faqTotal,
                      })}
                    </span>
                    <label>
                      <span>{t('detail.pageSize')}</span>
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
                        title={t('detail.firstPage')}
                      >
                        «
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setFaqPage((p) => Math.max(0, p - 1))}
                        disabled={faqPage === 0}
                      >
                        {t('detail.previous')}
                      </button>
                      <span className="kb-pagination-nums">
                        {t('detail.pageOf', {
                          current: faqPage + 1,
                          total: Math.ceil(faqTotal / faqPageSize) || 1,
                        })}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setFaqPage((p) => Math.min(Math.ceil(faqTotal / faqPageSize) - 1, p + 1))}
                        disabled={faqPage >= Math.ceil(faqTotal / faqPageSize) - 1}
                      >
                        {t('detail.next')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setFaqPage(Math.ceil(faqTotal / faqPageSize) - 1)}
                        disabled={faqPage >= Math.ceil(faqTotal / faqPageSize) - 1}
                        title={t('detail.lastPage')}
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
              <h2>{t('detail.chunksTitle', { count: chunkTotal })}</h2>
            </div>
            {chunkTotal === 0 ? (
              <p className="kb-empty-text">{t('detail.emptyChunks')}</p>
            ) : (
              <>
              <div className="kb-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>{t('detail.chunkSource')}</th>
                      <th>{t('detail.colExcerpt')}</th>
                      <th>{t('detail.colTokens')}</th>
                      <th>{t('detail.colEmbedded')}</th>
                      <th className="kb-table-actions">{t('detail.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chunks.map((chunk) => (
                      <tr key={chunk.id}>
                        <td>
                          <div className="kb-table-name">
                            <Layers size={18} />
                            {chunk.document_id ? (
                              <Link to={`/documents/view/${chunk.document_id}`}>{chunk.document_name || chunk.document_id}</Link>
                            ) : chunk.wiki_page_id && chunk.wiki_space_id ? (
                              <Link to={`/wikis/${chunk.wiki_space_id}/pages/${chunk.wiki_page_id}`}>
                                {chunk.document_name || chunk.wiki_page_id}
                              </Link>
                            ) : (
                              <span>{chunk.document_name || chunk.document_id || chunk.wiki_page_id || t('detail.dash')}</span>
                            )}
                          </div>
                        </td>
                        <td className="kb-table-excerpt">{chunk.content.slice(0, 150)}...</td>
                        <td>{chunk.token_count ?? t('detail.dash')}</td>
                        <td>{chunk.has_embedding ? t('detail.yes') : t('detail.no')}</td>
                        <td className="kb-table-actions">
                          <div className="kb-table-btns">
                            <button type="button" title={t('detail.edit')} aria-label={t('detail.edit')} onClick={() => openChunkEdit(chunk)}>
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
                      {t('detail.paginationRange', {
                        start: chunkTotal === 0 ? 0 : chunkPage * chunkPageSize + 1,
                        end: Math.min((chunkPage + 1) * chunkPageSize, chunkTotal),
                        total: chunkTotal,
                      })}
                    </span>
                    <label>
                      <span>{t('detail.pageSize')}</span>
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
                        title={t('detail.firstPage')}
                      >
                        «
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setChunkPage((p) => Math.max(0, p - 1))}
                        disabled={chunkPage === 0}
                      >
                        {t('detail.previous')}
                      </button>
                      <span className="kb-pagination-nums">
                        {t('detail.pageOf', {
                          current: chunkPage + 1,
                          total: Math.ceil(chunkTotal / chunkPageSize) || 1,
                        })}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setChunkPage((p) => Math.min(Math.ceil(chunkTotal / chunkPageSize) - 1, p + 1))}
                        disabled={chunkPage >= Math.ceil(chunkTotal / chunkPageSize) - 1}
                      >
                        {t('detail.next')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setChunkPage(Math.ceil(chunkTotal / chunkPageSize) - 1)}
                        disabled={chunkPage >= Math.ceil(chunkTotal / chunkPageSize) - 1}
                        title={t('detail.lastPage')}
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
            <h2>{t('detail.searchTitle')}</h2>
            <p className="kb-section-desc">
              {t('detail.searchDesc')}
            </p>
            <div className="kb-search-type-tabs">
              {(['all', 'chunks', 'faqs'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`kb-search-type-tab${searchType === type ? ' active' : ''}`}
                  onClick={() => setSearchType(type)}
                  aria-pressed={searchType === type}
                >
                  {type === 'all' ? t('detail.searchTypeAll') : type === 'chunks' ? t('detail.searchTypeChunks') : t('detail.searchTypeFaqs')}
                </button>
              ))}
            </div>
            <form className="kb-search-form" onSubmit={handleSearch}>
              <SearchIcon size={20} />
              <input
                type="search"
                aria-label={t('detail.searchAria')}
                placeholder={t('detail.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="kb-search-input"
              />
              <button type="submit" className="kb-search-submit" disabled={searching}>
                <Send size={18} />
                <span>{searching ? t('detail.searching') : t('detail.search')}</span>
              </button>
            </form>

            <div className="kb-search-options-wrap">
              <button
                type="button"
                className="kb-search-options-toggle"
                onClick={() => setSearchOptionsExpanded((o) => !o)}
                aria-expanded={searchOptionsExpanded}
              >
                {searchOptionsExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                <Filter size={16} aria-hidden />
                <span>{t('detail.searchOptionsToggle')}</span>
                {(Object.values(searchLabelFilters).some(Boolean) ||
                  Object.values(searchMetadataFilters).some(Boolean) ||
                  searchForceDense ||
                  searchTopK !== 10) && (
                  <span className="kb-search-options-badge">{t('detail.filtersActive')}</span>
                )}
              </button>
              {searchOptionsExpanded ? (
                <div className="kb-search-options-panel">
                  <div className="kb-search-options-block">
                    <div className="kb-search-options-block-title">{t('detail.searchOptionsRankingTitle')}</div>
                    <div className="kb-search-options-row">
                      <label className="kb-search-advanced-field">
                        <span>{t('detail.searchTopKLabel')}</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={searchTopK}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setSearchTopK(Number.isFinite(n) ? Math.min(50, Math.max(1, Math.trunc(n))) : 10);
                          }}
                        />
                      </label>
                      <label className="kb-search-advanced-checkbox">
                        <input
                          type="checkbox"
                          checked={searchForceDense}
                          onChange={(e) => setSearchForceDense(e.target.checked)}
                        />
                        <span>{t('detail.searchForceDense')}</span>
                      </label>
                    </div>
                    <p className="kb-search-advanced-hint">{t('detail.searchAdvancedHint')}</p>
                  </div>

                  {kb?.metadata_keys?.length ? (
                    <>
                      <hr className="kb-search-options-sep" />
                      <div className="kb-search-options-block">
                        <div className="kb-search-options-block-title">{t('detail.metadataLabel')}</div>
                        <p className="kb-search-filters-hint">{t('detail.filtersHint')}</p>
                        <div className="kb-search-filters-group">
                          {kb.metadata_keys.map((key) => (
                            <div key={key} className="kb-search-filter-row">
                              <label htmlFor={`search-meta-${key}`}>{key}</label>
                              <input
                                id={`search-meta-${key}`}
                                type="text"
                                placeholder={t('detail.placeholderMetaExample')}
                                value={searchMetadataFilters[key] ?? ''}
                                onChange={(e) => setSearchMetadataFilters((prev) => ({ ...prev, [key]: e.target.value }))}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <hr className="kb-search-options-sep" />
                      <p className="kb-search-options-empty-hint">{t('detail.metadataKeysEmptyHint')}</p>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            {hasSearched && searchResults.length > 0 && (
              <div className="kb-search-results-panel">
                <h3>{t('detail.resultsTitle', { count: searchResults.length })}</h3>
                {searchRetrievalDiff &&
                (searchRetrievalDiff.added.length > 0 ||
                  searchRetrievalDiff.removed.length > 0 ||
                  searchRetrievalDiff.moved.length > 0) ? (
                  <div className="kb-search-diff-panel" role="region" aria-label={t('detail.searchDiffAria')}>
                    <h4 className="kb-search-diff-title">{t('detail.searchDiffTitle')}</h4>
                    {searchRetrievalDiff.added.length > 0 ? (
                      <p className="kb-search-diff-line">
                        <strong>{t('detail.searchDiffAdded')}</strong> {searchRetrievalDiff.added.length}
                      </p>
                    ) : null}
                    {searchRetrievalDiff.removed.length > 0 ? (
                      <p className="kb-search-diff-line">
                        <strong>{t('detail.searchDiffRemoved')}</strong> {searchRetrievalDiff.removed.length}
                      </p>
                    ) : null}
                    {searchRetrievalDiff.moved.length > 0 ? (
                      <ul className="kb-search-diff-moves">
                        {searchRetrievalDiff.moved.slice(0, 20).map((m) => (
                          <li key={m.id}>
                            {t('detail.searchDiffMoved', {
                              id: m.id.length > 24 ? `${m.id.slice(0, 20)}…` : m.id,
                              from: m.from + 1,
                              to: m.to + 1,
                            })}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                <ul className="kb-search-results-list">
                  {searchResults.map((r) => (
                    <li key={r.id} className="kb-search-result-item">
                      <span className="kb-search-result-source">
                        [{r.source_type}]
                        {r.source_type === 'chunk' && r.wiki_page_id && r.wiki_space_id && (
                          <span className="kb-search-result-kind"> {t('detail.searchHitWiki')} </span>
                        )}{' '}
                        {r.wiki_page_id && r.wiki_space_id ? (
                          <Link to={`/wikis/${r.wiki_space_id}/pages/${r.wiki_page_id}`}>
                            {r.source_name || r.wiki_page_id}
                          </Link>
                        ) : r.document_id ? (
                          <Link to={`/documents/view/${r.document_id}`}>{r.source_name || r.document_id}</Link>
                        ) : (
                          <span>{r.source_name || r.document_id || t('detail.faqSourceFallback')}</span>
                        )}
                      </span>
                      <p className="kb-search-result-excerpt">{r.content.slice(0, 300)}</p>
                      <span className="kb-search-result-score">{t('detail.matchPercent', { pct: (r.score * 100).toFixed(0) })}</span>
                      <KbRetrievalProvenancePanel s={r} t={t} />
                      {r.source_type === 'chunk' ? (
                        <div className="kb-search-result-chunk-actions">
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openChunkViewFromId(r.id)}>
                            {t('detail.chunkView')}
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openChunkEditFromId(r.id)}>
                            {t('detail.chunkEdit')}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasSearched && searchResults.length === 0 && (
              <p className="kb-empty-text">{t('detail.noSearchResults')}</p>
            )}

            {!hasSearched && (
              <div className="kb-search-empty">
                <SearchIcon size={48} strokeWidth={1} />
                <p>{t('detail.searchEmptyPrompt')}</p>
              </div>
            )}
          </section>
        )}

        {/* ===== SETTINGS TAB ===== */}
        {activeTab === 'settings' && (
          <section className="kb-section kb-settings-section">
            <div className="kb-settings-header-row">
              <h2 id="kb-settings-heading">{t('detail.settingsTitle')}</h2>
              <button
                type="button"
                className="btn btn-primary kb-settings-header-save"
                disabled={settingsSaving}
                onClick={handleSaveSettings}
              >
                {settingsSaving ? t('detail.savingSettings') : t('detail.saveSettings')}
              </button>
            </div>

            {kbId && (
              <ResourceSharePanel
                resourceType={RESOURCE_TYPES.knowledgeBase}
                resourceId={kbId}
                title={t('detail.sharingTitle')}
              />
            )}

            <div className="kb-settings-form">
              <div className="kb-settings-layout">
                <div className="kb-settings-col kb-settings-col-models">
                  <label>
                    <span>{t('detail.qaAgentUrl')}</span>
                    <input
                      type="url"
                      placeholder={t('detail.qaAgentUrlPlaceholder')}
                      value={settingsAgentUrl}
                      onChange={(e) => setSettingsAgentUrl(e.target.value)}
                    />
                    <small>{t('detail.qaAgentUrlHelp')}</small>
                  </label>

                  <label>
                    <span>{t('detail.embeddingModel')}</span>
                    <select value={settingsEmbeddingModelId} onChange={(e) => setSettingsEmbeddingModelId(e.target.value)}>
                      <option value="">{t('detail.modelNone')}</option>
                      {embeddingModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} ({m.model_name})</option>
                      ))}
                    </select>
                    <small>{t('detail.embeddingHelp')}</small>
                  </label>

                  <fieldset className="kb-settings-fieldset">
                    <legend>{t('detail.chunkingFieldset')}</legend>
                    <label>
                      <span>{t('detail.strategy')}</span>
                      <select value={settingsChunkStrategy} onChange={(e) => setSettingsChunkStrategy(e.target.value)}>
                        <option value="fixed_size">{t('detail.strategyFixedSize')}</option>
                        <option value="markdown_header">{t('detail.strategyMarkdownHeader')}</option>
                        <option value="paragraph">{t('detail.strategyParagraph')}</option>
                      </select>
                    </label>
                    {settingsChunkStrategy === 'fixed_size' && (
                      <>
                        <label>
                          <span>{t('detail.chunkSize')}</span>
                          <input
                            type="number"
                            min={100}
                            max={10000}
                            value={settingsChunkSize}
                            onChange={(e) => setSettingsChunkSize(Number(e.target.value))}
                          />
                        </label>
                        <label>
                          <span>{t('detail.chunkOverlap')}</span>
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
                </div>

                <div className="kb-settings-col kb-settings-col-text">
                  <label>
                    <span>{t('detail.faqGenPrompt')}</span>
                    <textarea
                      placeholder={t('detail.faqGenPromptPlaceholder')}
                      value={settingsFaqPrompt}
                      onChange={(e) => setSettingsFaqPrompt(e.target.value)}
                      rows={6}
                    />
                    <small>{t('detail.faqGenPromptHelp')}</small>
                  </label>

                  <label>
                    <span>{t('detail.metadataKeys')}</span>
                    <input
                      type="text"
                      placeholder={t('detail.metadataKeysPlaceholder')}
                      value={settingsMetadataKeys}
                      onChange={(e) => setSettingsMetadataKeys(e.target.value)}
                    />
                    <small>{t('detail.metadataKeysHelp')}</small>
                  </label>
                </div>
              </div>

              <fieldset className="kb-settings-fieldset kb-settings-index-fieldset">
                <legend>{t('detail.indexJobTitle')}</legend>
                <div className="kb-settings-index-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={indexJobSubmitting || !kb?.embedding_model_id}
                    onClick={() => void enqueueIndexJob()}
                  >
                    {indexJobSubmitting ? (
                      <>
                        <Loader2 size={14} className="kb-spinner-inline" />
                        {t('detail.indexJobButtonRunning')}
                      </>
                    ) : (
                      t('detail.indexJobButton')
                    )}
                  </button>
                  <Link to="/jobs" className="kb-settings-index-jobs-link">
                    {t('detail.indexJobViewJobs')}
                  </Link>
                </div>
                <small className="kb-settings-index-help">{t('detail.indexJobHelp')}</small>
                {!kb?.embedding_model_id ? (
                  <small className="kb-settings-index-warn">{t('detail.indexJobRequiresEmbedding')}</small>
                ) : null}
              </fieldset>
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
              <h2 id="gen-faq-title">{genStep === 'config' ? t('detail.genModalTitleConfig') : t('detail.genModalTitleReview')}</h2>
              <button
                type="button"
                className="kb-doc-picker-close"
                onClick={closeGenerateModal}
                disabled={generating || genSaving}
                aria-label={t('detail.closeAria')}
              >
                <X size={20} />
              </button>
            </div>
            <p className="kb-doc-picker-hint">
              {genStep === 'config'
                ? generating && genProgress
                  ? t('detail.genHintProgress', {
                      current: genProgress.current,
                      total: genProgress.total,
                      name: genProgress.documentName,
                    })
                  : t('detail.genHintConfig')
                : t('detail.genHintReview')}
            </p>
            {generating && genProgress && genProgress.total > 1 && (
              <div className="kb-gen-progress-bar">
                <div
                  className="kb-gen-progress-fill"
                  style={{ width: `${(genProgress.current / genProgress.total) * 100}%` }}
                />
              </div>
            )}

            {genStep === 'config' ? (
              <>
                <div className="kb-gen-model-select">
                  <label>
                    <span>{t('detail.llmModel')}</span>
                    <select value={genModelId} onChange={(e) => setGenModelId(e.target.value)}>
                      <option value="">{t('detail.selectModel')}</option>
                      {llmModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t('detail.prompt')}</span>
                    <textarea
                      placeholder={t('detail.promptPlaceholder')}
                      value={genPrompt}
                      onChange={(e) => setGenPrompt(e.target.value)}
                      rows={4}
                    />
                  </label>
                </div>

                <div className="kb-gen-doc-header">
                  <span className="kb-gen-doc-label">{t('detail.documents')}</span>
                  <button
                    type="button"
                    className="kb-gen-toggle-all"
                    onClick={() => {
                      if (genSelectedDocs.size === docs.length) setGenSelectedDocs(new Set());
                      else setGenSelectedDocs(new Set(docs.map((d) => d.document_id)));
                    }}
                  >
                    {genSelectedDocs.size === docs.length ? t('detail.deselectAll') : t('detail.selectAll')}
                  </button>
                </div>

                <div className="kb-doc-picker-list">
                  {docs.length === 0 ? (
                    <div className="kb-doc-picker-empty">
                      <p>{t('detail.genNoDocs')}</p>
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
                    <p>{t('detail.genNoPreview')}</p>
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
                        aria-label={t('detail.genRemoveFaqAria')}
                        title={t('detail.remove')}
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
                      ? t('detail.genFooterSelectedDocs', { count: genSelectedDocs.size })
                      : t('detail.genFooterNoDocs'))
                  : t('detail.genFooterSaveCount', { count: genPreviewFaqs.length })}
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
                      {t('detail.cancel')}
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
                          <span>{t('detail.generating')}</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={18} />
                          <span>{t('detail.generate')}</span>
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
                      {t('detail.genModalBack')}
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
                          <span>{t('detail.saving')}</span>
                        </>
                      ) : (
                        <>
                          <Check size={18} />
                          <span>{t('detail.saveFaqs', { count: genPreviewFaqs.length })}</span>
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
          <div className="kb-doc-picker kb-doc-picker-split" onClick={(e) => e.stopPropagation()}>
            <div className="kb-doc-picker-header">
              <h2 id="doc-picker-title">{t('detail.docPickerTitle')}</h2>
              <button
                type="button"
                className="kb-doc-picker-close"
                onClick={closeDocPicker}
                disabled={pickerAdding}
                aria-label={t('detail.closeAria')}
              >
                <X size={20} />
              </button>
            </div>
            <div className="kb-doc-picker-body">
              <aside className="kb-doc-picker-sidebar">
                <span className="kb-doc-picker-sidebar-label">{t('detail.channels')}</span>
                <ul className="kb-doc-picker-channel-tree">
                  {channels.length === 0 ? (
                    <li className="kb-doc-picker-channel-empty">{t('detail.noChannels')}</li>
                  ) : (
                    <>
                      {channels.map((ch) => (
                        <DocPickerChannelTree
                          key={ch.id}
                          node={ch}
                          selectedId={pickerSelectedChannel}
                          expanded={pickerChannelExpanded}
                          onSelect={handlePickerChannelSelect}
                          onToggle={handlePickerChannelToggle}
                          depth={0}
                        />
                      ))}
                    </>
                  )}
                </ul>
              </aside>
              <div className="kb-doc-picker-main">
                <div className="kb-doc-picker-search">
                  <SearchIcon size={18} />
                  <input
                    type="search"
                    placeholder={t('detail.searchDocsPlaceholder')}
                    value={pickerSearch}
                    onChange={(e) => handlePickerSearch(e.target.value)}
                    disabled={!pickerSelectedChannel}
                    autoFocus
                  />
                </div>
                <div className="kb-doc-picker-list">
                  {!pickerSelectedChannel ? (
                    <div className="kb-doc-picker-empty">
                      <p>{t('detail.selectChannelFirst')}</p>
                    </div>
                  ) : pickerLoading ? (
                    <div className="kb-doc-picker-loading">
                      <Loader2 size={24} className="kb-doc-picker-spinner" />
                      <span>{t('detail.loadingDocs')}</span>
                    </div>
                  ) : pickerResults.length === 0 ? (
                    <div className="kb-doc-picker-empty">
                      <p>{t('detail.noDocsFound')}</p>
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
                          {added && <span className="kb-doc-picker-item-badge">{t('detail.addedBadge')}</span>}
                        </div>
                      );
                    })
                  )}
                </div>
                {pickerSelectedChannel && pickerTotal > 0 && (
                  <div className="kb-doc-picker-pagination">
                    <span className="kb-doc-picker-pagination-info">
                      {t('detail.pickerPageRange', {
                        start: pickerPage * pickerPageSize + 1,
                        end: Math.min((pickerPage + 1) * pickerPageSize, pickerTotal),
                        total: pickerTotal,
                      })}
                    </span>
                    <div className="kb-doc-picker-pagination-btns">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setPickerPage((p) => Math.max(0, p - 1))}
                        disabled={!pickerCanPrev}
                        aria-label={t('detail.pickerAriaPrevPage')}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setPickerPage((p) => Math.min(pickerTotalPages - 1, p + 1))}
                        disabled={!pickerCanNext}
                        aria-label={t('detail.pickerAriaNextPage')}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="kb-doc-picker-footer">
              <span className="kb-doc-picker-count">
                {pickerSelected.size > 0
                  ? t('detail.pickerSelected', { count: pickerSelected.size })
                  : t('detail.pickerNoneSelected')}
              </span>
              <div className="kb-doc-picker-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeDocPicker}
                  disabled={pickerAdding}
                >
                  {t('detail.cancel')}
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
                      <span>{t('detail.adding')}</span>
                    </>
                  ) : (
                    <>
                      <Plus size={18} />
                      <span>
                        {pickerSelected.size > 0
                          ? t('detail.addButtonWithCount', { count: pickerSelected.size })
                          : t('detail.addButton')}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showWikiSpacePicker && (
        <div
          className="kb-doc-picker-overlay"
          onClick={closeWikiSpacePicker}
          role="dialog"
          aria-modal="true"
          aria-labelledby="wiki-picker-title"
        >
          <div className="kb-doc-picker kb-doc-picker--narrow" onClick={(e) => e.stopPropagation()}>
            <div className="kb-doc-picker-header">
              <h2 id="wiki-picker-title">{t('detail.wikiPickerTitle')}</h2>
              <button
                type="button"
                className="kb-doc-picker-close"
                onClick={closeWikiSpacePicker}
                disabled={Boolean(wikiSpaceBusyId)}
                aria-label={t('detail.closeAria')}
              >
                <X size={20} />
              </button>
            </div>
            <div className="kb-doc-picker-body">
              {wikiSpacePickerLoading ? (
                <p className="kb-empty-text">{t('detail.loading')}</p>
              ) : (
                <>
                  <ul className="kb-wiki-picker-list">
                    {wikiSpacePickerItems
                      .filter((w) => !kbWikiSpaces.some((k) => k.wiki_space_id === w.id))
                      .map((w) => (
                        <li key={w.id} className="kb-wiki-picker-row">
                          <span className="kb-wiki-picker-name">{w.name}</span>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={wikiSpaceBusyId !== null}
                            onClick={() => void handleAddWikiSpaceToKb(w.id)}
                          >
                            {wikiSpaceBusyId === w.id ? (
                              <Loader2 size={16} className="kb-doc-picker-spinner" />
                            ) : (
                              <Plus size={16} />
                            )}
                            <span>{t('detail.linkWikiSpace')}</span>
                          </button>
                        </li>
                      ))}
                  </ul>
                  {wikiSpacePickerItems.filter((w) => !kbWikiSpaces.some((k) => k.wiki_space_id === w.id)).length === 0 && (
                    <p className="kb-empty-text">{t('detail.wikiPickerEmpty')}</p>
                  )}
                </>
              )}
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
              <h2 id="chunk-dialog-title">{t('detail.chunkDialogTitle')}</h2>
              <button
                type="button"
                className="kb-doc-picker-close"
                onClick={closeChunkDialog}
                disabled={chunkSaving}
                aria-label={t('detail.closeAria')}
              >
                <X size={20} />
              </button>
            </div>
            <div className="kb-faq-dialog-form">
              <label>
                <span>{t('detail.chunkSource')}</span>
                <input
                  type="text"
                  value={editChunk.document_name || editChunk.document_id || editChunk.wiki_page_id || ''}
                  readOnly
                  disabled
                  className="kb-chunk-dialog-readonly"
                />
              </label>
              <label>
                <span>{t('detail.chunkContent')}</span>
                <textarea
                  value={chunkContent}
                  onChange={(e) => setChunkContent(e.target.value)}
                  rows={8}
                  readOnly={chunkDialogReadOnly}
                />
              </label>

              {kb?.metadata_keys && kb.metadata_keys.length > 0 && (
                <div className="kb-kv-editor">
                  <span className="kb-kv-editor-label">{t('detail.metadata')}</span>
                  <small className="kb-kv-editor-hint">
                    {Object.values(chunkMetadataIsArray).some(Boolean) ? t('detail.kvHintArray') : t('detail.kvHintSingle')}
                  </small>
                  {kb.metadata_keys.map((key) => (
                    <div key={key} className="kb-kv-row kb-kv-row-config">
                      <span className="kb-kv-key-label">{key}{chunkMetadataIsArray[key] ? t('detail.arraySuffix') : ''}</span>
                      <input
                        type="text"
                        placeholder={chunkMetadataIsArray[key] ? t('detail.placeholderValueArray', { key }) : t('detail.placeholderValueSingle', { key })}
                        value={chunkDocMetadataValues[key] ?? ''}
                        onChange={(e) => setChunkDocMetadataValues((prev) => ({ ...prev, [key]: e.target.value }))}
                        disabled={chunkDialogReadOnly}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="kb-doc-picker-footer">
                <div />
                <div className="kb-doc-picker-actions">
                  {chunkDialogReadOnly ? (
                    <button type="button" className="btn btn-primary" onClick={closeChunkDialog}>
                      {t('detail.chunkDialogClose')}
                    </button>
                  ) : (
                    <>
                      <button type="button" className="btn btn-secondary" onClick={closeChunkDialog} disabled={chunkSaving}>
                        {t('detail.cancel')}
                      </button>
                      <button type="button" className="btn btn-primary" onClick={handleSaveChunk} disabled={chunkSaving || !chunkContent.trim()}>
                        {chunkSaving ? t('detail.saving') : t('detail.update')}
                      </button>
                    </>
                  )}
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
              <h2 id="faq-dialog-title">{editFaq ? t('detail.faqDialogEdit') : t('detail.faqDialogAdd')}</h2>
              <button
                type="button"
                className="kb-doc-picker-close"
                onClick={() => { setShowFaqDialog(false); setEditFaq(null); }}
                aria-label={t('detail.closeAria')}
              >
                <X size={20} />
              </button>
            </div>
            <div className="kb-faq-dialog-form">
              <label>
                <span>{t('detail.question')}</span>
                <input
                  type="text"
                  placeholder={t('detail.placeholderQuestion')}
                  value={faqQuestion}
                  onChange={(e) => setFaqQuestion(e.target.value)}
                  autoFocus
                />
              </label>
              <label>
                <span>{t('detail.answer')}</span>
                <textarea
                  placeholder={t('detail.placeholderAnswer')}
                  value={faqAnswer}
                  onChange={(e) => setFaqAnswer(e.target.value)}
                  rows={5}
                />
              </label>

              {kb?.metadata_keys && kb.metadata_keys.length > 0 && (
                <div className="kb-kv-editor">
                  <span className="kb-kv-editor-label">{t('detail.metadata')}</span>
                  <small className="kb-kv-editor-hint">
                    {Object.values(faqMetadataIsArray).some(Boolean) ? t('detail.kvHintArray') : t('detail.kvHintSingle')}
                  </small>
                  {kb.metadata_keys.map((key) => (
                    <div key={key} className="kb-kv-row kb-kv-row-config">
                      <span className="kb-kv-key-label">{key}{faqMetadataIsArray[key] ? t('detail.arraySuffix') : ''}</span>
                      <input
                        type="text"
                        placeholder={faqMetadataIsArray[key] ? t('detail.placeholderValueArray', { key }) : t('detail.placeholderValueSingle', { key })}
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
                    {t('detail.cancel')}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleSaveFaq} disabled={!faqQuestion.trim() || !faqAnswer.trim()}>
                    {editFaq ? t('detail.update') : t('detail.create')}
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
