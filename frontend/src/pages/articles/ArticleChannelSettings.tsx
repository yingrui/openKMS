import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckCircle2, ClipboardCheck, Plus, Settings, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useArticleChannels } from '../../contexts/ArticleChannelsContext';
import {
  findChannel,
  flattenChannels,
  getDescendantIds,
  getDocumentChannelName,
  type ChannelNode,
  type ReviewCriterionItem,
} from '../../data/channelUtils';
import { updateArticleChannel } from '../../data/articleChannelsApi';
import { fetchAllModels, type ApiModelResponse } from '../../data/modelsApi';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
import {
  getBuiltinCriteria,
  getReviewPresets,
  type ReviewPresetId,
} from './articleReviewPresets';
import '../documents/DocumentChannelSettings.scss';

function flattenForParent(nodes: ChannelNode[], depth = 0): { id: string; name: string; depth: number }[] {
  const out: { id: string; name: string; depth: number }[] = [];
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, depth });
    if (n.children?.length) out.push(...flattenForParent(n.children, depth + 1));
  }
  return out;
}

function findParentId(nodes: ChannelNode[], targetId: string, parent: string | null = null): string | null | undefined {
  for (const node of nodes) {
    if (node.id === targetId) return parent;
    const r = findParentId(node.children ?? [], targetId, node.id);
    if (r !== undefined) return r;
  }
  return undefined;
}

type TabId = 'general' | 'review' | 'sharing';

export function ArticleChannelSettings() {
  const { t, i18n } = useTranslation('articles');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const { channelId = '' } = useParams<{ channelId: string }>();
  const { channels, loading, error, refetch } = useArticleChannels();

  const channel = channels.length > 0 && channelId ? findChannel(channels, channelId) : null;
  const channelName = getDocumentChannelName(channels, channelId);

  const [nameField, setNameField] = useState('');
  const [descriptionField, setDescriptionField] = useState('');
  const [parentIdField, setParentIdField] = useState<string>('');
  const [reviewModelId, setReviewModelId] = useState('');
  const [reviewPrompt, setReviewPrompt] = useState('');
  const [reviewCriteria, setReviewCriteria] = useState<ReviewCriterionItem[]>([]);
  const [llmModels, setLlmModels] = useState<ApiModelResponse[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>(
    tabParam === 'sharing' ? 'sharing' : tabParam === 'review' ? 'review' : 'general',
  );

  useEffect(() => {
    if (tabParam === 'sharing' || tabParam === 'review' || tabParam === 'general') {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const parentOptions = useMemo(() => flattenForParent(channels), [channels]);

  const moveParentChoices = useMemo(() => {
    const root = t('channelSettings.parentNone');
    if (!channelId) return [{ id: '', name: root, depth: 0 }];
    const exclude = getDescendantIds(channels, channelId);
    return [{ id: '', name: root, depth: 0 }, ...parentOptions.filter((p) => !exclude.has(p.id))];
  }, [channels, channelId, parentOptions, t]);

  useEffect(() => {
    if (!channelId) navigate('/articles/channels');
  }, [channelId, navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setModelsLoading(true);
      try {
        const res = await fetchAllModels({ api_kind: 'chat-completions' });
        if (!cancelled) setLlmModels(res);
      } catch {
        if (!cancelled) setLlmModels([]);
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (channel) {
      setNameField(channel.name || '');
      setDescriptionField(channel.description ?? '');
      const p = findParentId(channels, channelId);
      setParentIdField(p === undefined ? '' : p ?? '');
      setReviewModelId(channel.review_model_id || '');
      setReviewPrompt(channel.review_prompt ?? '');
      const rc = channel.review_criteria;
      setReviewCriteria(
        Array.isArray(rc) && rc.length > 0
          ? rc.map((c) => ({
              id: c.id ?? '',
              label: c.label ?? '',
              description: c.description ?? '',
            }))
          : [],
      );
    }
  }, [channel, channels, channelId]);

  const handleSave = useCallback(async () => {
    if (!channelId || !channel) return;
    const name = nameField.trim();
    if (!name) {
      toast.error(t('channelSettings.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      await updateArticleChannel(channelId, {
        name,
        description: descriptionField.trim() || null,
        parent_id: parentIdField || null,
      });
      await refetch();
      toast.success(t('channelSettings.saved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('channelSettings.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [channelId, channel, nameField, descriptionField, parentIdField, refetch, t]);

  const handleSaveReview = useCallback(async () => {
    if (!channelId || !channel) return;
    const criteriaToSave = reviewCriteria
      .filter((c) => c.id.trim() && c.label.trim())
      .map((c) => ({
        id: c.id.trim(),
        label: c.label.trim(),
        description: c.description?.trim() || '',
      }));
    setSavingReview(true);
    try {
      await updateArticleChannel(channelId, {
        review_model_id: reviewModelId || null,
        review_prompt: reviewPrompt.trim() || null,
        review_criteria: criteriaToSave.length > 0 ? criteriaToSave : null,
      });
      await refetch();
      toast.success(t('channelSettings.saved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('channelSettings.saveFailed'));
    } finally {
      setSavingReview(false);
    }
  }, [channelId, channel, reviewModelId, reviewPrompt, reviewCriteria, refetch, t]);

  const reviewPresets = useMemo(() => getReviewPresets(i18n.language), [i18n.language]);
  const builtinCriteria = useMemo(() => getBuiltinCriteria(i18n.language), [i18n.language]);
  const selectedReviewModelName = useMemo(
    () => llmModels.find((m) => m.id === reviewModelId)?.name ?? reviewModelId,
    [llmModels, reviewModelId],
  );
  const reviewReady = Boolean(reviewModelId);

  const applyReviewPreset = useCallback(
    (presetId: ReviewPresetId) => {
      const preset = reviewPresets.find((p) => p.id === presetId);
      if (!preset) return;
      setReviewPrompt(preset.prompt);
      setReviewCriteria(preset.criteria.map((c) => ({ ...c })));
      toast.success(t('channelSettings.reviewTemplateApplied'));
    },
    [reviewPresets, t],
  );

  if (!channelId) return null;

  if (loading) {
    return (
      <div className="document-channel-settings">
        <p className="page-subtitle">{t('channelSettings.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="document-channel-settings">
        <p className="page-subtitle page-subtitle--error">{error}</p>
      </div>
    );
  }

  const channelIds = new Set(flattenChannels(channels).map((c) => c.id));
  if (!channelIds.has(channelId)) {
    return (
      <div className="document-channel-settings">
        <Link to="/articles/channels" className="document-channel-settings-back">
          <ArrowLeft size={18} />
          <span>{t('channelSettings.backToManagement')}</span>
        </Link>
        <div className="page-header">
          <h1>{t('channelSettings.notFoundTitle')}</h1>
          <p className="page-subtitle">{t('channelSettings.notFoundSubtitle')}</p>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: typeof Settings }[] = [
    { id: 'general', label: t('channelSettings.general'), icon: Settings },
    { id: 'review', label: t('channelSettings.tabReview'), icon: ClipboardCheck },
    { id: 'sharing', label: t('channelSettings.tabSharing'), icon: Users },
  ];

  const selectTab = (tab: TabId) => {
    setActiveTab(tab);
    if (tab === 'general') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab }, { replace: true });
    }
  };

  return (
    <div className="document-channel-settings">
      <Link to={`/articles/channels/${channelId}`} className="document-channel-settings-back">
        <ArrowLeft size={18} />
        <span>{t('channelSettings.backToChannel')}</span>
      </Link>

      <div className="page-header">
        <h1>{t('channelSettings.pageTitle')}</h1>
        <p className="page-subtitle">{t('channelSettings.configureSubtitle', { name: channelName })}</p>
      </div>

      <div className="document-channel-settings-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`document-channel-settings-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => selectTab(tab.id)}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="document-channel-settings-form">
        {activeTab === 'general' && (
          <section className="document-channel-settings-section">
            <h2>{t('channelSettings.general')}</h2>
            <p className="document-channel-settings-hint">{t('channelSettings.generalHint')}</p>
            <div className="document-channel-settings-field">
              <label htmlFor="ac-settings-name">{t('channelSettings.name')}</label>
              <input
                id="ac-settings-name"
                type="text"
                value={nameField}
                onChange={(e) => setNameField(e.target.value)}
                placeholder={t('channelSettings.namePlaceholder')}
              />
            </div>
            <div className="document-channel-settings-field">
              <label htmlFor="ac-settings-description">{t('channelSettings.description')}</label>
              <textarea
                id="ac-settings-description"
                value={descriptionField}
                onChange={(e) => setDescriptionField(e.target.value)}
                placeholder={t('channelSettings.descPlaceholder')}
                rows={3}
              />
            </div>
            <div className="document-channel-settings-field">
              <label htmlFor="ac-settings-parent">{t('channelSettings.parent')}</label>
              <select
                id="ac-settings-parent"
                value={parentIdField}
                onChange={(e) => setParentIdField(e.target.value)}
              >
                {moveParentChoices.map((p) => (
                  <option key={p.id || 'root'} value={p.id}>
                    {'—'.repeat(p.depth)} {p.name}
                  </option>
                ))}
              </select>
              <p className="document-channel-settings-hint">{t('channelSettings.parentHint')}</p>
            </div>
            <div className="document-channel-settings-actions">
              <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? t('channelSettings.saving') : t('channelSettings.save')}
              </button>
            </div>
          </section>
        )}

        {activeTab === 'review' && (
          <section className="document-channel-settings-section ac-review-settings">
            <div className="ac-review-settings-header">
              <div>
                <h2>{t('channelSettings.tabReview')}</h2>
                <p className="document-channel-settings-hint ac-review-settings-lead">{t('channelSettings.reviewHint')}</p>
              </div>
              <div
                className={`ac-review-status ${reviewReady ? 'ac-review-status--ready' : 'ac-review-status--warn'}`}
                role="status"
              >
                {reviewReady ? (
                  <>
                    <CheckCircle2 size={16} aria-hidden />
                    <span>{t('channelSettings.reviewStatusReady', { model: selectedReviewModelName })}</span>
                  </>
                ) : (
                  <span>{t('channelSettings.reviewStatusMissingModel')}</span>
                )}
              </div>
            </div>

            <div className="ac-review-card">
              <h3 className="ac-review-card-title">{t('channelSettings.reviewModel')}</h3>
              <div className="document-channel-settings-field ac-review-card-field">
                <select
                  id="ac-settings-review-model"
                  className="ac-review-model-select"
                  value={reviewModelId}
                  onChange={(e) => setReviewModelId(e.target.value)}
                  disabled={modelsLoading}
                  aria-label={t('channelSettings.reviewModel')}
                >
                  <option value="">{t('channelSettings.reviewModelNone')}</option>
                  {llmModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <p className="document-channel-settings-hint">{t('channelSettings.reviewModelHint')}</p>
              </div>
            </div>

            <div className="ac-review-card">
              <div className="ac-review-card-title-row">
                <h3 className="ac-review-card-title">{t('channelSettings.reviewPrompt')}</h3>
                <div className="ac-review-template-group">
                  <span className="ac-review-template-label">{t('channelSettings.reviewApplyTemplate')}</span>
                  <div className="ac-review-template-buttons">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => applyReviewPreset('builtin')}
                    >
                      {t('channelSettings.reviewPresetBuiltin')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm ac-review-template-btn--accent"
                      onClick={() => applyReviewPreset('competitive_analysis')}
                    >
                      {t('channelSettings.reviewPresetCompetitive')}
                    </button>
                  </div>
                </div>
              </div>
              <div className="document-channel-settings-field ac-review-card-field">
                <textarea
                  id="ac-settings-review-prompt"
                  className="ac-review-prompt-textarea"
                  value={reviewPrompt}
                  onChange={(e) => setReviewPrompt(e.target.value)}
                  placeholder={t('channelSettings.reviewPromptPlaceholder')}
                  rows={12}
                />
                <p className="document-channel-settings-hint">{t('channelSettings.reviewPromptHint')}</p>
              </div>
            </div>

            <div className="ac-review-card">
              <div className="ac-review-card-title-row">
                <div>
                  <h3 className="ac-review-card-title">{t('channelSettings.reviewCriteria')}</h3>
                  {reviewCriteria.length > 0 && (
                    <p className="ac-review-criteria-count">
                      {t('channelSettings.reviewCriteriaCustomCount', { count: reviewCriteria.length })}
                    </p>
                  )}
                </div>
                <div className="document-channel-settings-inline-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setReviewCriteria(builtinCriteria.map((c) => ({ ...c })))}
                  >
                    {t('channelSettings.reviewCriteriaDefaults')}
                  </button>
                  {reviewCriteria.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setReviewCriteria([])}
                    >
                      {t('channelSettings.reviewCriteriaClear')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      setReviewCriteria((prev) => [...prev, { id: '', label: '', description: '' }])
                    }
                  >
                    <Plus size={14} aria-hidden />
                    {t('channelSettings.reviewCriteriaAdd')}
                  </button>
                </div>
              </div>

              {reviewCriteria.length === 0 ? (
                <div className="ac-review-builtin-preview">
                  <p className="ac-review-builtin-preview-title">{t('channelSettings.reviewBuiltinPreviewTitle')}</p>
                  <ul className="ac-review-builtin-list">
                    {builtinCriteria.map((c) => (
                      <li key={c.id}>
                        <span className="ac-review-builtin-id">{c.id}</span>
                        <span className="ac-review-builtin-label">{c.label}</span>
                        {c.description ? (
                          <span className="ac-review-builtin-desc">{c.description}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <p className="document-channel-settings-hint">{t('channelSettings.reviewCriteriaEmpty')}</p>
                </div>
              ) : (
                <div className="ac-review-criteria-table-wrap">
                  <table className="ac-review-criteria-table">
                    <thead>
                      <tr>
                        <th>{t('channelSettings.reviewColId')}</th>
                        <th>{t('channelSettings.reviewColLabel')}</th>
                        <th>{t('channelSettings.reviewColDescription')}</th>
                        <th aria-hidden />
                      </tr>
                    </thead>
                    <tbody>
                      {reviewCriteria.map((c, idx) => (
                        <tr key={idx}>
                          <td>
                            <input
                              type="text"
                              className="ac-review-criteria-input"
                              placeholder="scope"
                              value={c.id}
                              onChange={(e) => {
                                const next = [...reviewCriteria];
                                next[idx] = { ...next[idx], id: e.target.value };
                                setReviewCriteria(next);
                              }}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="ac-review-criteria-input"
                              placeholder={t('channelSettings.reviewCriterionLabel')}
                              value={c.label}
                              onChange={(e) => {
                                const next = [...reviewCriteria];
                                next[idx] = { ...next[idx], label: e.target.value };
                                setReviewCriteria(next);
                              }}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="ac-review-criteria-input ac-review-criteria-input--wide"
                              placeholder={t('channelSettings.reviewCriterionDesc')}
                              value={c.description ?? ''}
                              onChange={(e) => {
                                const next = [...reviewCriteria];
                                next[idx] = { ...next[idx], description: e.target.value };
                                setReviewCriteria(next);
                              }}
                            />
                          </td>
                          <td className="ac-review-criteria-actions">
                            <button
                              type="button"
                              className="ac-review-criteria-remove"
                              onClick={() => setReviewCriteria((prev) => prev.filter((_, i) => i !== idx))}
                              aria-label={t('channelSettings.reviewCriterionRemove')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="document-channel-settings-hint ac-review-criteria-foot">{t('channelSettings.reviewCriteriaHint')}</p>
            </div>

            <div className="document-channel-settings-actions ac-review-save-bar">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleSaveReview()}
                disabled={savingReview}
              >
                {savingReview ? t('channelSettings.saving') : t('channelSettings.save')}
              </button>
            </div>
          </section>
        )}

        {activeTab === 'sharing' && channelId && (
          <>
            <p className="document-channel-settings-hint">{t('channelSettings.sharingHint')}</p>
            <ResourceSharePanel
              resourceType={RESOURCE_TYPES.articleChannel}
              resourceId={channelId}
              title={t('channelSettings.sharingHeading')}
            />
          </>
        )}
      </div>
    </div>
  );
}
