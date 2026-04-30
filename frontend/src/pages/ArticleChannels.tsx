import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Folder, Plus, ArrowRightLeft, Trash2, GitMerge, ChevronUp, ChevronDown, Settings } from 'lucide-react';
import { useArticleChannels } from '../contexts/ArticleChannelsContext';
import {
  createArticleChannel,
  updateArticleChannel,
  deleteArticleChannel,
  mergeArticleChannels,
  reorderArticleChannel,
} from '../data/articleChannelsApi';
import { getDescendantIds, type ChannelNode } from '../data/channelUtils';
import { toast } from 'sonner';
import './DocumentChannels.css';

function flattenForParent(nodes: ChannelNode[], depth = 0): { id: string; name: string; depth: number }[] {
  const out: { id: string; name: string; depth: number }[] = [];
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, depth });
    if (n.children?.length) out.push(...flattenForParent(n.children, depth + 1));
  }
  return out;
}

export function ArticleChannels() {
  const { channels, loading, error, refetch } = useArticleChannels();
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createParentId, setCreateParentId] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = createName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createArticleChannel({
        name,
        description: createDescription.trim() || null,
        parent_id: createParentId || null,
      });
      setCreateName('');
      setCreateDescription('');
      setCreateParentId('');
      await refetch();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create channel');
    } finally {
      setCreating(false);
    }
  };

  const parentOptions = flattenForParent(channels);

  const getMoveParentOptions = (excludeChannelId: string) => {
    const exclude = getDescendantIds(channels, excludeChannelId);
    return [{ id: '', name: 'None (top-level)', depth: 0 }, ...parentOptions.filter((p) => !exclude.has(p.id))];
  };

  const getMergeTargetOptions = (sourceChannelId: string) => {
    const exclude = getDescendantIds(channels, sourceChannelId);
    return parentOptions.filter((p) => !exclude.has(p.id));
  };

  return (
    <div className="document-channels">
      <Link to="/articles" className="document-channels-back">
        <ArrowLeft size={18} />
        <span>Back to Articles</span>
      </Link>

      <div className="page-header">
        <h1>Article channels</h1>
        <p className="page-subtitle">
          Create and organize channels for articles. Use top-level channels and sub-channels like in Documents.
        </p>
      </div>

      {(error || createError) && (
        <div className="document-channels-error" role="alert">
          {createError || error}
        </div>
      )}

      <div className="document-channels-layout">
        <section className="document-channels-create">
          <h2>
            <Plus size={20} />
            New channel
          </h2>
          <form onSubmit={handleCreate} className="document-channels-form">
            <div className="document-channels-field">
              <label htmlFor="ac-channel-name">Name</label>
              <input
                id="ac-channel-name"
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Product guides, Release notes"
                required
              />
            </div>
            <div className="document-channels-field">
              <label htmlFor="ac-channel-description">Description</label>
              <textarea
                id="ac-channel-description"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
              />
            </div>
            <div className="document-channels-field">
              <label htmlFor="ac-channel-parent">Parent</label>
              <select
                id="ac-channel-parent"
                value={createParentId}
                onChange={(e) => setCreateParentId(e.target.value)}
              >
                <option value="">None (top-level)</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {'—'.repeat(p.depth)} {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={creating || !createName.trim()}>
              {creating ? 'Creating…' : 'Create'}
            </button>
          </form>
        </section>

        <section className="document-channels-list">
          <h2>
            <Folder size={20} />
            Channels
          </h2>
          {loading ? (
            <p className="document-channels-loading">Loading…</p>
          ) : channels.length === 0 ? (
            <div className="document-channels-empty">
              <Folder size={40} />
              <p>No channels yet</p>
              <p className="document-channels-empty-hint">
                Create your first channel using the form on the left. Use &quot;None&quot; for a top-level channel.
              </p>
            </div>
          ) : (
            <ul className="document-channels-tree">
              {channels.map((ch, index) => (
                <ChannelItem
                  key={ch.id}
                  node={ch}
                  depth={0}
                  siblingIndex={index}
                  siblingsCount={channels.length}
                  refetch={refetch}
                  getMoveParentOptions={getMoveParentOptions}
                  getMergeTargetOptions={getMergeTargetOptions}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ChannelItem({
  node,
  depth,
  siblingIndex,
  siblingsCount,
  refetch,
  getMoveParentOptions,
  getMergeTargetOptions,
}: {
  node: ChannelNode;
  depth: number;
  siblingIndex: number;
  siblingsCount: number;
  refetch: () => Promise<void>;
  getMoveParentOptions: (excludeId: string) => { id: string; name: string; depth: number }[];
  getMergeTargetOptions: (sourceId: string) => { id: string; name: string; depth: number }[];
}) {
  const [moving, setMoving] = useState(false);
  const [moveParentId, setMoveParentId] = useState('');
  const [moveLoading, setMoveLoading] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeIncludeDescendants, setMergeIncludeDescendants] = useState(true);
  const [mergeLoading, setMergeLoading] = useState(false);

  const canMoveUp = siblingIndex > 0;
  const canMoveDown = siblingIndex < siblingsCount - 1;

  const handleReorder = async (direction: 'up' | 'down') => {
    try {
      await reorderArticleChannel(node.id, direction);
      await refetch();
      toast.success(`Moved "${node.name}" ${direction}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reorder channel');
    }
  };

  const moveOptions = getMoveParentOptions(node.id);
  const mergeTargetOptions = getMergeTargetOptions(node.id);

  const handleMoveConfirm = async () => {
    const newParent = moveParentId || null;
    if (newParent === node.id) return;
    setMoveLoading(true);
    try {
      await updateArticleChannel(node.id, { parent_id: newParent });
      await refetch();
      toast.success(`Moved "${node.name}"`);
      setMoving(false);
      setMoveParentId('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to move channel');
    } finally {
      setMoveLoading(false);
    }
  };

  const handleMoveCancel = () => {
    setMoving(false);
    setMoveParentId('');
  };

  const handleDeleteClick = () => setDeleteConfirming(true);
  const handleDeleteCancel = () => setDeleteConfirming(false);
  const handleDeleteConfirm = async () => {
    setDeleteLoading(true);
    try {
      await deleteArticleChannel(node.id);
      await refetch();
      toast.success(`Deleted "${node.name}"`);
      setDeleteConfirming(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete channel');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleMergeConfirm = async () => {
    if (!mergeTargetId) return;
    setMergeLoading(true);
    try {
      await mergeArticleChannels({
        source_channel_id: node.id,
        target_channel_id: mergeTargetId,
        include_descendants: mergeIncludeDescendants,
      });
      await refetch();
      toast.success(`Merged "${node.name}" into target channel`);
      setMerging(false);
      setMergeTargetId('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to merge channels');
    } finally {
      setMergeLoading(false);
    }
  };

  const handleMergeCancel = () => {
    setMerging(false);
    setMergeTargetId('');
  };

  return (
    <li style={{ paddingLeft: depth * 20 }} className="document-channels-tree-li">
      <span className="document-channels-tree-item">
        <Folder size={16} />
        {node.name}
        <span className="document-channels-tree-id">{node.id}</span>
        <span className="document-channels-tree-actions">
          <button
            type="button"
            className="document-channels-tree-action"
            title="Move up"
            aria-label="Move channel up"
            onClick={() => void handleReorder('up')}
            disabled={!canMoveUp}
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            className="document-channels-tree-action"
            title="Move down"
            aria-label="Move channel down"
            onClick={() => void handleReorder('down')}
            disabled={!canMoveDown}
          >
            <ChevronDown size={14} />
          </button>
          <Link
            to={`/articles/channels/${node.id}/settings`}
            className="document-channels-tree-action"
            title="Settings"
          >
            <Settings size={14} />
          </Link>
          <button
            type="button"
            className="document-channels-tree-action"
            title="Move"
            onClick={() => setMoving(true)}
          >
            <ArrowRightLeft size={14} />
          </button>
          <button
            type="button"
            className="document-channels-tree-action"
            title="Merge into..."
            onClick={() => setMerging(true)}
            disabled={mergeTargetOptions.length === 0}
          >
            <GitMerge size={14} />
          </button>
          <button
            type="button"
            className="document-channels-tree-action document-channels-tree-action-delete"
            title="Delete"
            onClick={handleDeleteClick}
          >
            <Trash2 size={14} />
          </button>
        </span>
      </span>
      {deleteConfirming && (
        <div className="document-channels-confirm-bar">
          <span>Delete &quot;{node.name}&quot;? This cannot be undone.</span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleDeleteConfirm()}
            disabled={deleteLoading}
          >
            {deleteLoading ? 'Deleting…' : 'Delete'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleDeleteCancel}>
            Cancel
          </button>
        </div>
      )}
      {merging && (
        <div className="document-channels-merge-bar">
          <select
            value={mergeTargetId}
            onChange={(e) => setMergeTargetId(e.target.value)}
            className="document-channels-move-select"
            aria-label="Target channel"
          >
            <option value="">Select target channel</option>
            {mergeTargetOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {'—'.repeat(p.depth)} {p.name}
              </option>
            ))}
          </select>
          <label className="document-channels-merge-check">
            <input
              type="checkbox"
              checked={mergeIncludeDescendants}
              onChange={(e) => setMergeIncludeDescendants(e.target.checked)}
            />
            <span>Include sub-channels</span>
          </label>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleMergeConfirm()}
            disabled={mergeLoading || !mergeTargetId}
          >
            {mergeLoading ? 'Merging…' : 'Merge'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleMergeCancel}>
            Cancel
          </button>
        </div>
      )}
      {moving && (
        <div className="document-channels-move-bar">
          <select
            value={moveParentId}
            onChange={(e) => setMoveParentId(e.target.value)}
            className="document-channels-move-select"
          >
            {moveOptions.map((p) => (
              <option key={p.id || 'root'} value={p.id}>
                {'—'.repeat(p.depth)} {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleMoveConfirm()}
            disabled={moveLoading}
          >
            {moveLoading ? 'Moving…' : 'Move'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleMoveCancel}>
            Cancel
          </button>
        </div>
      )}
      {node.children?.length ? (
        <ul className="document-channels-tree">
          {node.children.map((ch, index) => (
            <ChannelItem
              key={ch.id}
              node={ch}
              depth={depth + 1}
              siblingIndex={index}
              siblingsCount={node.children?.length ?? 0}
              refetch={refetch}
              getMoveParentOptions={getMoveParentOptions}
              getMergeTargetOptions={getMergeTargetOptions}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
