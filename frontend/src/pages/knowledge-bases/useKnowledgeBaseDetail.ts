import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  fetchKnowledgeBase,
  type KnowledgeBaseResponse,
} from '../../data/knowledgeBasesApi';
import { useEnsureDocumentChannels } from '../../contexts/DocumentChannelsContext';
import { configValuesToMetadata, objToConfigValues } from './KnowledgeBaseDetail.metadataUtils';
import { useKbChunks } from './detail/hooks/useKbChunks';
import { useKbDocuments } from './detail/hooks/useKbDocuments';
import { useKbScope } from './detail/hooks/useKbScope';
import { useKbFaqs } from './detail/hooks/useKbFaqs';
import { useKbSettings } from './detail/hooks/useKbSettings';
import { useKbSearch } from './detail/hooks/useKbSearch';
import {
  TAB_ORDER,
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
  const [loading, setLoading] = useState(true);

  const kbDetailPath = useCallback(
    (tab: TabId) => {
      if (!kbId) return '/knowledge-bases';
      if (tab === 'documents') return `/knowledge-bases/${kbId}`;
      return `/knowledge-bases/${kbId}?tab=${encodeURIComponent(tab)}`;
    },
    [kbId],
  );

  const selectKbTab = useCallback(
    (tab: TabId) => {
      setActiveTab(tab);
      if (!kbId) return;
      navigate(kbDetailPath(tab), { replace: true });
    },
    [kbId, navigate, kbDetailPath],
  );

  const settingsSeedRef = useRef<((row: KnowledgeBaseResponse) => void) | null>(null);
  const settingsState = useKbSettings({
    kbId,
    kb,
    loadKb: () => void loadKb(),
    navigate,
    seedRef: settingsSeedRef,
    t,
  });
  const loadModels = settingsState.loadModels;

  const loadKb = useCallback(async () => {
    if (!kbId) return;
    try {
      const data = await fetchKnowledgeBase(kbId);
      setKb(data);
      settingsSeedRef.current?.(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastLoadKbFailed'));
    } finally {
      setLoading(false);
    }
  }, [kbId, t]);

  useEffect(() => {
    loadKb();
    loadModels();
  }, [loadKb, loadModels]);

  useEffect(() => {
    const q = searchParams.get('tab');
    if (!q) return;
    if (TAB_ORDER.includes(q as TabId)) {
      setActiveTab(q as TabId);
    }
  }, [searchParams]);

  const docsState = useKbDocuments({ kbId, channels, loadKb, t });
  const scopeState = useKbScope({ kbId, kb, loadKb, t });
  const loadDocs = docsState.loadDocs;
  const loadKbWikiSpaces = scopeState.loadKbWikiSpaces;
  const loadKbAgentScope = scopeState.loadKbAgentScope;
  const faqsState = useKbFaqs({ kbId, kb, loadKb, t });
  const chunksState = useKbChunks({ kbId, kb, loadKb, t });
  const loadFaqs = faqsState.loadFaqs;
  const loadChunks = chunksState.loadChunks;
  const refreshLinkedDocIds = docsState.refreshLinkedDocIds;

  useEffect(() => {
    if (kbId) void refreshLinkedDocIds();
  }, [kbId, refreshLinkedDocIds]);

  useEffect(() => {
    if (activeTab === 'documents') void loadDocs();
    if (activeTab === 'wiki_spaces') void loadKbWikiSpaces();
    if (activeTab === 'data_scope') void loadKbAgentScope();
    if (activeTab === 'faqs') void loadFaqs();
    if (activeTab === 'chunks') void loadChunks();
  }, [activeTab, loadDocs, loadKbWikiSpaces, loadKbAgentScope, loadFaqs, loadChunks]);

  /* Tab state that only its tab needs lives in its own hook; the object below still hands the page one
     flat surface, so a tab reads `search.searchQuery` only when it is the tab that asks. */
  const search = useKbSearch({ kbId, t });

  return {
    ...docsState,
    ...scopeState,
    ...settingsState,
    ...faqsState,
    ...chunksState,
    ...search,
    kbId,
    navigate,
    searchParams,
    channels,
    t,
    kb,
    initialTab,
    activeTab,
    setActiveTab: selectKbTab,
    loading,
    loadKb,
    configValuesToMetadata,
    objToConfigValues,
  };
}
