import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, Settings, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useEnsureMediaChannels } from '../../contexts/MediaChannelsContext';
import { updateMediaChannel } from '../../data/mediaChannelsApi';
import {
  findChannel,
  flattenChannels,
  getDescendantIds,
  getDocumentChannelName,
  type ChannelNode,
} from '../../data/channelUtils';
import { fetchAllModels, type ApiModelResponse } from '../../data/modelsApi';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
import '../documents/DocumentChannelSettings.scss';
import '../documents/DocumentChannel.scss';

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

type TabId = 'general' | 'sharing';

export function MediaChannelSettings() {
  const { t } = useTranslation('media');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const { channelId = '' } = useParams<{ channelId: string }>();
  const { channels, loading, error, refetch } = useEnsureMediaChannels();

  const channel = channels.length > 0 && channelId ? findChannel(channels, channelId) : null;
  const channelName = getDocumentChannelName(channels, channelId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState('');
  const [metadataSchemaText, setMetadataSchemaText] = useState('[]');
  const [defaultImageModelId, setDefaultImageModelId] = useState('');
  const [defaultVideoModelId, setDefaultVideoModelId] = useState('');
  const [imageModels, setImageModels] = useState<ApiModelResponse[]>([]);
  const [videoModels, setVideoModels] = useState<ApiModelResponse[]>([]);
  const [chatModels, setChatModels] = useState<ApiModelResponse[]>([]);
  const [extractionModelId, setExtractionModelId] = useState('');
  const [extractionSchemaText, setExtractionSchemaText] = useState('');
  const [extractionMaxInstances, setExtractionMaxInstances] = useState('100');
  const [modelsLoading, setModelsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>(tabParam === 'sharing' ? 'sharing' : 'general');

  useEffect(() => {
    if (tabParam === 'sharing' || tabParam === 'general') setActiveTab(tabParam);
  }, [tabParam]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setModelsLoading(true);
      try {
        const [images, videos, chats] = await Promise.all([
          fetchAllModels({ api_kind: 'image-generate' }),
          fetchAllModels({ api_kind: 'video-generate' }),
          fetchAllModels({ api_kind: 'chat-completions' }),
        ]);
        if (!cancelled) {
          setImageModels(images);
          setVideoModels(videos);
          setChatModels(chats);
        }
      } catch {
        if (!cancelled) {
          setImageModels([]);
          setVideoModels([]);
          setChatModels([]);
        }
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!channel) return;
    setName(channel.name);
    setDescription(channel.description || '');
    const p = findParentId(channels, channelId);
    setParentId(p === undefined ? '' : p ?? '');
    setMetadataSchemaText(JSON.stringify(channel.metadata_schema || [], null, 2));
    setDefaultImageModelId(channel.default_image_model_id || '');
    setDefaultVideoModelId(channel.default_video_model_id || '');
    setExtractionModelId(channel.extraction_model_id || '');
    setExtractionSchemaText(channel.extraction_schema ? JSON.stringify(channel.extraction_schema, null, 2) : '');
    setExtractionMaxInstances(String(channel.object_type_extraction_max_instances ?? 100));
  }, [channel, channels, channelId]);

  const parentOptions = useMemo(() => flattenForParent(channels), [channels]);
  const moveParentChoices = useMemo(() => {
    const root = t('channels.parentNone');
    if (!channelId) return [{ id: '', name: root, depth: 0 }];
    const exclude = getDescendantIds(channels, channelId);
    return [{ id: '', name: root, depth: 0 }, ...parentOptions.filter((p) => !exclude.has(p.id))];
  }, [channels, channelId, parentOptions, t]);

  const onSave = useCallback(async () => {
    if (!channelId || !channel) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error(t('settings.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      let metadata_schema = null;
      try {
        metadata_schema = JSON.parse(metadataSchemaText);
      } catch {
        toast.error(t('settings.invalidSchema'));
        setSaving(false);
        return;
      }
      let extraction_schema: unknown = null;
      const exTrim = extractionSchemaText.trim();
      if (exTrim) {
        try {
          extraction_schema = JSON.parse(exTrim);
        } catch {
          toast.error('提取字段 JSON 格式有误');
          setSaving(false);
          return;
        }
      }
      const maxN = Number.parseInt(extractionMaxInstances, 10);
      await updateMediaChannel(channelId, {
        name: trimmedName,
        description: description.trim() || null,
        parent_id: parentId || null,
        metadata_schema,
        default_image_model_id: defaultImageModelId.trim() || null,
        default_video_model_id: defaultVideoModelId.trim() || null,
        extraction_model_id: extractionModelId.trim() || null,
        extraction_schema: extraction_schema as never,
        object_type_extraction_max_instances: Number.isFinite(maxN) ? maxN : 100,
      });
      await refetch();
      toast.success(t('settings.saved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [
    channel,
    channelId,
    defaultImageModelId,
    defaultVideoModelId,
    description,
    metadataSchemaText,
    extractionModelId,
    extractionSchemaText,
    extractionMaxInstances,
    name,
    parentId,
    refetch,
    t,
  ]);

  const selectTab = (tab: TabId) => {
    setActiveTab(tab);
    if (tab === 'general') setSearchParams({}, { replace: true });
    else setSearchParams({ tab }, { replace: true });
  };

  if (loading) {
    return (
      <div className="document-channel-settings">
        <div className="document-detail-loading">
          <Loader2 size={24} className="documents-loading-spinner" />
          <span>{t('common.loading')}</span>
        </div>
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
        <Link to="/media/channels" className="document-channel-settings-back">
          <ArrowLeft size={18} />
          <span>{t('channel.backToChannels')}</span>
        </Link>
        <div className="page-header">
          <h1>{t('channel.notFoundTitle')}</h1>
          <p className="page-subtitle">{t('channel.notFoundSubtitle')}</p>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: typeof Settings }[] = [
    { id: 'general', label: t('settings.tabGeneral'), icon: Settings },
    { id: 'sharing', label: t('settings.tabSharing'), icon: Users },
  ];

  return (
    <div className="document-channel-settings">
      <Link to={`/media/channels/${channelId}`} className="document-channel-settings-back">
        <ArrowLeft size={18} />
        <span>{t('settings.backToCollection')}</span>
      </Link>

      <div className="page-header">
        <h1>{t('settings.title')}</h1>
        <p className="page-subtitle">{t('settings.configureSubtitle', { name: channelName })}</p>
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
          <>
            <section className="document-channel-settings-section">
              <h2>{t('settings.sectionGeneral')}</h2>
              <p className="document-channel-settings-hint">{t('settings.generalHint')}</p>
              <div className="document-channel-settings-field">
                <label htmlFor="media-settings-name">{t('channels.name')}</label>
                <input
                  id="media-settings-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('channels.namePlaceholder')}
                  required
                />
              </div>
              <div className="document-channel-settings-field">
                <label htmlFor="media-settings-desc">{t('channels.description')}</label>
                <textarea
                  id="media-settings-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('channels.descPlaceholder')}
                  rows={3}
                />
              </div>
              <div className="document-channel-settings-field">
                <label htmlFor="media-settings-parent">{t('channels.parent')}</label>
                <select id="media-settings-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                  {moveParentChoices.map((p) => (
                    <option key={p.id || 'root'} value={p.id}>
                      {'—'.repeat(p.depth)} {p.name}
                    </option>
                  ))}
                </select>
                <p className="document-channel-settings-hint">{t('settings.parentHint')}</p>
              </div>
            </section>

            <section className="document-channel-settings-section">
              <h2>{t('settings.sectionMetadata')}</h2>
              <p className="document-channel-settings-hint">{t('settings.metadataHint')}</p>
              <div className="document-channel-settings-field">
                <label htmlFor="media-settings-schema">{t('settings.metadataSchema')}</label>
                <textarea
                  id="media-settings-schema"
                  value={metadataSchemaText}
                  onChange={(e) => setMetadataSchemaText(e.target.value)}
                  rows={8}
                  spellCheck={false}
                />
              </div>
            </section>

            <section className="document-channel-settings-section">
              <h2>{t('settings.sectionGeneration')}</h2>
              <p className="document-channel-settings-hint">{t('settings.generationHint')}</p>
              <div className="document-channel-settings-field">
                <label htmlFor="media-settings-image-model">{t('settings.defaultImageModel')}</label>
                <select
                  id="media-settings-image-model"
                  value={defaultImageModelId}
                  onChange={(e) => setDefaultImageModelId(e.target.value)}
                  disabled={modelsLoading}
                >
                  <option value="">{t('settings.modelNone')}</option>
                  {imageModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.id})
                    </option>
                  ))}
                </select>
              </div>
              <div className="document-channel-settings-field">
                <label htmlFor="media-settings-video-model">{t('settings.defaultVideoModel')}</label>
                <select
                  id="media-settings-video-model"
                  value={defaultVideoModelId}
                  onChange={(e) => setDefaultVideoModelId(e.target.value)}
                  disabled={modelsLoading}
                >
                  <option value="">{t('settings.modelNone')}</option>
                  {videoModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.id})
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section className="document-channel-settings-section">
              <h2>结构化提取</h2>
              <p className="document-channel-settings-hint">
                配置提取模型与字段后,可在媒体详情页基于转写稿/摘要一键抽取结构化元数据(主讲人、涉及产品、关键结论等)。
              </p>
              <div className="document-channel-settings-field">
                <label htmlFor="media-settings-extraction-model">提取模型</label>
                <select
                  id="media-settings-extraction-model"
                  value={extractionModelId}
                  onChange={(e) => setExtractionModelId(e.target.value)}
                  disabled={modelsLoading}
                >
                  <option value="">（未设置）</option>
                  {chatModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
                  ))}
                </select>
                <p className="document-channel-settings-hint">用于抽取的对话模型(需 chat-completions)。</p>
              </div>
              <div className="document-channel-settings-field">
                <label htmlFor="media-settings-extraction-schema">提取字段(JSON)</label>
                <textarea
                  id="media-settings-extraction-schema"
                  value={extractionSchemaText}
                  onChange={(e) => setExtractionSchemaText(e.target.value)}
                  rows={10}
                  spellCheck={false}
                  placeholder='[{"key":"主讲人","label":"主讲人","type":"string"},{"key":"关键结论","label":"关键结论","type":"array"}]'
                />
                <p className="document-channel-settings-hint">
                  数组形式,每项 {'{key,label,type}'};type 支持 string / array / date / integer / number / boolean / enum。
                </p>
              </div>
              <div className="document-channel-settings-field">
                <label htmlFor="media-settings-extraction-max">对象类型抽取上限</label>
                <input
                  id="media-settings-extraction-max"
                  type="number"
                  value={extractionMaxInstances}
                  onChange={(e) => setExtractionMaxInstances(e.target.value)}
                  style={{ maxWidth: 160 }}
                />
              </div>
            </section>

            <div className="document-channel-settings-actions">
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void onSave()}>
                {saving ? <Loader2 size={16} className="documents-loading-spinner" /> : null}
                <span>{saving ? t('settings.saving') : t('settings.save')}</span>
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => navigate(`/media/channels/${channelId}`)}>
                {t('common.cancel')}
              </button>
            </div>
          </>
        )}

        {activeTab === 'sharing' && channel && (
          <section className="document-channel-settings-section">
            <h2>{t('settings.tabSharing')}</h2>
            <p className="document-channel-settings-hint">{t('settings.sharingHint')}</p>
            <ResourceSharePanel resourceType={RESOURCE_TYPES.mediaChannel} resourceId={channel.id} />
          </section>
        )}
      </div>
    </div>
  );
}
