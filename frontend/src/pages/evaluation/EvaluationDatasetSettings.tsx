import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Settings, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchEvaluation,
  updateEvaluation,
  deleteEvaluation,
  type EvaluationResponse,
} from '../../data/evaluationsApi';
import { fetchKnowledgeBases, type KnowledgeBaseResponse } from '../../data/knowledgeBasesApi';
import { fetchWikiSpaces, type WikiSpaceResponse } from '../../data/wikiSpacesApi';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
import '../documents/DocumentChannelSettings.scss';
import './EvaluationDatasetDetail.scss';
import './EvaluationDatasetSettings.scss';

type SettingsTabId = 'general' | 'sharing';

export function EvaluationDatasetSettings() {
  const { t } = useTranslation('workspace');
  const navigate = useNavigate();
  const { id: evaluationId = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
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

  const load = useCallback(async () => {
    if (!evaluationId) return;
    setLoading(true);
    try {
      const [data, wikiList, kbList] = await Promise.all([
        fetchEvaluation(evaluationId),
        fetchWikiSpaces().catch(() => ({ items: [], total: 0 })),
        fetchKnowledgeBases().catch(() => ({ items: [], total: 0 })),
      ]);
      setDataset(data);
      setNameField(data.name);
      setDescriptionField(data.description ?? '');
      setKnowledgeBaseIdField(data.knowledge_base_id);
      setWikiSpaceIdField(data.wiki_space_id ?? '');
      setWikiSpaces(wikiList.items ?? []);
      setKnowledgeBases(kbList.items ?? []);
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
      });
      setDataset(updated);
      setKnowledgeBaseIdField(updated.knowledge_base_id);
      setWikiSpaceIdField(updated.wiki_space_id ?? '');
      toast.success(t('evaluation.updatedToast'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluation.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!dataset) return;
    if (!window.confirm(t('evaluation.deleteConfirm', { name: dataset.name }))) return;
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
      <div className="eval-dataset-settings document-channel-settings">
        <p className="page-subtitle">{t('evaluationSettings.loading')}</p>
      </div>
    );
  }

  if (!dataset) {
    return (
      <div className="eval-dataset-settings document-channel-settings">
        <Link to="/evaluations" className="document-channel-settings-back">
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
    <div className="eval-dataset-settings">
      <div className="eval-detail-header">
        <Link to={`/evaluations/${evaluationId}`} className="eval-back">
          <ArrowLeft size={18} />
          <span>{t('evaluationSettings.backToDataset')}</span>
        </Link>
        <div className="eval-detail-title-row">
          <h1>{t('evaluationSettings.pageTitle')}</h1>
        </div>
        <p className="eval-detail-desc">{t('evaluationSettings.configureSubtitle', { name: dataset.name })}</p>
      </div>

      <div className="document-channel-settings-tabs eval-dataset-settings-tabs">
        {settingsTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`document-channel-settings-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'sharing' && evaluationId ? (
        <div className="document-channel-settings-form eval-dataset-settings-panel">
          <ResourceSharePanel
            resourceType={RESOURCE_TYPES.evaluation}
            resourceId={evaluationId}
            title={t('evaluationSettings.sharingTitle')}
          />
        </div>
      ) : null}

      {activeTab === 'general' ? (
      <>
      <div className="document-channel-settings-form eval-dataset-settings-panel">
        <section className="document-channel-settings-section">
          <h2>{t('evaluationSettings.general')}</h2>
          <p className="document-channel-settings-hint">{t('evaluationSettings.generalHint')}</p>
          <div className="document-channel-settings-field">
            <label htmlFor="eval-settings-name">{t('shared.name')}</label>
            <input
              id="eval-settings-name"
              type="text"
              value={nameField}
              onChange={(e) => setNameField(e.target.value)}
              placeholder={t('evaluation.namePlaceholder')}
            />
          </div>
          <div className="document-channel-settings-field">
            <label htmlFor="eval-settings-description">{t('shared.description')}</label>
            <textarea
              id="eval-settings-description"
              value={descriptionField}
              onChange={(e) => setDescriptionField(e.target.value)}
              placeholder={t('evaluation.descPlaceholder')}
              rows={3}
            />
          </div>
        </section>

        <section className="document-channel-settings-section">
          <h2>{t('evaluationSettings.knowledgeBase')}</h2>
          <p className="document-channel-settings-hint">{t('evaluationSettings.knowledgeBaseHint')}</p>
          <div className="document-channel-settings-field">
            <label htmlFor="eval-settings-kb">{t('evaluationSettings.knowledgeBaseLabel')}</label>
            <select
              id="eval-settings-kb"
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
          </div>
          {knowledgeBaseIdField.trim() ? (
            <Link
              to={`/knowledge-bases/${knowledgeBaseIdField.trim()}`}
              className="eval-dataset-settings-kb-link"
            >
              {t('evaluationSettings.openKnowledgeBase')}
            </Link>
          ) : null}
          <p className="document-channel-settings-hint eval-dataset-settings-kb-note">
            {t('evaluationSettings.knowledgeBaseNote')}
          </p>
        </section>

        <section className="document-channel-settings-section">
          <h2>{t('evaluationSettings.wikiSpace')}</h2>
          <p className="document-channel-settings-hint">{t('evaluationSettings.wikiSpaceHint')}</p>
          <div className="document-channel-settings-field">
            <label htmlFor="eval-settings-wiki">{t('evaluationSettings.wikiSpaceLabel')}</label>
            <select
              id="eval-settings-wiki"
              value={wikiSpaceIdField}
              onChange={(e) => setWikiSpaceIdField(e.target.value)}
            >
              <option value="">{t('evaluationSettings.wikiSpaceNone')}</option>
              {wikiSpaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <p className="document-channel-settings-hint">{t('evaluationSettings.wikiSemanticIndexNote')}</p>
          {wikiSpaceIdField.trim() ? (
            <Link
              to={`/wikis/${wikiSpaceIdField.trim()}/settings`}
              className="eval-dataset-settings-kb-link"
            >
              {t('evaluationSettings.openWikiSpace')}
            </Link>
          ) : null}
        </section>

        <div className="document-channel-settings-actions">
          <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? t('evaluation.saving') : t('shared.save')}
          </button>
        </div>
      </div>

      <section className="eval-dataset-settings-danger document-channel-settings-form">
        <h2>{t('evaluationSettings.dangerZone')}</h2>
        <p className="document-channel-settings-hint">{t('evaluationSettings.dangerHint')}</p>
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
