import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Settings, Users } from 'lucide-react';
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
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { EntityViewHeader, EntityViewLoading } from '../shared/EntityViewShell';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import '../../styles/settings-page.scss';
import './EvaluationDatasetDetail.scss';
import './EvaluationDatasetSettings.scss';

type SettingsTabId = 'general' | 'sharing';

export function EvaluationDatasetSettings() {
  const { t } = useTranslation('workspace');
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { id: evaluationId = '' } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<SettingsTabId>(
    tabParam === 'sharing' ? 'sharing' : 'general'
  );

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

  useEffect(() => {
    if (tabParam === 'sharing' || tabParam === 'general') {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const settingsTabs = useMemo(
    () => [
      { id: 'general' as const, label: t('evaluationSettings.general'), icon: Settings },
      { id: 'sharing' as const, label: t('evaluationSettings.tabSharing'), icon: Users },
    ],
    [t]
  );

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

  return (
    // Rendered inside the dataset shell, which already names the dataset and says how to go back.
    <div className="settings-page">
      <EntityViewHeader
        title={t('evaluationDetail.settings')}
        subtitle={t('evaluationSettings.settingsHint')}
      />

      <div className="settings-page-tabs eval-dataset-settings-tabs">
        {settingsTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`settings-page-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => {
              setActiveTab(tab.id);
              setSearchParams({ tab: tab.id }, { replace: true });
            }}
          >
            <tab.icon size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'sharing' && evaluationId ? (
        <div className="settings-page-form">
          <ResourceSharePanel
            resourceType={RESOURCE_TYPES.evaluation}
            resourceId={evaluationId}
            title={t('evaluationSettings.sharingTitle')}
          />
        </div>
      ) : null}

      {activeTab === 'general' ? (
      <>
      <div className="settings-page-form">
        <section className="settings-page-section">
          <h2>{t('evaluationSettings.general')}</h2>
          <p className="settings-page-hint">{t('evaluationSettings.generalHint')}</p>
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
        </section>

        <section className="settings-page-section">
          <h2>{t('evaluationSettings.knowledgeBase')}</h2>
          <p className="settings-page-hint">{t('evaluationSettings.knowledgeBaseHint')}</p>
          <FormField
            label={t('evaluationSettings.knowledgeBaseLabel')}
            hint={
              <>
                {t('evaluationSettings.knowledgeBaseNote')}{' '}
                {knowledgeBaseIdField.trim() ? (
                  <Link
                    to={`/knowledge-bases/${knowledgeBaseIdField.trim()}?tab=search`}
                    className="eval-dataset-settings-link"
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
        </section>

        <section className="settings-page-section">
          <h2>{t('evaluationSettings.semanticModel')}</h2>
          <p className="settings-page-hint">{t('evaluationSettings.semanticModelHint')}</p>
          <FormField label={t('evaluationSettings.semanticModelLabel')}>
            <select
              value={semanticModelIdField}
              onChange={(e) => setSemanticModelIdField(e.target.value)}
            >
              <option value="">{t('evaluationSettings.semanticModelNone')}</option>
              {semanticModelIdField && !semanticModels.some((m) => m.id === semanticModelIdField) ? (
                <option value={semanticModelIdField}>{semanticModelIdField}</option>
              ) : null}
              {semanticModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </FormField>
        </section>

        <section className="settings-page-section">
          <h2>{t('evaluationSettings.wikiSpace')}</h2>
          <p className="settings-page-hint">{t('evaluationSettings.wikiSpaceHint')}</p>
          <FormField
            label={t('evaluationSettings.wikiSpaceLabel')}
            hint={
              <>
                {t('evaluationSettings.wikiSemanticIndexNote')}{' '}
                {wikiSpaceIdField.trim() ? (
                  <Link
                    to={`/wikis/${wikiSpaceIdField.trim()}/settings`}
                    className="eval-dataset-settings-link"
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
              {/* A space the dataset points at but this reader cannot list: show it, never silently
                  swap the choice to none. */}
              {wikiSpaceIdField && !wikiSpaces.some((w) => w.id === wikiSpaceIdField) ? (
                <option value={wikiSpaceIdField}>{wikiSpaceIdField}</option>
              ) : null}
              {wikiSpaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </FormField>
        </section>

        <div className="settings-page-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSave()}
            disabled={saving || !dirty}
          >
            {saving ? t('evaluation.saving') : t('shared.save')}
          </button>
          {dirty ? <span className="settings-page-unsaved">{t('evaluationSettings.unsaved')}</span> : null}
        </div>
      </div>

      <section className="eval-dataset-settings-danger settings-page-form">
        <h2>{t('evaluationSettings.dangerZone')}</h2>
        <p className="settings-page-hint">{t('evaluationSettings.dangerHint')}</p>
        <button
          type="button"
          className="btn eval-dataset-settings-delete"
          onClick={() => void handleDelete()}
          disabled={deleting}
        >
          {deleting ? t('evaluationSettings.deleting') : t('evaluationSettings.deleteDataset')}
        </button>
      </section>
      </>
      ) : null}
    </div>
  );
}
