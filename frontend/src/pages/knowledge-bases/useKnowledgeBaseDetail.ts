import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  fetchKnowledgeBase,
  type KnowledgeBaseResponse,
} from '../../data/knowledgeBasesApi';
import { useEnsureDocumentChannels } from '../../contexts/DocumentChannelsContext';
import { configValuesToMetadata, objToConfigValues } from './KnowledgeBaseDetail.metadataUtils';
import { metadataArrayFlags } from './detail/faqMetadata';
import type { FAQResponse } from '../../data/knowledgeBasesApi';
import { useKbChunks } from './detail/hooks/useKbChunks';
import { useKbDocuments } from './detail/hooks/useKbDocuments';
import { useKbWikiSpaces } from './detail/hooks/useKbWikiSpaces';
import { useKbFaqs } from './detail/hooks/useKbFaqs';
import { useKbSettings } from './detail/hooks/useKbSettings';
import { useKbSearch } from './detail/hooks/useKbSearch';
import { tabFromPathname, type TabId } from './KnowledgeBaseDetail.types';

export function useKnowledgeBaseDetail() {
  const { id: kbId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { channels } = useEnsureDocumentChannels();
  const { t } = useTranslation('knowledgeBase');
  const [kb, setKb] = useState<KnowledgeBaseResponse | null>(null);
  /* The section is the route: `/knowledge-bases/:id/faqs` *is* the FAQs tab. */
  const activeTab: TabId = tabFromPathname(location.pathname);
  const [loading, setLoading] = useState(true);

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

  const docsState = useKbDocuments({ kbId, channels, loadKb, t });
  const wikiState = useKbWikiSpaces({ kbId, kb, loadKb, t });
  const loadDocs = docsState.loadDocs;
  const loadKbWikiSpaces = wikiState.loadKbWikiSpaces;
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
    if (activeTab === 'faqs') void loadFaqs();
    if (activeTab === 'chunks') void loadChunks();
  }, [activeTab, loadDocs, loadKbWikiSpaces, loadFaqs, loadChunks]);

  /* Tab state that only its tab needs lives in its own hook; the object below still hands the page one
     flat surface, so a tab reads `search.searchQuery` only when it is the tab that asks. */
  const search = useKbSearch({ kbId, t });

  /** New FAQ: empty fields, with the KB's metadata keys laid out for the dialog. */
  const openAddFaq = useCallback(() => {
    faqsState.setEditFaq(null);
    faqsState.setFaqDialogSource('manual');
    faqsState.setFaqQuestion('');
    faqsState.setFaqAnswer('');
    faqsState.setFaqLabelsValues(objToConfigValues({}, kb?.metadata_keys ?? undefined));
    faqsState.setFaqDocMetadataValues(objToConfigValues({}, kb?.metadata_keys ?? undefined));
    faqsState.setFaqLabelAllowMultiple({});
    faqsState.setFaqMetadataIsArray({});
    faqsState.setShowFaqDialog(true);
  }, [faqsState, kb]);

  /** Edit FAQ: load its metadata, and ask the document's channel which keys are lists for it. */
  const openEditFaq = useCallback(
    async (faq: FAQResponse) => {
      faqsState.setEditFaq(faq);
      faqsState.setFaqDialogSource('manual');
      faqsState.setFaqQuestion(faq.question);
      faqsState.setFaqAnswer(faq.answer);
      const metaValues = objToConfigValues(faq.doc_metadata, kb?.metadata_keys ?? undefined);
      faqsState.setFaqLabelsValues(metaValues);
      faqsState.setFaqDocMetadataValues(metaValues);
      faqsState.setFaqLabelAllowMultiple({});
      faqsState.setFaqMetadataIsArray(
        await metadataArrayFlags(faq.document_id, kb?.metadata_keys),
      );
      faqsState.setShowFaqDialog(true);
    },
    [faqsState, kb],
  );

  return {
    ...docsState,
    ...wikiState,
    ...settingsState,
    ...faqsState,
    ...chunksState,
    ...search,
    kbId,
    navigate,
    channels,
    t,
    kb,
    activeTab,
    openAddFaq,
    openEditFaq,
    loading,
    loadKb,
    configValuesToMetadata,
    objToConfigValues,
  };
}
