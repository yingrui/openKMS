import { useCallback, useState } from 'react';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import {
  createFAQ,
  deleteFAQ,
  fetchAllKBDocuments,
  fetchFAQs,
  saveFAQs,
  generateFAQs,
  polishFAQAnswer,
  updateFAQ,
  type FAQGenerateResult,
  type FAQResponse,
  type KnowledgeBaseResponse,
} from '../../../../data/knowledgeBasesApi';
import { configValuesToMetadata } from '../../KnowledgeBaseDetail.metadataUtils';
import type { KBDocumentResponse } from '../../../../data/knowledgeBasesApi';

/**
 * The FAQ tab: the curated pairs, the editor, and the two-step generator.
 *
 * One hook because the three share a dialog lifecycle — "save this answer as an FAQ", "write one by hand"
 * and "generate from documents" all end in the same review fields, and splitting them would have meant
 * three copies of `faqQuestion`/`faqAnswer`/`faqMetadataIsArray`.
 *
 * `setFaqLabelsValues` and `setFaqLabelAllowMultiple` are kept although nothing reads them back: the dialog
 * takes them as props (its metadata editor is driven by `faqDocMetadataValues` + `faqMetadataIsArray`), and
 * dropping them would change that component's contract for no gain.
 */
export function useKbFaqs({
  kbId,
  kb,
  loadKb,
  t,
}: {
  kbId: string | undefined;
  kb: KnowledgeBaseResponse | null;
  /** Re-read the knowledge base after a save, so its FAQ count is not stale. */
  loadKb: () => void;
  t: TFunction;
}) {

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
  const [genDocs, setGenDocs] = useState<KBDocumentResponse[]>([]);
  const [genSelectedDocs, setGenSelectedDocs] = useState<Set<string>>(new Set());
  const [genModelId, setGenModelId] = useState('');
  const [genPrompt, setGenPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<{ current: number; total: number; documentName: string } | null>(null);
  const [genStep, setGenStep] = useState<'config' | 'review'>('config');
  const [genPreviewFaqs, setGenPreviewFaqs] = useState<FAQGenerateResult[]>([]);
  const [genSaving, setGenSaving] = useState(false);


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


  // --- FAQ handlers ---

  const closeFaqDialog = () => {
    setShowFaqDialog(false);
    setEditFaq(null);
    setFaqDialogSource('manual');
    setFaqPolishing(false);
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


  return {
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
    editFaq,
    setEditFaq,
    faqQuestion,
    setFaqQuestion,
    faqAnswer,
    setFaqAnswer,
    setFaqLabelsValues,
    setFaqLabelAllowMultiple,
    faqDocMetadataValues,
    setFaqDocMetadataValues,
    faqMetadataIsArray,
    setFaqMetadataIsArray,
    showGenerateModal,
    genDocs,
    setGenSelectedDocs,
    genSelectedDocs,
    genModelId,
    setGenModelId,
    genPrompt,
    setGenPrompt,
    generating,
    genProgress,
    genStep,
    genPreviewFaqs,
    genSaving,
    loadFaqs,
    closeFaqDialog,
    handlePolishFaqAnswer,
    handleSaveFaq,
    handleDeleteFaq,
    openGenerateModal,
    closeGenerateModal,
    toggleGenDoc,
    handleGenerateFaqs,
    removeGenPreviewFaq,
    handleSaveGeneratedFaqs,
    handleGenBackToConfig,
  };
}
