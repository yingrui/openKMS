import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useArticleChannels } from '../contexts/ArticleChannelsContext';
import {
  findChannel,
  flattenChannels,
  getDescendantIds,
  getDocumentChannelName,
  type ChannelNode,
} from '../data/channelUtils';
import { updateArticleChannel } from '../data/articleChannelsApi';
import './DocumentChannelSettings.css';

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

export function ArticleChannelSettings() {
  const navigate = useNavigate();
  const { channelId = '' } = useParams<{ channelId: string }>();
  const { channels, loading, error, refetch } = useArticleChannels();

  const channel = channels.length > 0 && channelId ? findChannel(channels, channelId) : null;
  const channelName = getDocumentChannelName(channels, channelId);

  const [nameField, setNameField] = useState('');
  const [descriptionField, setDescriptionField] = useState('');
  const [parentIdField, setParentIdField] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const parentOptions = useMemo(() => flattenForParent(channels), [channels]);

  const moveParentChoices = useMemo(() => {
    if (!channelId) return [{ id: '', name: 'None (top-level)', depth: 0 }];
    const exclude = getDescendantIds(channels, channelId);
    return [{ id: '', name: 'None (top-level)', depth: 0 }, ...parentOptions.filter((p) => !exclude.has(p.id))];
  }, [channels, channelId, parentOptions]);

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
      toast.error('Name is required');
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
      toast.success('Channel settings saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }, [channelId, channel, nameField, descriptionField, parentIdField, refetch]);

  if (!channelId) return null;

  if (loading) {
    return (
      <div className="document-channel-settings">
        <p className="page-subtitle">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="document-channel-settings">
        <p className="page-subtitle" style={{ color: 'var(--color-error)' }}>{error}</p>
      </div>
    );
  }

  const channelIds = new Set(flattenChannels(channels).map((c) => c.id));
  if (!channelIds.has(channelId)) {
    return (
      <div className="document-channel-settings">
        <Link to="/articles/channels" className="document-channel-settings-back">
          <ArrowLeft size={18} />
          <span>Back to channel management</span>
        </Link>
        <div className="page-header">
          <h1>Channel not found</h1>
          <p className="page-subtitle">This channel does not exist or you do not have access.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="document-channel-settings">
      <Link to={`/articles/channels/${channelId}`} className="document-channel-settings-back">
        <ArrowLeft size={18} />
        <span>Back to channel</span>
      </Link>

      <div className="page-header">
        <h1>Channel settings</h1>
        <p className="page-subtitle">Configure {channelName}</p>
      </div>

      <div className="document-channel-settings-form">
        <section className="document-channel-settings-section">
          <h2>General</h2>
          <p className="document-channel-settings-hint">
            These channels only organize articles. Merge, reorder, and delete stay on the manage channels screen.
          </p>
          <div className="document-channel-settings-field">
            <label htmlFor="ac-settings-name">Name</label>
            <input
              id="ac-settings-name"
              type="text"
              value={nameField}
              onChange={(e) => setNameField(e.target.value)}
              placeholder="Channel name"
            />
          </div>
          <div className="document-channel-settings-field">
            <label htmlFor="ac-settings-description">Description</label>
            <textarea
              id="ac-settings-description"
              value={descriptionField}
              onChange={(e) => setDescriptionField(e.target.value)}
              placeholder="Optional description"
              rows={3}
            />
          </div>
          <div className="document-channel-settings-field">
            <label htmlFor="ac-settings-parent">Parent</label>
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
            <p className="document-channel-settings-hint">You cannot set a parent to this channel or its descendants.</p>
          </div>
        </section>

        <div className="document-channel-settings-actions">
          <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
