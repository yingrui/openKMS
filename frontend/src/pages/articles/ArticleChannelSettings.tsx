import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Settings, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useArticleChannels } from '../../contexts/ArticleChannelsContext';
import {
  findChannel,
  flattenChannels,
  getDescendantIds,
  getDocumentChannelName,
  type ChannelNode,
} from '../../data/channelUtils';
import { updateArticleChannel } from '../../data/articleChannelsApi';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
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

type TabId = 'general' | 'sharing';

export function ArticleChannelSettings() {
  const { t } = useTranslation('articles');
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
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>(tabParam === 'sharing' ? 'sharing' : 'general');

  useEffect(() => {
    if (tabParam === 'sharing' || tabParam === 'general') {
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
    if (channel) {
      setNameField(channel.name || '');
      setDescriptionField(channel.description ?? '');
      const p = findParentId(channels, channelId);
      setParentIdField(p === undefined ? '' : p ?? '');
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
