import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { FormField } from '../../styles/design-system';
import {
  fetchEvaluation,
  updateEvaluation,
  deleteEvaluation,
  type EvaluationResponse,
} from '../../data/evaluationsApi';
import { fetchAllKnowledgeBases, type KnowledgeBaseResponse } from '../../data/knowledgeBasesApi';
import { fetchAllWikiSpaces, type WikiSpaceResponse } from '../../data/wikiSpacesApi';
import { fetchSemanticModels, type SemanticModelResponse } from '../../data/semanticModelsApi';
import { EntityViewHeader, EntityViewLoading, EntityViewPanel } from '../shared/EntityViewShell';
import { useConfirm } from '../../contexts/ConfirmContext';
import './EvaluationDatasetDetail.scss';
import './EvaluationDatasetSettings.scss';

export function EvaluationDatasetSettings() {
  const { t } = useTranslation('workspace');
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { id: evaluationId = '' } = useParams<{ id: string }>();

  const [dataset, setDataset] = useState<EvaluationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [nameField, setNameField] = useState('');
  const [descriptionField, setDescriptionField] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [wikiSpaces, setWikiSpaces] = useState<WikiSpaceResponse[]>([]);
  const [wikiSpaceIdField, setWikiSpaceIdField] = useState('');
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseResponse[]>([]);
  const [knowledgeBaseIdField, setKnowledgeBaseIdField] = useState('');
  const [semanticModels, setSemanticModels] = useState<SemanticModelResponse[]>([]);
  const [semanticModelIdField, setSemanticModelIdField] = useState('');

  const load = useCallback(async () => {
    if (!evaluationId) return;
    setLoading(true);
    try {
      const [data, wikiList, kbList, modelList] = await Promise.all([
        fetchEvaluation(evaluationId),
        fetchAllWikiSpaces().catch(() => []),
        fetchAllKnowledgeBases().catch(() => []),
        fetchSemanticModels().catch(() => ({ items: [] })),
      ]);
      setDataset(data);
      setNameField(data.name);
      setDescriptionField(data.description ?? '');
      setKnowledgeBaseIdField(data.knowledge_base_id);
      setWikiSpaceIdField(data.wiki_space_id ?? '');
      setWikiSpaces(wikiList ?? []);
      setKnowledgeBases(kbList ?? []);
      setSemanticModels(modelList?.items ?? []);
      setSemanticModelIdField(data.semantic_model_id ?? '');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluationSettings.loadFailed'));
      setDataset(null);
    } finally {
      setLoading(false);
    }
  }, [evaluationId, t]);

  useEffect(() => {
    if (!evaluationId) {
      navigate('/evaluations');
      return;
    }
    void load();
  }, [evaluationId, load, navigate]);

  /** Nothing changed → nothing to save. Saving an untouched form used to write and toast anyway.
   *  Compared on the trimmed values the API receives, so trailing spaces are not "a change". */
  const dirty =
    dataset != null &&
    (nameField.trim() !== dataset.name ||
      descriptionField.trim() !== (dataset.description ?? '') ||
      knowledgeBaseIdField.trim() !== dataset.knowledge_base_id ||
      semanticModelIdField.trim() !== (dataset.semantic_model_id ?? '') ||
      wikiSpaceIdField.trim() !== (dataset.wiki_space_id ?? ''));

  const handleSave = async () => {
    if (!evaluationId || !dataset) return;
    const name = nameField.trim();
    if (!name) {
      toast.error(t('evaluationSettings.nameRequired'));
      return;
    }
    if (!knowledgeBaseIdField.trim()) {
      toast.error(t('evaluationSettings.knowledgeBaseRequired'));
      return;
    }
    setSaving(true);
    try {
      const updated = await updateEvaluation(evaluationId, {
        name,
        description: descriptionField.trim() || null,
        knowledge_base_id: knowledgeBaseIdField.trim(),
        wiki_space_id: wikiSpaceIdField.trim() || null,
        semantic_model_id: semanticModelIdField.trim() || null,
      });
      // Reset the form to what was stored: the server trims and nulls empties, so without this a
      // saved form can still look dirty.
      setDataset(updated);
      setNameField(updated.name);
      setDescriptionField(updated.description ?? '');
      setKnowledgeBaseIdField(updated.knowledge_base_id);
      setWikiSpaceIdField(updated.wiki_space_id ?? '');
      setSemanticModelIdField(updated.semantic_model_id ?? '');
      toast.success(t('evaluation.updatedToast'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluation.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!dataset) return;
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('evaluation.deleteConfirm', { name: dataset.name }),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    setDeleting(true);
    try {
      await deleteEvaluation(dataset.id);
      toast.success(t('evaluation.deletedToast'));
      navigate('/evaluations');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluationSettings.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  if (!evaluationId) return null;

  if (loading) {
    return (
      <div className="settings-page">
        <EntityViewLoading label={t('evaluationSettings.loading')} />
      </div>
    );
  }

  if (!dataset) {
    return (
      <div className="settings-page">
        <Link to="/evaluations" className="settings-page-back">
          <ArrowLeft size={18} />
          <span>{t('evaluationDetail.back')}</span>
        </Link>
        <div className="page-header">
          <h1>{t('evaluationSettings.notFoundTitle')}</h1>
          <p className="page-subtitle">{t('evaluationSettings.notFoundSubtitle')}</p>
        </div>
      </div>
    );
  }

  const kbInList = knowledgeBases.some((k) => k.id === knowledgeBaseIdField);
  const wikiInList = wikiSpaces.some((w) => w.id === wikiSpaceIdField);

  return (
    // Rendered inside the dataset shell, which already names the dataset and says how to go back.
    // One page, no inner tab strip: sharing is its own entry in the shell's rail, as it is for a
    // dataset in Catalog.
    <>
      <EntityViewHeader
        title={t('evaluationDetail.settings')}
        subtitle={t('evaluationSettings.settingsHint')}
        actions={
          <>
            {dirty ? (
              <span className="eval-settings-unsaved">{t('evaluationSettings.unsaved')}</span>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSave()}
              disabled={saving || !dirty}
            >
              {saving ? t('evaluation.saving') : t('shared.save')}
            </button>
          </>
        }
      />

      <EntityViewPanel
        title={t('evaluationSettings.general')}
        description={t('evaluationSettings.generalHint')}
      >
        <div className="entity-view__form">
          <FormField label={t('shared.name')}>
            <input
              type="text"
              value={nameField}
              onChange={(e) => setNameField(e.target.value)}
              placeholder={t('evaluation.namePlaceholder')}
            />
          </FormField>
          <FormField label={t('shared.description')}>
            <textarea
              value={descriptionField}
              onChange={(e) => setDescriptionField(e.target.value)}
              placeholder={t('evaluation.descPlaceholder')}
              rows={3}
            />
          </FormField>
        </div>
      </EntityViewPanel>

      <EntityViewPanel
        title={t('evaluationSettings.knowledgeBase')}
        description={t('evaluationSettings.knowledgeBaseHint')}
      >
        <div className="entity-view__form">
          <FormField
            label={t('evaluationSettings.knowledgeBaseLabel')}
            hint={
              <>
                {t('evaluationSettings.knowledgeBaseNote')}{' '}
                {knowledgeBaseIdField.trim() ? (
                  <Link
                    to={`/knowledge-bases/${knowledgeBaseIdField.trim()}?tab=search`}
                    className="eval-settings-link"
                  >
                    {t('evaluationSettings.openKnowledgeBase')}
                  </Link>
                ) : null}
              </>
            }
          >
            <select
              value={knowledgeBaseIdField}
              onChange={(e) => setKnowledgeBaseIdField(e.target.value)}
            >
              {!kbInList && knowledgeBaseIdField ? (
                <option value={knowledgeBaseIdField}>
                  {dataset.knowledge_base_name || knowledgeBaseIdField}
                </option>
              ) : null}
              {knowledgeBases.map((kb) => (
                <option key={kb.id} value={kb.id}>
                  {kb.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </EntityViewPanel>

      <EntityViewPanel
        title={t('evaluationSettings.semanticModel')}
        description={t('evaluationSettings.semanticModelHint')}
      >
        <div className="entity-view__form">
          <FormField label={t('evaluationSettings.semanticModelLabel')}>
            <select
              value={semanticModelIdField}
              onChange={(e) => setSemanticModelIdField(e.target.value)}
            >
              <option value="">{t('evaluationSettings.semanticModelNone')}</option>
              {semanticModelIdField &&
              !semanticModels.some((m) => m.id === semanticModelIdField) ? (
                <option value={semanticModelIdField}>{semanticModelIdField}</option>
              ) : null}
              {semanticModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </EntityViewPanel>

      <EntityViewPanel
        title={t('evaluationSettings.wikiSpace')}
        description={t('evaluationSettings.wikiSpaceHint')}
      >
        <div className="entity-view__form">
          <FormField
            label={t('evaluationSettings.wikiSpaceLabel')}
            hint={
              <>
                {t('evaluationSettings.wikiSemanticIndexNote')}{' '}
                {wikiSpaceIdField.trim() ? (
                  <Link
                    to={`/wikis/${wikiSpaceIdField.trim()}/settings`}
                    className="eval-settings-link"
                  >
                    {t('evaluationSettings.openWikiSpace')}
                  </Link>
                ) : null}
              </>
            }
          >
            <select
              value={wikiSpaceIdField}
              onChange={(e) => setWikiSpaceIdField(e.target.value)}
            >
              <option value="">{t('evaluationSettings.wikiSpaceNone')}</option>
              {/* A space the dataset points at but this reader cannot list: show it, never
                  silently swap the choice to none. */}
              {wikiSpaceIdField && !wikiInList ? (
                <option value={wikiSpaceIdField}>{wikiSpaceIdField}</option>
              ) : null}
              {wikiSpaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </EntityViewPanel>

      <section className="account-card eval-settings-danger">
        <div className="account-card-head">
          <div>
            <h2 className="account-card-title">{t('evaluationSettings.dangerZone')}</h2>
            <p className="account-card-desc">{t('evaluationSettings.dangerHint')}</p>
          </div>
        </div>
        <button
          type="button"
          className="btn eval-settings-delete"
          onClick={() => void handleDelete()}
          disabled={deleting}
        >
          {deleting ? t('evaluationSettings.deleting') : t('evaluationSettings.deleteDataset')}
        </button>
      </section>
    </>
  );
}
