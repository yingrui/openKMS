import { useCallback, useMemo, useState, type MutableRefObject } from 'react';
import type { TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router-dom';
import { Settings, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  enqueueKnowledgeBaseIndexJob,
  updateKnowledgeBase,
  type KnowledgeBaseResponse,
} from '../../../../data/knowledgeBasesApi';
import { fetchAllModels, type ApiModelResponse } from '../../../../data/modelsApi';
import type { SettingsSubTabId } from '../../KnowledgeBaseDetail.types';
import { mergeAgentConfig } from '../../../workforce/agentConfigMerge';

/**
 * The settings tab: the embedding and chunking choices, the FAQ prompt, the metadata keys, the index run.
 *
 * Its own hook because these are the fields of *one form over the knowledge-base row* — saving them is a
 * single PUT, and the draft only exists so a half-typed number does not round-trip. The tab's sub-tabs
 * (general / agent / sharing) are here too: they are one navigation decision, not three.
 */
export function useKbSettings({
  kbId,
  kb,
  loadKb,
  navigate,
  seedRef,
  t,
}: {
  kbId: string | undefined;
  /** Read-only: the index run needs to know whether an embedding model is configured. */
  kb: KnowledgeBaseResponse | null;
  /** Re-read the row after saving, so the form shows what the server kept. */
  loadKb: () => void;
  navigate: NavigateFunction;
  /**
   * The shell owns the fetch, this hook owns the draft: it publishes a `seed(row)` here, and `loadKb` calls
   * it. The alternative — the hook watching `kb` — would reset a half-typed form whenever anything else
   * re-read the row (saving an FAQ, for one).
   */
  seedRef: MutableRefObject<((kb: KnowledgeBaseResponse) => void) | null>;
  t: TFunction;
}) {
  // Settings (the agent's own fields live in the Agent tab, which owns `agent_url`/`agent_skills`/`agent_config` — one
  // editor per field, so saving one screen cannot revert what was set on another).
  const [settingsEmbeddingModelId, setSettingsEmbeddingModelId] = useState('');
  const [settingsFaqPrompt, setSettingsFaqPrompt] = useState('');
  const [settingsChunkStrategy, setSettingsChunkStrategy] = useState('fixed_size');
  const [settingsChunkSize, setSettingsChunkSize] = useState(8000);
  const [settingsChunkOverlap, setSettingsChunkOverlap] = useState(50);
  const [settingsMetadataKeys, setSettingsMetadataKeys] = useState('');
  /* Retrieval depth is a property of the corpus, so its editor is here and not on the agent. */
  const [retrievalTopK, setRetrievalTopK] = useState('5');
  const [retrievalRerank, setRetrievalRerank] = useState<boolean | null>(null);
  const [embeddingModels, setEmbeddingModels] = useState<ApiModelResponse[]>([]);
  const [llmModels, setLlmModels] = useState<ApiModelResponse[]>([]);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTabId>('general');
  const [indexJobSubmitting, setIndexJobSubmitting] = useState(false);


  /* Published for the shell's `loadKb`: the draft is seeded from the row the server just returned. */
  seedRef.current = (row: KnowledgeBaseResponse) => {
    setSettingsEmbeddingModelId(row.embedding_model_id || '');
    const cc = (row.chunk_config || {}) as Record<string, unknown>;
    setSettingsChunkStrategy((cc.strategy as string) || 'fixed_size');
    setSettingsChunkSize((cc.chunk_size as number) || 8000);
    setSettingsChunkOverlap((cc.chunk_overlap as number) || 50);
    setSettingsFaqPrompt(row.faq_prompt || '');
    setSettingsMetadataKeys(Array.isArray(row.metadata_keys) ? row.metadata_keys.join(', ') : '');
    const retrieval = (row.agent_config as { retrieval?: { top_k?: number; rerank?: boolean | null } })?.retrieval;
    setRetrievalTopK(String(retrieval?.top_k ?? 5));
    setRetrievalRerank(retrieval?.rerank ?? null);
  };

  const settingsSubTabs = useMemo(
    () =>
      [
        { id: 'general' as const, label: t('detail.settingsTabGeneral'), icon: Settings },
        { id: 'sharing' as const, label: t('detail.settingsTabSharing'), icon: Users },
      ],
    [t],
  );

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


  // --- Settings ---
  const handleSaveSettings = async () => {
    if (!kbId) return;
    setSettingsSaving(true);
    try {
      const parsedTopK = Number.parseInt(retrievalTopK, 10);
      const metadataKeys = settingsMetadataKeys
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await updateKnowledgeBase(kbId, {
        embedding_model_id: settingsEmbeddingModelId || null,
        chunk_config: {
          strategy: settingsChunkStrategy,
          chunk_size: settingsChunkSize,
          chunk_overlap: settingsChunkOverlap,
        },
        faq_prompt: settingsFaqPrompt.trim() || null,
        metadata_keys: metadataKeys.length > 0 ? metadataKeys : null,
        // Only retrieval is this form's key; the rest of the config is merged in unchanged, so a legacy
        // row keeps whatever it still carries.
        agent_config: mergeAgentConfig(kb?.agent_config ?? null, {
          retrieval: {
            top_k: parsedTopK,
            rerank: retrievalRerank,
          },
        }),
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
    retrievalTopK,
    setRetrievalTopK,
    retrievalRerank,
    setRetrievalRerank,
    settingsSaving,
    settingsSubTab,
    setSettingsSubTab,
    settingsSubTabs,
    embeddingModels,
    llmModels,
    indexJobSubmitting,
    loadModels,
    enqueueIndexJob,
    handleSaveSettings,
  };
}
